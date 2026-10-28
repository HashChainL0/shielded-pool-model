import {
  AssociationSet,
  Pool,
  buildWithdrawRequest,
  deriveOwnerKey,
  randomBlinding,
  randomSecret,
} from "../src/index.js";

// Withdraw part of a note twice. The change note stays in the pool. The pool
// requires an association set proof, and the change keeps the origin of the
// deposit it came from.
const pool = new Pool({ depth: 8, rootHistorySize: 10, requireAssociation: true });
const allowList = new AssociationSet({ depth: 8 });
const spendingKey = randomSecret();
const note = { value: 1000n, assetId: 1n, ownerKey: deriveOwnerKey(spendingKey), blinding: randomBlinding() };

const dep = pool.deposit(note);
allowList.add(dep.commitment);
pool.acceptAssociationRoot(allowList.root());

let current = note;
let leafIndex = dep.leafIndex;
for (const [recipient, amount, fee] of [
  ["destination-1", 300n, 5n],
  ["destination-2", 200n, 5n],
] as const) {
  const built = buildWithdrawRequest(pool, {
    note: current,
    leafIndex,
    spendingKey,
    recipient,
    amount,
    fee,
    associationSet: allowList,
  });
  const res = pool.withdraw(built.request);
  console.log(`withdraw ${amount} to ${recipient}, fee ${fee}, change leaf ${res.changeLeafIndex}`);
  console.log("  pool balance", pool.balanceOf(1n), "fees", pool.feesCollected(1n), "leaves", pool.size);
  if (built.change === null || res.changeLeafIndex === null) break;
  current = built.change;
  leafIndex = res.changeLeafIndex;
}
console.log("remaining change note value", current.value);
