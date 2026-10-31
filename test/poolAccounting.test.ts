import { describe, expect, it } from "vitest";
import {
  DoubleSpendError,
  MAX_NOTE_VALUE,
  Pool,
  ValueMismatchError,
  buildWithdrawRequest,
  type Note,
} from "../src/index.js";
import { ALICE_KEY, makeNote } from "./helpers.js";

const pool6 = () => new Pool({ depth: 6 });

describe("balances per asset", () => {
  it("tracks each asset separately", () => {
    const pool = pool6();
    pool.deposit(makeNote(10n, ALICE_KEY, 1n));
    pool.deposit(makeNote(20n, ALICE_KEY, 2n));
    pool.deposit(makeNote(5n, ALICE_KEY, 1n));
    expect(pool.balanceOf(1n)).toBe(15n);
    expect(pool.balanceOf(2n)).toBe(20n);
    expect(pool.balanceOf(3n)).toBe(0n);
  });

  it("a withdrawal only moves the balance of its own asset", () => {
    const pool = pool6();
    const a = makeNote(10n, ALICE_KEY, 1n);
    pool.deposit(makeNote(20n, ALICE_KEY, 2n));
    const { leafIndex } = pool.deposit(a);
    const { request } = buildWithdrawRequest(pool, {
      note: a, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 10n,
    });
    pool.withdraw(request);
    expect(pool.balanceOf(1n)).toBe(0n);
    expect(pool.balanceOf(2n)).toBe(20n);
  });

  it("accepts a note at the largest allowed value", () => {
    const pool = pool6();
    const big = makeNote(MAX_NOTE_VALUE);
    const { leafIndex } = pool.deposit(big);
    expect(pool.balanceOf(1n)).toBe(MAX_NOTE_VALUE);
    const { request } = buildWithdrawRequest(pool, {
      note: big, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: MAX_NOTE_VALUE,
    });
    expect(pool.withdraw(request).amount).toBe(MAX_NOTE_VALUE);
    expect(pool.balanceOf(1n)).toBe(0n);
  });
});

describe("a chain of partial withdrawals", () => {
  it("drains a note through its change notes and ends at zero", () => {
    const pool = pool6();
    let note: Note = makeNote(100n);
    let leafIndex = pool.deposit(note).leafIndex;
    let paid = 0n;
    let fees = 0n;
    for (const [amount, fee] of [[30n, 1n], [20n, 2n], [10n, 0n]] as const) {
      const { request, change } = buildWithdrawRequest(pool, {
        note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount, fee,
      });
      const res = pool.withdraw(request);
      paid += amount;
      fees += fee;
      expect(change).not.toBeNull();
      note = change as Note;
      leafIndex = res.changeLeafIndex as number;
      expect(pool.balanceOf(1n)).toBe(note.value);
    }
    expect(paid).toBe(60n);
    expect(fees).toBe(3n);
    expect(note.value).toBe(37n);
    expect(pool.feesCollected(1n)).toBe(fees);
    expect(pool.nullifierCount).toBe(3);
    expect(pool.size).toBe(4);
  });

  it("deposits minus payouts and fees always equals the unspent note value", () => {
    const pool = pool6();
    const notes = [makeNote(40n), makeNote(60n)];
    const leaves = notes.map((n) => pool.deposit(n).leafIndex);
    const { request } = buildWithdrawRequest(pool, {
      note: notes[1] as Note, leafIndex: leaves[1] as number, spendingKey: ALICE_KEY, recipient: "d", amount: 25n, fee: 5n,
    });
    pool.withdraw(request);
    // 40 untouched, 60 became 30 of change
    expect(pool.balanceOf(1n)).toBe(40n + 30n);
    expect(pool.feesCollected(1n)).toBe(5n);
  });
});

describe("rejected withdrawals leave accounting alone", () => {
  it("a double spend changes no balance, fee or leaf count", () => {
    const pool = pool6();
    const note = makeNote(50n);
    const { leafIndex } = pool.deposit(note);
    const { request } = buildWithdrawRequest(pool, {
      note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 20n, fee: 1n,
    });
    pool.withdraw(request);
    const before = { bal: pool.balanceOf(1n), fees: pool.feesCollected(1n), size: pool.size, nulls: pool.nullifierCount };
    expect(() => pool.withdraw(request)).toThrow(DoubleSpendError);
    expect({ bal: pool.balanceOf(1n), fees: pool.feesCollected(1n), size: pool.size, nulls: pool.nullifierCount }).toEqual(before);
  });

  it("a value mismatch changes no balance and does not publish the nullifier", () => {
    const pool = pool6();
    const note = makeNote(50n);
    const { leafIndex } = pool.deposit(note);
    const { request } = buildWithdrawRequest(pool, {
      note, leafIndex, spendingKey: ALICE_KEY, recipient: "d", amount: 20n,
    });
    const bad = { ...request, amount: 21n };
    expect(() => pool.withdraw(bad)).toThrow(ValueMismatchError);
    expect(pool.balanceOf(1n)).toBe(50n);
    expect(pool.isSpent(request.nullifier)).toBe(false);
    expect(pool.withdraw(request).amount).toBe(20n);
  });
});
