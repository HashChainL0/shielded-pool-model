import {
  Pool,
  PoolError,
  buildWithdrawRequest,
  deriveOwnerKey,
  randomBlinding,
  randomSecret,
} from "../src/index.js";

// Show the typed rejections a pool returns. Each failure maps to one error
// code, so a caller can tell a replay from a stale root from a wrong key.
const pool = new Pool({ depth: 4, rootHistorySize: 2 });
const spendingKey = randomSecret();
const note = { value: 500n, assetId: 1n, ownerKey: deriveOwnerKey(spendingKey), blinding: randomBlinding() };
const dep = pool.deposit(note);

function attempt(label: string, run: () => unknown): void {
  try {
    run();
    console.log(`${label}: accepted`);
  } catch (err) {
    if (err instanceof PoolError) console.log(`${label}: rejected with ${err.code}`);
    else throw err;
  }
}

// 1. Wrong spending key.
attempt("wrong key", () =>
  pool.withdraw(
    buildWithdrawRequest(pool, {
      note,
      leafIndex: dep.leafIndex,
      spendingKey: randomSecret(),
      recipient: "destination",
      amount: 100n,
      fee: 0n,
    }).request,
  ),
);

// 2. Stale root: build a request, then push the root out of the history window.
const stale = buildWithdrawRequest(pool, {
  note,
  leafIndex: dep.leafIndex,
  spendingKey,
  recipient: "destination",
  amount: 100n,
  fee: 0n,
});
for (let i = 0; i < 3; i++) {
  pool.deposit({ value: 1n, assetId: 1n, ownerKey: deriveOwnerKey(randomSecret()), blinding: randomBlinding() });
}
attempt("stale root", () => pool.withdraw(stale.request));

// 3. A fresh request is accepted, the same request replayed is a double spend.
const fresh = buildWithdrawRequest(pool, {
  note,
  leafIndex: dep.leafIndex,
  spendingKey,
  recipient: "destination",
  amount: 100n,
  fee: 0n,
});
attempt("first spend", () => pool.withdraw(fresh.request));
attempt("replay", () => pool.withdraw(fresh.request));
