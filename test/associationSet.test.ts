import { describe, expect, it } from "vitest";
import {
  AssociationRequiredError,
  AssociationSet,
  NotInAssociationSetError,
  Pool,
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
