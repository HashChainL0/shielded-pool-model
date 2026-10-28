import { Pool, buildWithdrawRequest, deriveOwnerKey, randomBlinding, randomSecret } from "../src/index.js";

// Deposit one note, then withdraw all of it. Small depth keeps the output short.
const pool = new Pool({ depth: 8, rootHistorySize: 10 });
const spendingKey = randomSecret();
const note = { value: 100n, assetId: 1n, ownerKey: deriveOwnerKey(spendingKey), blinding: randomBlinding() };

const dep = pool.deposit(note);
console.log("deposit      leaf", dep.leafIndex, "commitment", dep.commitment.slice(0, 16), "...");
console.log("             root ", dep.root.slice(0, 16), "...  balance", pool.balanceOf(1n));

const { request } = buildWithdrawRequest(pool, {
  note,
  leafIndex: dep.leafIndex,
  spendingKey,
  recipient: "destination-1",
  amount: 100n,
});
const res = pool.withdraw(request);
console.log("withdraw     amount", res.amount, "fee", res.fee, "nullifier", res.nullifier.slice(0, 16), "...");
console.log("             balance", pool.balanceOf(1n), "spent nullifiers", pool.nullifierCount);

try {
  pool.withdraw(request);
} catch (e) {
  console.log("replay       rejected:", (e as Error).name);
}
