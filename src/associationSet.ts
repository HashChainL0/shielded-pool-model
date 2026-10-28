import { NotInAssociationSetError } from "./errors.js";
import { isHash, type Hash } from "./hash.js";
import { DEFAULT_DEPTH, MerkleTree, verifyMerkleProof } from "./merkle.js";
import type { Commitment } from "./note.js";

/** Membership evidence for one label under one association root. */
export interface AssociationEvidence {
  readonly root: Hash;
  readonly index: number;
  readonly siblings: readonly Hash[];
}

/**
 * An allow-list of deposit commitments, kept as its own Merkle tree. Whoever
 * curates the list publishes its root. A withdrawal can show that the deposit
 * its funds came from is on the list, without saying which entry it is. The pool
 * decides which published roots it accepts. Curation policy is out of scope.
 */
export class AssociationSet {
  private readonly tree: MerkleTree;
  private readonly indexes = new Map<Commitment, number>();

  constructor(options: { readonly depth?: number } = {}) {
    this.tree = new MerkleTree({ depth: options.depth ?? DEFAULT_DEPTH, rootHistorySize: 1 });
  }

  get depth(): number {
    return this.tree.depth;
  }

  get size(): number {
    return this.tree.size;
  }

  root(): Hash {
    return this.tree.root();
  }

  has(label: Commitment): boolean {
    return this.indexes.has(label);
  }

  /** Add a deposit commitment. Adding an existing entry returns its index and changes nothing. */
  add(label: Commitment): number {
    if (!isHash(label)) throw new RangeError("label must be 64 lowercase hex characters");
    const existing = this.indexes.get(label);
    if (existing !== undefined) return existing;
    const index = this.tree.insert(label);
    this.indexes.set(label, index);
    return index;
  }

  /** Membership evidence against the current root. */
  prove(label: Commitment): AssociationEvidence {
    const index = this.indexes.get(label);
    if (index === undefined) throw new NotInAssociationSetError();
    const proof = this.tree.prove(index);
    return { root: proof.root, index, siblings: proof.siblings };
  }
}

/** Check evidence for a label. `depth`, when given, must match the path length. */
export function verifyAssociation(label: Commitment, evidence: AssociationEvidence, depth?: number): boolean {
  return verifyMerkleProof(
    { leaf: label, index: evidence.index, siblings: evidence.siblings, root: evidence.root },
    depth,
  );
}
