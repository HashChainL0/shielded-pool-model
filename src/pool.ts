import {
  AssetMismatchError,
  ChangeMismatchError,
  DoubleSpendError,
  DuplicateCommitmentError,
  InvalidInclusionProofError,
  InvalidRequestError,
  NullifierMismatchError,
  StaleRootError,
  ValueMismatchError,
  WrongKeyError,
} from "./errors.js";
import { isHash, randomBlinding, type Hash } from "./hash.js";
import {
  DEFAULT_DEPTH,
  DEFAULT_ROOT_HISTORY,
  MerkleTree,
  verifyMerkleProof,
  type MerkleProof,
} from "./merkle.js";
import {
  assertValidNote,
  commitment,
  deriveOwnerKey,
  nullifier,
  type Commitment,
  type Note,
  type Nullifier,
} from "./note.js";

export interface PoolOptions {
  readonly depth?: number;
  readonly rootHistorySize?: number;
}

export interface DepositResult {
  readonly leafIndex: number;
  readonly commitment: Commitment;
  /** Root after the insert. */
  readonly root: Hash;
}

/**
 * The private inputs of a withdrawal. In a real pool these never leave the
 * prover's device and a zero-knowledge proof stands in for them. In this model
 * the pool receives them and checks the same statements directly.
 */
export interface WithdrawWitness {
  readonly note: Note;
  readonly leafIndex: number;
  /** Sibling path of the spent note under `request.root`. */
  readonly siblings: readonly Hash[];
  readonly spendingKey: Hash;
  /** The change note, when the withdrawal does not spend the whole note. */
  readonly change?: Note;
}

/** Public fields of a withdrawal plus the witness the model checks. */
export interface WithdrawRequest {
  /** A root the pool still accepts. The note is proven to be under it. */
  readonly root: Hash;
  readonly nullifier: Nullifier;
  readonly assetId: bigint;
  /** Paid out of the pool. Must be greater than zero. */
  readonly amount: bigint;
  /** Paid to the relayer or pool operator. May be zero. */
  readonly fee: bigint;
  /** Opaque label for where the amount goes. The model does not interpret it. */
  readonly recipient: string;
  /** Commitment of the change note, or `null` when the whole note is spent. */
  readonly changeCommitment: Commitment | null;
  readonly witness: WithdrawWitness;
}

export interface WithdrawResult {
  readonly nullifier: Nullifier;
  readonly amount: bigint;
  readonly fee: bigint;
  readonly recipient: string;
  /** Leaf index of the change commitment, or `null` if there is none. */
  readonly changeLeafIndex: number | null;
  /** Root after the withdrawal. */
  readonly root: Hash;
}

/**
 * Note-based pool. `deposit` takes public value in and appends a commitment.
 * `withdraw` checks a request, publishes the nullifier, appends the change
 * commitment and pays value out. The checks listed in `docs/MODEL.md` stand in
 * for a zero-knowledge proof. Nothing here is private.
 */
export class Pool {
  private readonly tree: MerkleTree;
  private readonly spent = new Set<Nullifier>();
  private readonly known = new Set<Commitment>();
  private readonly balances = new Map<bigint, bigint>();
  private readonly fees = new Map<bigint, bigint>();

  constructor(options: PoolOptions = {}) {
    this.tree = new MerkleTree({
      depth: options.depth ?? DEFAULT_DEPTH,
      rootHistorySize: options.rootHistorySize ?? DEFAULT_ROOT_HISTORY,
    });
  }

  get depth(): number {
    return this.tree.depth;
  }

  /** Number of commitments in the tree. */
  get size(): number {
    return this.tree.size;
  }

  get nullifierCount(): number {
    return this.spent.size;
  }

  root(): Hash {
    return this.tree.root();
  }

  recentRoots(): readonly Hash[] {
    return this.tree.recentRoots();
  }

  isKnownRoot(root: Hash): boolean {
    return this.tree.isKnownRoot(root);
  }

  isSpent(n: Nullifier): boolean {
    return this.spent.has(n);
  }

  /** Public value held for an asset: deposits minus amounts and fees paid out. */
  balanceOf(assetId: bigint): bigint {
    return this.balances.get(assetId) ?? 0n;
  }

  feesCollected(assetId: bigint): bigint {
    return this.fees.get(assetId) ?? 0n;
  }

  /** Inclusion proof against the current root. */
  proveInclusion(leafIndex: number): MerkleProof {
    return this.tree.prove(leafIndex);
  }

  deposit(note: Note): DepositResult {
    assertValidNote(note);
    const c = commitment(note);
    this.insertCommitment(c);
    this.credit(this.balances, note.assetId, note.value);
    const leafIndex = this.tree.size - 1;
    return { leafIndex, commitment: c, root: this.tree.root() };
  }

  withdraw(request: WithdrawRequest): WithdrawResult {
    const { witness } = request;
    this.checkShape(request);

    if (!this.tree.isKnownRoot(request.root)) throw new StaleRootError();
    if (this.spent.has(request.nullifier)) throw new DoubleSpendError();

    assertValidNote(witness.note);
    if (deriveOwnerKey(witness.spendingKey) !== witness.note.ownerKey) throw new WrongKeyError();

    const spentCommitment = commitment(witness.note);
    const inclusion: MerkleProof = {
      leaf: spentCommitment,
      index: witness.leafIndex,
      siblings: witness.siblings,
      root: request.root,
    };
    if (!verifyMerkleProof(inclusion, this.tree.depth)) throw new InvalidInclusionProofError();

    if (nullifier(witness.note, witness.spendingKey, witness.leafIndex) !== request.nullifier) {
      throw new NullifierMismatchError();
    }

    if (witness.note.assetId !== request.assetId) throw new AssetMismatchError();
    const changeValue = this.checkChange(request);
    if (witness.note.value !== request.amount + request.fee + changeValue) {
      throw new ValueMismatchError();
    }

    // All checks passed. Insert the change first: it is the only step that can
    // still fail (duplicate commitment, full tree), and it must not leave a
    // published nullifier behind.
    let changeLeafIndex: number | null = null;
    if (request.changeCommitment !== null) {
      this.insertCommitment(request.changeCommitment);
      changeLeafIndex = this.tree.size - 1;
    }
    this.spent.add(request.nullifier);
    this.debit(request.assetId, request.amount + request.fee);
    this.credit(this.fees, request.assetId, request.fee);

    return {
      nullifier: request.nullifier,
      amount: request.amount,
      fee: request.fee,
      recipient: request.recipient,
      changeLeafIndex,
      root: this.tree.root(),
    };
  }

  private checkShape(request: WithdrawRequest): void {
    if (!isHash(request.root) || !isHash(request.nullifier)) {
      throw new InvalidRequestError("root and nullifier must be 64 lowercase hex characters");
    }
    if (typeof request.amount !== "bigint" || request.amount <= 0n) {
      throw new InvalidRequestError("amount must be greater than zero");
    }
    if (typeof request.fee !== "bigint" || request.fee < 0n) {
      throw new InvalidRequestError("fee must not be negative");
    }
    if (request.recipient.length === 0) {
      throw new InvalidRequestError("recipient must not be empty");
    }
  }

  /** Returns the change value, zero when there is no change note. */
  private checkChange(request: WithdrawRequest): bigint {
    const change = request.witness.change;
    if (change === undefined) {
      if (request.changeCommitment !== null) {
        throw new ChangeMismatchError("change commitment given without a change note");
      }
      return 0n;
    }
    if (request.changeCommitment === null) {
      throw new ChangeMismatchError("change note given without a change commitment");
    }
    assertValidNote(change);
    if (change.assetId !== request.assetId) throw new AssetMismatchError();
    if (commitment(change) !== request.changeCommitment) {
      throw new ChangeMismatchError("change commitment does not match the change note");
    }
    return change.value;
  }

  private insertCommitment(c: Commitment): void {
    if (this.known.has(c)) throw new DuplicateCommitmentError();
    this.tree.insert(c);
    this.known.add(c);
  }

  private credit(map: Map<bigint, bigint>, assetId: bigint, value: bigint): void {
    map.set(assetId, (map.get(assetId) ?? 0n) + value);
  }

  private debit(assetId: bigint, value: bigint): void {
    this.balances.set(assetId, (this.balances.get(assetId) ?? 0n) - value);
  }
}

export interface BuildWithdrawParams {
  readonly note: Note;
  readonly leafIndex: number;
  readonly spendingKey: Hash;
  readonly recipient: string;
  readonly amount: bigint;
  readonly fee?: bigint;
  /** Owner key of the change note. Defaults to the key derived from `spendingKey`. */
  readonly changeOwnerKey?: Hash;
  /** Blinding of the change note. Defaults to a random value. */
  readonly changeBlinding?: bigint;
}

export interface BuiltWithdrawal {
  readonly request: WithdrawRequest;
  /** The change note the wallet must remember, or `null`. */
  readonly change: Note | null;
}

/**
 * Wallet side helper: build a request against the pool's current root. The
 * change value is whatever is left of the note after `amount` and `fee`.
 */
export function buildWithdrawRequest(pool: Pool, params: BuildWithdrawParams): BuiltWithdrawal {
  const fee = params.fee ?? 0n;
  const remaining = params.note.value - params.amount - fee;
  const proof = pool.proveInclusion(params.leafIndex);
  const change: Note | null =
    remaining > 0n
      ? {
          value: remaining,
          assetId: params.note.assetId,
          ownerKey: params.changeOwnerKey ?? deriveOwnerKey(params.spendingKey),
          blinding: params.changeBlinding ?? randomBlinding(),
        }
      : null;
  const witness: WithdrawWitness = {
    note: params.note,
    leafIndex: params.leafIndex,
    siblings: proof.siblings,
    spendingKey: params.spendingKey,
    ...(change !== null ? { change } : {}),
  };
  const request: WithdrawRequest = {
    root: proof.root,
    nullifier: nullifier(params.note, params.spendingKey, params.leafIndex),
    assetId: params.note.assetId,
    amount: params.amount,
    fee,
    recipient: params.recipient,
    changeCommitment: change !== null ? commitment(change) : null,
    witness,
  };
  return { request, change };
}
