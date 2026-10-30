import { describe, expect, it } from "vitest";
import {
  AssociationRequiredError,
  AssociationSet,
  NotInAssociationSetError,
  Pool,
  TreeFullError,
  UnknownAssociationRootError,
  buildWithdrawRequest,
  commitment,
  emptyRoot,
  hashDomain,
  verifyAssociation,
  type WithdrawRequest,
} from "../src/index.js";
import { ALICE_KEY, makeNote } from "./helpers.js";

const D = 6;

function world(requireAssociation = true) {
  const pool = new Pool({ depth: D, requireAssociation });
  const good = makeNote(100n);
  const bad = makeNote(100n);
  const goodDep = pool.deposit(good);
  const badDep = pool.deposit(bad);
  const set = new AssociationSet({ depth: D });
  set.add(goodDep.commitment);
  pool.acceptAssociationRoot(set.root());
  return { pool, set, good, bad, goodDep, badDep };
}

describe("AssociationSet", () => {
  it("starts empty with the empty root", () => {
    const s = new AssociationSet({ depth: 4 });
    expect(s.size).toBe(0);
    expect(s.root()).toBe(emptyRoot(4));
  });

  it("add is idempotent and changes the root once", () => {
    const s = new AssociationSet({ depth: 4 });
    const c = hashDomain("test", 1);
    const r0 = s.root();
    expect(s.add(c)).toBe(0);
    const r1 = s.root();
    expect(r1).not.toBe(r0);
    expect(s.add(c)).toBe(0);
    expect(s.root()).toBe(r1);
    expect(s.size).toBe(1);
    expect(s.has(c)).toBe(true);
  });

  it("proves members and refuses non-members", () => {
    const s = new AssociationSet({ depth: 4 });
    const a = hashDomain("test", 1);
    const b = hashDomain("test", 2);
    s.add(a);
    s.add(b);
    expect(verifyAssociation(a, s.prove(a), 4)).toBe(true);
    expect(verifyAssociation(b, s.prove(b), 4)).toBe(true);
    expect(verifyAssociation(b, s.prove(a), 4)).toBe(false);
    expect(() => s.prove(hashDomain("test", 3))).toThrow(NotInAssociationSetError);
    expect(verifyAssociation(a, s.prove(a), 5)).toBe(false);
  });

  it("rejects a malformed label", () => {
    expect(() => new AssociationSet({ depth: 4 }).add("nope")).toThrow(RangeError);
  });
});

describe("withdrawal with an association set", () => {
  it("accepts a listed deposit under an accepted root", () => {
    const { pool, set, good } = world();
    const { request } = buildWithdrawRequest(pool, {
      note: good,
      leafIndex: 0,
      spendingKey: ALICE_KEY,
      recipient: "d",
      amount: 100n,
      associationSet: set,
    });
    expect(() => pool.withdraw(request)).not.toThrow();
  });

  it("rejects a deposit that is not on the list", () => {
    const { pool, set, bad, badDep, goodDep } = world();
    expect(() =>
      buildWithdrawRequest(pool, {
        note: bad,
        leafIndex: badDep.leafIndex,
        spendingKey: ALICE_KEY,
        recipient: "d",
        amount: 100n,
        associationSet: set,
      }),
    ).toThrow(NotInAssociationSetError);

    // Borrowing evidence that belongs to another entry also fails at the pool.
    const built = buildWithdrawRequest(pool, {
      note: bad,
      leafIndex: badDep.leafIndex,
      spendingKey: ALICE_KEY,
      recipient: "d",
      amount: 100n,
    });
    const borrowed: WithdrawRequest = { ...built.request, association: set.prove(goodDep.commitment) };
    expect(() => pool.withdraw(borrowed)).toThrow(NotInAssociationSetError);
  });

  it("requires evidence when the pool demands it", () => {
    const { pool, good } = world(true);
    const { request } = buildWithdrawRequest(pool, {
      note: good,
      leafIndex: 0,
      spendingKey: ALICE_KEY,
      recipient: "d",
      amount: 100n,
    });
    expect(() => pool.withdraw(request)).toThrow(AssociationRequiredError);
  });

  it("allows an unlisted withdrawal when the pool does not demand evidence", () => {
    const { pool, bad, badDep } = world(false);
    const { request } = buildWithdrawRequest(pool, {
      note: bad,
      leafIndex: badDep.leafIndex,
      spendingKey: ALICE_KEY,
      recipient: "d",
      amount: 100n,
    });
    expect(() => pool.withdraw(request)).not.toThrow();
  });

  it("rejects a root the pool never accepted, until it is accepted", () => {
    const { pool, set, good } = world();
    const extra = makeNote(5n);
    const dep = pool.deposit(extra);
    set.add(dep.commitment);
    const { request } = buildWithdrawRequest(pool, {
      note: good,
      leafIndex: 0,
      spendingKey: ALICE_KEY,
      recipient: "d",
      amount: 100n,
      associationSet: set,
    });
    expect(() => pool.withdraw(request)).toThrow(UnknownAssociationRootError);
    pool.acceptAssociationRoot(set.root());
    expect(() => pool.withdraw(request)).not.toThrow();
  });

  it("stops accepting a retired root", () => {
    const { pool, set, good } = world();
    const { request } = buildWithdrawRequest(pool, {
      note: good,
      leafIndex: 0,
      spendingKey: ALICE_KEY,
      recipient: "d",
      amount: 100n,
      associationSet: set,
    });
    pool.retireAssociationRoot(set.root());
    expect(pool.isAssociationRootAccepted(set.root())).toBe(false);
    expect(() => pool.withdraw(request)).toThrow(UnknownAssociationRootError);
  });

  it("change notes inherit the origin, so a later partial withdrawal still proves membership", () => {
    const { pool, set, good } = world();
    const first = buildWithdrawRequest(pool, {
      note: good,
      leafIndex: 0,
      spendingKey: ALICE_KEY,
      recipient: "d",
      amount: 40n,
      associationSet: set,
    });
    const res = pool.withdraw(first.request);
    const change = first.change as NonNullable<typeof first.change>;
    expect(pool.labelOf(commitment(change))).toBe(pool.labelOf(commitment(good)));
    const second = buildWithdrawRequest(pool, {
      note: change,
      leafIndex: res.changeLeafIndex as number,
      spendingKey: ALICE_KEY,
      recipient: "d",
      amount: 60n,
      associationSet: set,
    });
    expect(() => pool.withdraw(second.request)).not.toThrow();
  });

  it("change from an unlisted origin cannot prove membership", () => {
    const { pool, set, bad, badDep } = world(false);
    const first = buildWithdrawRequest(pool, {
      note: bad,
      leafIndex: badDep.leafIndex,
      spendingKey: ALICE_KEY,
      recipient: "d",
      amount: 40n,
    });
    const res = pool.withdraw(first.request);
    expect(() =>
      buildWithdrawRequest(pool, {
        note: first.change as NonNullable<typeof first.change>,
        leafIndex: res.changeLeafIndex as number,
        spendingKey: ALICE_KEY,
        recipient: "d",
        amount: 60n,
        associationSet: set,
      }),
    ).toThrow(NotInAssociationSetError);
  });

  it("rejects evidence with the wrong depth", () => {
    const { pool, good } = world();
    const shallow = new AssociationSet({ depth: 3 });
    shallow.add(commitment(good));
    pool.acceptAssociationRoot(shallow.root());
    const { request } = buildWithdrawRequest(pool, {
      note: good,
      leafIndex: 0,
      spendingKey: ALICE_KEY,
      recipient: "d",
      amount: 100n,
      associationSet: shallow,
    });
    expect(() => pool.withdraw(request)).toThrow(NotInAssociationSetError);
  });
});

describe("association set edge cases", () => {
  it("uses the default depth when none is given", () => {
    const s = new AssociationSet();
    expect(s.depth).toBe(20);
    expect(s.root()).toBe(emptyRoot(20));
  });

  it("throws TreeFullError once the set is full and keeps existing members", () => {
    const s = new AssociationSet({ depth: 2 });
    const labels = [1, 2, 3, 4].map((n) => hashDomain("test", n));
    labels.forEach((l) => s.add(l));
    expect(() => s.add(hashDomain("test", 5))).toThrow(TreeFullError);
    expect(s.size).toBe(4);
    for (const l of labels) expect(verifyAssociation(l, s.prove(l), 2)).toBe(true);
  });

  it("adding to a full set that repeats a member is still a no-op", () => {
    const s = new AssociationSet({ depth: 1 });
    const a = hashDomain("test", 1);
    s.add(a);
    s.add(hashDomain("test", 2));
    expect(s.add(a)).toBe(0);
    expect(s.size).toBe(2);
  });

  it("evidence taken before a new member is added stays valid against its own root", () => {
    const s = new AssociationSet({ depth: 4 });
    const a = hashDomain("test", 1);
    s.add(a);
    const before = s.prove(a);
    s.add(hashDomain("test", 2));
    const after = s.prove(a);
    expect(before.root).not.toBe(after.root);
    expect(verifyAssociation(a, before, 4)).toBe(true);
    expect(verifyAssociation(a, after, 4)).toBe(true);
    expect(before.index).toBe(after.index);
  });

  it("evidence does not verify for a different label or a tampered root", () => {
    const s = new AssociationSet({ depth: 4 });
    const a = hashDomain("test", 1);
    const b = hashDomain("test", 2);
    s.add(a);
    s.add(b);
    const ev = s.prove(a);
    expect(verifyAssociation(b, ev, 4)).toBe(false);
    expect(verifyAssociation(a, { ...ev, root: b }, 4)).toBe(false);
    expect(verifyAssociation(a, { ...ev, index: 1 }, 4)).toBe(false);
  });

  it("members keep their index in insertion order", () => {
    const s = new AssociationSet({ depth: 4 });
    const labels = [10, 11, 12].map((n) => hashDomain("test", n));
    labels.forEach((l, i) => expect(s.add(l)).toBe(i));
    labels.forEach((l, i) => expect(s.prove(l).index).toBe(i));
  });

  it("the pool refuses a malformed association root and ignores retiring an unknown one", () => {
    const pool = new Pool({ depth: 4 });
    expect(() => pool.acceptAssociationRoot("nope")).toThrow(RangeError);
    const r = hashDomain("test", 1);
    expect(() => pool.retireAssociationRoot(r)).not.toThrow();
    expect(pool.isAssociationRootAccepted(r)).toBe(false);
  });

  it("the pool can accept two roots at once and retire them one by one", () => {
    const { pool, set, goodDep } = world();
    const first = set.root();
    set.add(hashDomain("test", 42));
    const second = set.root();
    pool.acceptAssociationRoot(second);
    expect(pool.isAssociationRootAccepted(first)).toBe(true);
    expect(pool.isAssociationRootAccepted(second)).toBe(true);
    pool.retireAssociationRoot(first);
    expect(pool.isAssociationRootAccepted(first)).toBe(false);
    expect(pool.isAssociationRootAccepted(second)).toBe(true);
    expect(pool.labelOf(goodDep.commitment)).toBe(goodDep.commitment);
  });
});
