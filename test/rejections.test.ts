import { describe, expect, it } from "vitest";
import {
  Pool,
  PoolError,
  buildWithdrawRequest,
  deriveOwnerKey,
  randomBlinding,
  randomSecret,
} from "../src/index.js";

function setup(rootHistorySize = 2) {
  const pool = new Pool({ depth: 4, rootHistorySize });
  const spendingKey = randomSecret();
  const note = { value: 500n, assetId: 1n, ownerKey: deriveOwnerKey(spendingKey), blinding: randomBlinding() };
  const { leafIndex } = pool.deposit(note);
  return { pool, spendingKey, note, leafIndex };
}

function codeOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (err) {
    if (err instanceof PoolError) return err.code;
    throw err;
  }
}

function filler() {
  return { value: 1n, assetId: 1n, ownerKey: deriveOwnerKey(randomSecret()), blinding: randomBlinding() };
}

describe("rejection codes", () => {
  it("returns WRONG_KEY for a request built with another spending key", () => {
    const { pool, note, leafIndex } = setup();
    const code = codeOf(() =>
      pool.withdraw(
        buildWithdrawRequest(pool, {
          note,
          leafIndex,
          spendingKey: randomSecret(),
          recipient: "r",
          amount: 100n,
          fee: 0n,
        }).request,
      ),
    );
    expect(code).toBe("WRONG_KEY");
  });

  it("returns STALE_ROOT once the root leaves the history window", () => {
    const { pool, spendingKey, note, leafIndex } = setup(2);
    const { request } = buildWithdrawRequest(pool, { note, leafIndex, spendingKey, recipient: "r", amount: 100n, fee: 0n });
    for (let i = 0; i < 3; i++) pool.deposit(filler());
    expect(codeOf(() => pool.withdraw(request))).toBe("STALE_ROOT");
  });

  it("accepts a request whose root is still inside the window", () => {
    const { pool, spendingKey, note, leafIndex } = setup(4);
    const { request } = buildWithdrawRequest(pool, { note, leafIndex, spendingKey, recipient: "r", amount: 100n, fee: 0n });
    pool.deposit(filler());
    expect(codeOf(() => pool.withdraw(request))).toBeNull();
  });

  it("returns DOUBLE_SPEND when the same request is replayed", () => {
    const { pool, spendingKey, note, leafIndex } = setup();
    const { request } = buildWithdrawRequest(pool, { note, leafIndex, spendingKey, recipient: "r", amount: 100n, fee: 0n });
    expect(codeOf(() => pool.withdraw(request))).toBeNull();
    expect(codeOf(() => pool.withdraw(request))).toBe("DOUBLE_SPEND");
  });

  it("does not change balances when a request is rejected", () => {
    const { pool, spendingKey, note, leafIndex } = setup();
    const { request } = buildWithdrawRequest(pool, { note, leafIndex, spendingKey, recipient: "r", amount: 100n, fee: 0n });
    pool.withdraw(request);
    const balance = pool.balanceOf(1n);
    const size = pool.size;
    codeOf(() => pool.withdraw(request));
    expect(pool.balanceOf(1n)).toBe(balance);
    expect(pool.size).toBe(size);
  });
});
