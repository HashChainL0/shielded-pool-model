import { describe, expect, it } from "vitest";
import {
  AssetMismatchError,
  ChangeMismatchError,
  DoubleSpendError,
  DuplicateCommitmentError,
  InvalidInclusionProofError,
  InvalidNoteError,
  InvalidRequestError,
  NullifierMismatchError,
  Pool,
  PoolError,
  StaleRootError,
  TreeFullError,
  ValueMismatchError,
  WrongKeyError,
  buildWithdrawRequest,
  commitment,
  hashDomain,
  nullifier,
  type WithdrawRequest,
} from "../src/index.js";
import { ALICE_KEY, ASSET, BOB_KEY, makeNote } from "./helpers.js";

const smallPool = (rootHistorySize = 10) => new Pool({ depth: 6, rootHistorySize });

function setup(value = 100n, rootHistorySize = 10) {
  const pool = smallPool(rootHistorySize);
  const note = makeNote(value);
  const { leafIndex } = pool.deposit(note);
  return { pool, note, leafIndex };
}

describe("deposit", () => {
  it("returns the leaf index, commitment and new root", () => {
    const pool = smallPool();
    const n = makeNote(50n);
    const r = pool.deposit(n);
    expect(r.leafIndex).toBe(0);
    expect(r.commitment).toBe(commitment(n));
    expect(r.root).toBe(pool.root());
    expect(pool.size).toBe(1);
    expect(pool.balanceOf(ASSET)).toBe(50n);
  });

  it("assigns sequential leaf indexes", () => {
    const pool = smallPool();
    expect(pool.deposit(makeNote(1n)).leafIndex).toBe(0);
    expect(pool.deposit(makeNote(1n)).leafIndex).toBe(1);
    expect(pool.deposit(makeNote(1n)).leafIndex).toBe(2);
  });

  it("rejects invalid notes and duplicate commitments", () => {
    const pool = smallPool();
    expect(() => pool.deposit({ ...makeNote(1n), value: 0n })).toThrow(InvalidNoteError);
    const n = makeNote(5n);
    pool.deposit(n);
    expect(() => pool.deposit({ ...n })).toThrow(DuplicateCommitmentError);
    expect(pool.size).toBe(1);
  });

  it("throws TreeFullError when the tree is full and leaves state unchanged", () => {
    const pool = new Pool({ depth: 1 });
    pool.deposit(makeNote(1n));
    pool.deposit(makeNote(1n));
    const before = pool.balanceOf(ASSET);
    expect(() => pool.deposit(makeNote(1n))).toThrow(TreeFullError);
    expect(pool.balanceOf(ASSET)).toBe(before);
  });
});

describe("full withdrawal", () => {
  it("spends a whole note with no change", () => {
    const { pool, note, leafIndex } = setup(100n);
    const { request, change } = buildWithdrawRequest(pool, {
      note,
      leafIndex,
      spendingKey: ALICE_KEY,
      recipient: "dest-1",
      amount: 100n,
    });
    expect(change).toBeNull();
    expect(request.changeCommitment).toBeNull();
    const res = pool.withdraw(request);
    expect(res.amount).toBe(100n);
    expect(res.changeLeafIndex).toBeNull();
    expect(pool.isSpent(request.nullifier)).toBe(true);
    expect(pool.balanceOf(ASSET)).toBe(0n);
    expect(pool.size).toBe(1);
  });

  it("pays a fee out of the note", () => {
    const { pool, note, leafIndex } = setup(100n);
    const { request } = buildWithdrawRequest(pool, {
      note,
      leafIndex,
      spendingKey: ALICE_KEY,
      recipient: "dest-1",
      amount: 97n,
      fee: 3n,
    });
    const res = pool.withdraw(request);
    expect(res.fee).toBe(3n);
    expect(pool.feesCollected(ASSET)).toBe(3n);
    expect(pool.balanceOf(ASSET)).toBe(0n);
  });
});

describe("partial withdrawal", () => {
  it("creates a change note that can be spent later", () => {
    const { pool, note, leafIndex } = setup(100n);
    const first = buildWithdrawRequest(pool, {
      note,
      leafIndex,
      spendingKey: ALICE_KEY,
      recipient: "dest-1",
      amount: 30n,
      fee: 2n,
    });
    expect(first.change?.value).toBe(68n);
    const r1 = pool.withdraw(first.request);
    expect(r1.changeLeafIndex).toBe(1);
    expect(pool.size).toBe(2);
    expect(pool.balanceOf(ASSET)).toBe(68n);

    const change = first.change as NonNullable<typeof first.change>;
    const second = buildWithdrawRequest(pool, {
      note: change,
      leafIndex: r1.changeLeafIndex as number,
      spendingKey: ALICE_KEY,
      recipient: "dest-2",
      amount: 68n,
    });
    pool.withdraw(second.request);
    expect(pool.balanceOf(ASSET)).toBe(0n);
    expect(pool.nullifierCount).toBe(2);
  });

  it("can hand the change to a different owner key", () => {
    const { pool, note, leafIndex } = setup(100n);
    const bobOwner = makeNote(1n, BOB_KEY).ownerKey;
    const built = buildWithdrawRequest(pool, {
      note,
      leafIndex,
      spendingKey: ALICE_KEY,
      recipient: "dest-1",
      amount: 10n,
      changeOwnerKey: bobOwner,
    });
    const res = pool.withdraw(built.request);
    const change = built.change as NonNullable<typeof built.change>;
    // Alice can no longer spend it, Bob can.
    expect(() =>
      pool.withdraw(
        buildWithdrawRequest(pool, {
          note: change,
          leafIndex: res.changeLeafIndex as number,
          spendingKey: ALICE_KEY,
          recipient: "x",
          amount: 90n,
        }).request,
      ),
    ).toThrow(WrongKeyError);
    pool.withdraw(
      buildWithdrawRequest(pool, {
        note: change,
        leafIndex: res.changeLeafIndex as number,
        spendingKey: BOB_KEY,
        recipient: "x",
        amount: 90n,
      }).request,
    );
  });

  it("keeps the pool balance equal to the unspent note value", () => {
    const { pool, note, leafIndex } = setup(1000n);
    const other = makeNote(500n);
    pool.deposit(other);
    expect(pool.balanceOf(ASSET)).toBe(1500n);
    const b = buildWithdrawRequest(pool, {
      note,
      leafIndex,
      spendingKey: ALICE_KEY,
      recipient: "d",
      amount: 400n,
      fee: 10n,
    });
    pool.withdraw(b.request);
    // unspent: change 590 plus the other 500
    expect(pool.balanceOf(ASSET)).toBe(590n + 500n);
  });
});

describe("double spend", () => {
  it("rejects a replayed request", () => {
    const { pool, note, leafIndex } = setup(100n);
    const { request } = buildWithdrawRequest(pool, {
      note,
      leafIndex,
      spendingKey: ALICE_KEY,
      recipient: "d",
      amount: 40n,
    });
    pool.withdraw(request);
    const size = pool.size;
    expect(() => pool.withdraw(request)).toThrow(DoubleSpendError);
    expect(pool.size).toBe(size);
    expect(pool.balanceOf(ASSET)).toBe(60n);
  });

  it("rejects a fresh request that spends the same note again", () => {
    const { pool, note, leafIndex } = setup(100n);
    const first = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 40n });
    pool.withdraw(first.request);
    const again = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 100n });
    expect(() => pool.withdraw(again.request)).toThrow(DoubleSpendError);
  });

  it("two requests built before either is applied: only the first wins", () => {
    const { pool, note, leafIndex } = setup(100n);
    const a = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: ALICE_KEY, recipient: "a", amount: 100n });
    const b = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: ALICE_KEY, recipient: "b", amount: 100n });
    pool.withdraw(a.request);
    expect(() => pool.withdraw(b.request)).toThrow(DoubleSpendError);
  });

  it("a rejected request does not publish its nullifier", () => {
    const { pool, note, leafIndex } = setup(100n);
    const { request } = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 40n });
    const bad: WithdrawRequest = { ...request, amount: 41n };
    expect(() => pool.withdraw(bad)).toThrow(ValueMismatchError);
    expect(pool.isSpent(request.nullifier)).toBe(false);
    pool.withdraw(request);
  });
});

describe("stale root", () => {
  it("rejects a root that aged out of the window", () => {
    const { pool, note, leafIndex } = setup(100n, 3);
    const { request } = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 100n });
    for (let i = 0; i < 3; i++) pool.deposit(makeNote(1n));
    expect(pool.isKnownRoot(request.root)).toBe(false);
    expect(() => pool.withdraw(request)).toThrow(StaleRootError);
    expect(pool.isSpent(request.nullifier)).toBe(false);
  });

  it("accepts an older root that is still inside the window", () => {
    const { pool, note, leafIndex } = setup(100n, 5);
    const { request } = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 100n });
    pool.deposit(makeNote(1n));
    pool.deposit(makeNote(1n));
    expect(request.root).not.toBe(pool.root());
    expect(() => pool.withdraw(request)).not.toThrow();
  });

  it("rejects a root the tree never had", () => {
    const { pool, note, leafIndex } = setup(100n);
    const { request } = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 100n });
    expect(() => pool.withdraw({ ...request, root: hashDomain("test", 1) })).toThrow(StaleRootError);
  });

  it("recovers by rebuilding the request against the current root", () => {
    const { pool, note, leafIndex } = setup(100n, 2);
    const old = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 100n });
    pool.deposit(makeNote(1n));
    pool.deposit(makeNote(1n));
    expect(() => pool.withdraw(old.request)).toThrow(StaleRootError);
    const fresh = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 100n });
    pool.withdraw(fresh.request);
  });
});

describe("wrong key and bad witness", () => {
  it("rejects a spending key that does not own the note", () => {
    const { pool, note, leafIndex } = setup(100n);
    const { request } = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: BOB_KEY, recipient: "d", amount: 100n });
    expect(() => pool.withdraw(request)).toThrow(WrongKeyError);
    expect(pool.balanceOf(ASSET)).toBe(100n);
  });

  it("rejects an inclusion path for a note that is not in the tree", () => {
    const { pool, leafIndex } = setup(100n);
    const ghost = makeNote(100n);
    const proof = pool.proveInclusion(leafIndex);
    const request: WithdrawRequest = {
      root: proof.root,
      nullifier: nullifier(ghost, ALICE_KEY, leafIndex),
      assetId: ASSET,
      amount: 100n,
      fee: 0n,
      recipient: "d",
      changeCommitment: null,
      witness: { note: ghost, leafIndex, siblings: proof.siblings, spendingKey: ALICE_KEY },
    };
    expect(() => pool.withdraw(request)).toThrow(InvalidInclusionProofError);
  });

  it("rejects a wrong leaf index and a wrong path length", () => {
    const { pool, note, leafIndex } = setup(100n);
    pool.deposit(makeNote(7n));
    const { request } = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 100n });
    expect(() => pool.withdraw({ ...request, witness: { ...request.witness, leafIndex: 1 } })).toThrow(
      InvalidInclusionProofError,
    );
    expect(() =>
      pool.withdraw({ ...request, witness: { ...request.witness, siblings: request.witness.siblings.slice(1) } }),
    ).toThrow(InvalidInclusionProofError);
  });

  it("rejects a nullifier that is not derived from the spent note", () => {
    const { pool, note, leafIndex } = setup(100n);
    const { request } = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 100n });
    const forged = hashDomain("test.forged", 1);
    expect(() => pool.withdraw({ ...request, nullifier: forged })).toThrow(NullifierMismatchError);
  });

  it("a nullifier computed at the wrong leaf position does not match", () => {
    const { pool, note, leafIndex } = setup(100n);
    pool.deposit(makeNote(1n));
    const { request } = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 100n });
    const wrong = nullifier(note, ALICE_KEY, 1);
    expect(() => pool.withdraw({ ...request, nullifier: wrong })).toThrow(NullifierMismatchError);
  });
});

describe("value conservation", () => {
  it("rejects amount plus fee greater than the note", () => {
    const { pool, note, leafIndex } = setup(100n);
    const { request } = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 100n });
    expect(() => pool.withdraw({ ...request, amount: 101n })).toThrow(ValueMismatchError);
    expect(() => pool.withdraw({ ...request, amount: 100n, fee: 1n })).toThrow(ValueMismatchError);
  });

  it("rejects value that disappears (change smaller than the remainder)", () => {
    const { pool, note, leafIndex } = setup(100n);
    const { request, change } = buildWithdrawRequest(pool, {
      note,
      leafIndex,
      spendingKey: ALICE_KEY,
      recipient: "d",
      amount: 40n,
    });
    const smaller = { ...(change as NonNullable<typeof change>), value: 50n };
    expect(() =>
      pool.withdraw({
        ...request,
        changeCommitment: commitment(smaller),
        witness: { ...request.witness, change: smaller },
      }),
    ).toThrow(ValueMismatchError);
  });

  it("rejects value created through a larger change note", () => {
    const { pool, note, leafIndex } = setup(100n);
    const { request, change } = buildWithdrawRequest(pool, {
      note,
      leafIndex,
      spendingKey: ALICE_KEY,
      recipient: "d",
      amount: 40n,
    });
    const bigger = { ...(change as NonNullable<typeof change>), value: 70n };
    expect(() =>
      pool.withdraw({
        ...request,
        changeCommitment: commitment(bigger),
        witness: { ...request.witness, change: bigger },
      }),
    ).toThrow(ValueMismatchError);
    expect(pool.balanceOf(ASSET)).toBe(100n);
  });

  it("rejects a mismatched asset on the request or the change note", () => {
    const { pool, note, leafIndex } = setup(100n);
    const { request, change } = buildWithdrawRequest(pool, {
      note,
      leafIndex,
      spendingKey: ALICE_KEY,
      recipient: "d",
      amount: 40n,
    });
    expect(() => pool.withdraw({ ...request, assetId: 2n })).toThrow(AssetMismatchError);
    const other = { ...(change as NonNullable<typeof change>), assetId: 2n };
    expect(() =>
      pool.withdraw({ ...request, changeCommitment: commitment(other), witness: { ...request.witness, change: other } }),
    ).toThrow(AssetMismatchError);
  });

  it("rejects inconsistent change fields", () => {
    const { pool, note, leafIndex } = setup(100n);
    const { request, change } = buildWithdrawRequest(pool, {
      note,
      leafIndex,
      spendingKey: ALICE_KEY,
      recipient: "d",
      amount: 40n,
    });
    expect(() => pool.withdraw({ ...request, changeCommitment: null })).toThrow(ChangeMismatchError);
    const { change: _drop, ...noChange } = request.witness;
    expect(() => pool.withdraw({ ...request, witness: noChange })).toThrow(ChangeMismatchError);
    const full = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 100n });
    expect(() => pool.withdraw({ ...full.request, changeCommitment: commitment(change as NonNullable<typeof change>) })).toThrow(
      ChangeMismatchError,
    );
    expect(() =>
      pool.withdraw({ ...request, changeCommitment: hashDomain("test", 5) }),
    ).toThrow(ChangeMismatchError);
  });

  it("rejects a change commitment that duplicates an existing leaf", () => {
    const { pool, note, leafIndex } = setup(100n);
    const { request, change } = buildWithdrawRequest(pool, {
      note,
      leafIndex,
      spendingKey: ALICE_KEY,
      recipient: "d",
      amount: 40n,
    });
    pool.deposit(change as NonNullable<typeof change>);
    const fresh = buildWithdrawRequest(pool, {
      note,
      leafIndex,
      spendingKey: ALICE_KEY,
      recipient: "d",
      amount: 40n,
      changeBlinding: (change as NonNullable<typeof change>).blinding,
    });
    expect(() => pool.withdraw(fresh.request)).toThrow(DuplicateCommitmentError);
    expect(pool.isSpent(request.nullifier)).toBe(false);
  });

  it("rejects malformed request fields", () => {
    const { pool, note, leafIndex } = setup(100n);
    const { request } = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 100n });
    expect(() => pool.withdraw({ ...request, amount: 0n })).toThrow(InvalidRequestError);
    expect(() => pool.withdraw({ ...request, fee: -1n })).toThrow(InvalidRequestError);
    expect(() => pool.withdraw({ ...request, recipient: "" })).toThrow(InvalidRequestError);
    expect(() => pool.withdraw({ ...request, root: "x" })).toThrow(InvalidRequestError);
  });

  it("every rejection is a PoolError with a code", () => {
    const { pool, note, leafIndex } = setup(100n);
    const { request } = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: BOB_KEY, recipient: "d", amount: 100n });
    try {
      pool.withdraw(request);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PoolError);
      expect((e as PoolError).code).toBe("WRONG_KEY");
      expect((e as Error).name).toBe("WrongKeyError");
    }
  });
});

describe("atomicity", () => {
  it("a full tree rejects the change insert and leaves the nullifier unpublished", () => {
    const pool = new Pool({ depth: 1 });
    const note = makeNote(100n);
    const { leafIndex } = pool.deposit(note);
    pool.deposit(makeNote(1n));
    const { request } = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 40n });
    expect(() => pool.withdraw(request)).toThrow(TreeFullError);
    expect(pool.isSpent(request.nullifier)).toBe(false);
    expect(pool.balanceOf(ASSET)).toBe(101n);
    // A full spend needs no new leaf and still works.
    const whole = buildWithdrawRequest(pool, { note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 100n });
    pool.withdraw(whole.request);
  });
});
