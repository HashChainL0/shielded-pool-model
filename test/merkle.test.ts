import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEPTH,
  MerkleTree,
  TreeFullError,
  computeRootFromPath,
  computeZeroHashes,
  emptyRoot,
  hashDomain,
  verifyMerkleProof,
  type Hash,
} from "../src/index.js";

const leaf = (n: number): Hash => hashDomain("test.leaf", n);

describe("zero hashes and empty tree", () => {
  it("builds depth + 1 zero hashes that chain upward", () => {
    const z = computeZeroHashes(4);
    expect(z).toHaveLength(5);
    expect(new Set(z).size).toBe(5);
  });

  it("defaults to depth 20 and an empty root equal to the top zero hash", () => {
    const t = new MerkleTree();
    expect(t.depth).toBe(DEFAULT_DEPTH);
    expect(t.root()).toBe(emptyRoot(20));
    expect(t.size).toBe(0);
    expect(t.capacity).toBe(2 ** 20);
  });

  it("rejects bad configuration", () => {
    expect(() => new MerkleTree({ depth: 0 })).toThrow(RangeError);
    expect(() => new MerkleTree({ depth: 33 })).toThrow(RangeError);
    expect(() => new MerkleTree({ depth: 2.5 })).toThrow(RangeError);
    expect(() => new MerkleTree({ rootHistorySize: 0 })).toThrow(RangeError);
  });
});

describe("insert and root", () => {
  it("returns sequential indexes and changes the root", () => {
    const t = new MerkleTree({ depth: 4 });
    const roots = new Set<Hash>([t.root()]);
    for (let i = 0; i < 5; i++) {
      expect(t.insert(leaf(i))).toBe(i);
      roots.add(t.root());
    }
    expect(roots.size).toBe(6);
    expect(t.size).toBe(5);
  });

  it("matches a naive full rebuild", () => {
    const depth = 3;
    const t = new MerkleTree({ depth });
    const leaves = [0, 1, 2, 3, 4].map(leaf);
    leaves.forEach((l) => t.insert(l));
    const zeros = computeZeroHashes(depth);
    let layer: Hash[] = Array.from({ length: 8 }, (_, i) => leaves[i] ?? (zeros[0] as Hash));
    for (let level = 0; level < depth; level++) {
      const next: Hash[] = [];
      for (let i = 0; i < layer.length; i += 2) {
        next.push(hashDomain("hashchain.model.merkle.node.v1", layer[i] as Hash, layer[i + 1] as Hash));
      }
      layer = next;
    }
    expect(t.root()).toBe(layer[0]);
  });

  it("is order sensitive", () => {
    const a = new MerkleTree({ depth: 3 });
    const b = new MerkleTree({ depth: 3 });
    a.insert(leaf(1));
    a.insert(leaf(2));
    b.insert(leaf(2));
    b.insert(leaf(1));
    expect(a.root()).not.toBe(b.root());
  });

  it("rejects a malformed leaf", () => {
    expect(() => new MerkleTree({ depth: 3 }).insert("nope")).toThrow(RangeError);
  });

  it("fills to capacity and then throws TreeFullError", () => {
    const t = new MerkleTree({ depth: 2 });
    for (let i = 0; i < 4; i++) t.insert(leaf(i));
    expect(t.size).toBe(t.capacity);
    expect(() => t.insert(leaf(9))).toThrow(TreeFullError);
    expect(t.size).toBe(4);
  });

  it("allows the minimum depth of 1", () => {
    const t = new MerkleTree({ depth: 1 });
    t.insert(leaf(0));
    t.insert(leaf(1));
    expect(verifyMerkleProof(t.prove(1), 1)).toBe(true);
    expect(() => t.insert(leaf(2))).toThrow(TreeFullError);
  });
});

describe("root history window", () => {
  it("keeps the last N roots including the current one", () => {
    const t = new MerkleTree({ depth: 4, rootHistorySize: 3 });
    const seen: Hash[] = [t.root()];
    for (let i = 0; i < 4; i++) {
      t.insert(leaf(i));
      seen.push(t.root());
    }
    expect(t.recentRoots()).toEqual(seen.slice(-3));
    expect(t.isKnownRoot(seen[4] as Hash)).toBe(true);
    expect(t.isKnownRoot(seen[2] as Hash)).toBe(true);
    expect(t.isKnownRoot(seen[1] as Hash)).toBe(false);
    expect(t.isKnownRoot(seen[0] as Hash)).toBe(false);
  });

  it("accepts the empty root until it ages out", () => {
    const t = new MerkleTree({ depth: 4, rootHistorySize: 2 });
    const empty = t.root();
    expect(t.isKnownRoot(empty)).toBe(true);
    t.insert(leaf(0));
    expect(t.isKnownRoot(empty)).toBe(true);
    t.insert(leaf(1));
    expect(t.isKnownRoot(empty)).toBe(false);
  });

  it("window of 1 accepts only the current root", () => {
    const t = new MerkleTree({ depth: 3, rootHistorySize: 1 });
    const r0 = t.root();
    t.insert(leaf(0));
    expect(t.isKnownRoot(r0)).toBe(false);
    expect(t.isKnownRoot(t.root())).toBe(true);
  });

  it("never accepts an unknown root", () => {
    const t = new MerkleTree({ depth: 3 });
    expect(t.isKnownRoot(leaf(77))).toBe(false);
  });
});

describe("inclusion proofs", () => {
  it("verifies every leaf of a partly filled tree", () => {
    const t = new MerkleTree({ depth: 5 });
    for (let i = 0; i < 13; i++) t.insert(leaf(i));
    for (let i = 0; i < 13; i++) {
      const p = t.prove(i);
      expect(p.leaf).toBe(leaf(i));
      expect(verifyMerkleProof(p, 5)).toBe(true);
    }
  });

  it("verifies at the default depth", () => {
    const t = new MerkleTree();
    t.insert(leaf(0));
    t.insert(leaf(1));
    const p = t.prove(1);
    expect(p.siblings).toHaveLength(20);
    expect(verifyMerkleProof(p)).toBe(true);
  });

  it("an older proof still verifies against the older root", () => {
    const t = new MerkleTree({ depth: 4 });
    t.insert(leaf(0));
    const old = t.prove(0);
    t.insert(leaf(1));
    expect(verifyMerkleProof(old)).toBe(true);
    expect(old.root).not.toBe(t.root());
    expect(t.isKnownRoot(old.root)).toBe(true);
  });

  it("rejects a wrong leaf, index, sibling, root or depth", () => {
    const t = new MerkleTree({ depth: 4 });
    for (let i = 0; i < 6; i++) t.insert(leaf(i));
    const p = t.prove(2);
    expect(verifyMerkleProof({ ...p, leaf: leaf(99) })).toBe(false);
    expect(verifyMerkleProof({ ...p, index: 3 })).toBe(false);
    expect(verifyMerkleProof({ ...p, siblings: [leaf(5), ...p.siblings.slice(1)] })).toBe(false);
    expect(verifyMerkleProof({ ...p, root: leaf(1) })).toBe(false);
    expect(verifyMerkleProof(p, 5)).toBe(false);
  });

  it("returns false for malformed proofs without throwing", () => {
    const t = new MerkleTree({ depth: 3 });
    t.insert(leaf(0));
    const p = t.prove(0);
    expect(verifyMerkleProof({ ...p, siblings: [] })).toBe(false);
    expect(verifyMerkleProof({ ...p, index: -1 })).toBe(false);
    expect(verifyMerkleProof({ ...p, index: 8 })).toBe(false);
    expect(verifyMerkleProof({ ...p, siblings: ["bad", "bad", "bad"] })).toBe(false);
    expect(verifyMerkleProof({ ...p, leaf: "bad" })).toBe(false);
  });

  it("refuses to prove an index that is not inserted", () => {
    const t = new MerkleTree({ depth: 3 });
    t.insert(leaf(0));
    expect(() => t.prove(1)).toThrow(RangeError);
    expect(() => t.prove(-1)).toThrow(RangeError);
  });

  it("computeRootFromPath agrees with the tree root", () => {
    const t = new MerkleTree({ depth: 3 });
    t.insert(leaf(0));
    t.insert(leaf(1));
    t.insert(leaf(2));
    const p = t.prove(2);
    expect(computeRootFromPath(p.leaf, p.index, p.siblings)).toBe(t.root());
  });
});

describe("tree properties across depths", () => {
  it("every leaf of a full tree verifies at depths 1 to 6", () => {
    for (let depth = 1; depth <= 6; depth++) {
      const t = new MerkleTree({ depth });
      for (let i = 0; i < t.capacity; i++) t.insert(leaf(i));
      for (let i = 0; i < t.capacity; i++) {
        const p = t.prove(i);
        expect(p.index).toBe(i);
        expect(p.siblings).toHaveLength(depth);
        expect(verifyMerkleProof(p, depth)).toBe(true);
      }
    }
  });

  it("flipping one sibling of any proof breaks it", () => {
    const t = new MerkleTree({ depth: 5 });
    for (let i = 0; i < 11; i++) t.insert(leaf(i));
    for (let i = 0; i < 11; i++) {
      const p = t.prove(i);
      for (let level = 0; level < p.siblings.length; level++) {
        const siblings = p.siblings.map((s, k) => (k === level ? leaf(1000 + k) : s));
        expect(verifyMerkleProof({ ...p, siblings })).toBe(false);
      }
    }
  });

  it("a proof does not verify at any other leaf index", () => {
    const t = new MerkleTree({ depth: 4 });
    for (let i = 0; i < 9; i++) t.insert(leaf(i));
    const p = t.prove(5);
    for (let other = 0; other < t.capacity; other++) {
      expect(verifyMerkleProof({ ...p, index: other })).toBe(other === 5);
    }
  });

  it("the root only depends on the leaves and their order, not the history window", () => {
    const a = new MerkleTree({ depth: 5, rootHistorySize: 1 });
    const b = new MerkleTree({ depth: 5, rootHistorySize: 50 });
    for (let i = 0; i < 17; i++) {
      a.insert(leaf(i));
      b.insert(leaf(i));
      expect(a.root()).toBe(b.root());
    }
  });

  it("trees of different depth never share a root for the same leaves", () => {
    const roots = new Set<Hash>();
    for (let depth = 2; depth <= 8; depth++) {
      const t = new MerkleTree({ depth });
      t.insert(leaf(0));
      t.insert(leaf(1));
      roots.add(t.root());
    }
    expect(roots.size).toBe(7);
  });

  it("recentRoots returns a copy that cannot change the tree", () => {
    const t = new MerkleTree({ depth: 3, rootHistorySize: 3 });
    t.insert(leaf(0));
    const roots = t.recentRoots() as Hash[];
    roots.length = 0;
    expect(t.recentRoots()).toHaveLength(2);
    expect(t.isKnownRoot(t.root())).toBe(true);
  });
});
