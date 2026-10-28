import { DOMAINS, hashDomain, isHash, type Hash } from "./hash.js";
import { TreeFullError } from "./errors.js";

export const DEFAULT_DEPTH = 20;
export const DEFAULT_ROOT_HISTORY = 30;
export const MAX_DEPTH = 32;

export interface MerkleProof {
  readonly leaf: Hash;
  readonly index: number;
  /** Sibling hashes from the leaf level up to just below the root. */
  readonly siblings: readonly Hash[];
  readonly root: Hash;
}

export interface MerkleTreeOptions {
  readonly depth?: number;
  /** How many of the most recent roots are accepted. The current root counts. */
  readonly rootHistorySize?: number;
}

function hashNode(left: Hash, right: Hash): Hash {
  return hashDomain(DOMAINS.node, left, right);
}

/** `zeros[0]` is the empty leaf and `zeros[depth]` is the root of an empty tree. */
export function computeZeroHashes(depth: number): Hash[] {
  assertDepth(depth);
  const zeros: Hash[] = [hashDomain(DOMAINS.emptyLeaf)];
  for (let i = 0; i < depth; i++) {
    const z = zeros[i] as Hash;
    zeros.push(hashNode(z, z));
  }
  return zeros;
}

export function emptyRoot(depth: number = DEFAULT_DEPTH): Hash {
  return computeZeroHashes(depth)[depth] as Hash;
}

function assertDepth(depth: number): void {
  if (!Number.isInteger(depth) || depth < 1 || depth > MAX_DEPTH) {
    throw new RangeError(`depth must be an integer from 1 to ${MAX_DEPTH}`);
  }
}

/** Recompute a root from a leaf, its index and its sibling path. */
export function computeRootFromPath(leaf: Hash, index: number, siblings: readonly Hash[]): Hash {
  let node = leaf;
  let idx = index;
  for (const sib of siblings) {
    node = idx % 2 === 0 ? hashNode(node, sib) : hashNode(sib, node);
    idx = Math.floor(idx / 2);
  }
  return node;
}

/**
 * Check an inclusion proof. Returns false for any malformed input instead of
 * throwing, so a caller can turn the result into one rejection.
 * `depth`, when given, must match the path length.
 */
export function verifyMerkleProof(proof: MerkleProof, depth?: number): boolean {
  const { leaf, index, siblings, root } = proof;
  if (!isHash(leaf) || !isHash(root)) return false;
  if (!Number.isSafeInteger(index) || index < 0) return false;
  if (siblings.length < 1 || siblings.length > MAX_DEPTH) return false;
  if (depth !== undefined && siblings.length !== depth) return false;
  if (!siblings.every(isHash)) return false;
  if (index >= 2 ** siblings.length) return false;
  return computeRootFromPath(leaf, index, siblings) === root;
}

/**
 * Fixed-depth append-only Merkle tree. Empty positions hold precomputed zero
 * hashes, so an insert touches `depth` nodes and the root of a mostly empty
 * tree is cheap. Only the last `rootHistorySize` roots are accepted.
 */
export class MerkleTree {
  readonly depth: number;
  readonly rootHistorySize: number;
  readonly zeroHashes: readonly Hash[];
  // levels[0] holds leaves. levels[i][j] is the node at height i, position j.
  private readonly levels: Hash[][];
  private readonly history: Hash[];

  constructor(options: MerkleTreeOptions = {}) {
    const depth = options.depth ?? DEFAULT_DEPTH;
    const historySize = options.rootHistorySize ?? DEFAULT_ROOT_HISTORY;
    assertDepth(depth);
    if (!Number.isInteger(historySize) || historySize < 1) {
      throw new RangeError("rootHistorySize must be an integer of at least 1");
    }
    this.depth = depth;
    this.rootHistorySize = historySize;
    this.zeroHashes = computeZeroHashes(depth);
    this.levels = Array.from({ length: depth }, () => []);
    this.history = [this.zeroHashes[depth] as Hash];
  }

  get capacity(): number {
    return 2 ** this.depth;
  }

  /** Number of leaves inserted, which is also the next leaf index. */
  get size(): number {
    return (this.levels[0] as Hash[]).length;
  }

  root(): Hash {
    return this.history[this.history.length - 1] as Hash;
  }

  /** Accepted roots, oldest first. The last entry is the current root. */
  recentRoots(): readonly Hash[] {
    return [...this.history];
  }

  isKnownRoot(root: Hash): boolean {
    return this.history.includes(root);
  }

  /** Append a leaf and return its index. */
  insert(leaf: Hash): number {
    if (!isHash(leaf)) throw new RangeError("leaf must be 64 lowercase hex characters");
    if (this.size >= this.capacity) throw new TreeFullError(this.capacity);
    const index = this.size;
    let idx = index;
    let node = leaf;
    for (let level = 0; level < this.depth; level++) {
      (this.levels[level] as Hash[])[idx] = node;
      const isRight = idx % 2 === 1;
      const sibling = this.nodeAt(level, isRight ? idx - 1 : idx + 1);
      node = isRight ? hashNode(sibling, node) : hashNode(node, sibling);
      idx = Math.floor(idx / 2);
    }
    this.history.push(node);
    if (this.history.length > this.rootHistorySize) this.history.shift();
    return index;
  }

  /** Inclusion proof for a leaf against the current root. */
  prove(index: number): MerkleProof {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) {
      throw new RangeError("leaf index is out of range");
    }
    const siblings: Hash[] = [];
    let idx = index;
    for (let level = 0; level < this.depth; level++) {
      siblings.push(this.nodeAt(level, idx % 2 === 0 ? idx + 1 : idx - 1));
      idx = Math.floor(idx / 2);
    }
    return { leaf: this.nodeAt(0, index), index, siblings, root: this.root() };
  }

  leafAt(index: number): Hash | undefined {
    return (this.levels[0] as Hash[])[index];
  }

  private nodeAt(level: number, position: number): Hash {
    return (this.levels[level] as Hash[])[position] ?? (this.zeroHashes[level] as Hash);
  }
}
