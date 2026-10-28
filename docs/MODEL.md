# Model

> Research model. Not a working pool. Proofs are checked predicates, not zero-knowledge proofs. Every default number is an illustrative placeholder.

## Summary

The model follows the note flow in the spec: a deposit creates a note and appends its commitment to a Merkle tree. A withdrawal spends one note by publishing its nullifier, optionally appends a change commitment, and pays value out. The pool refuses a withdrawal whose root is not recent, whose nullifier is already published, or whose statements do not hold.

## What is modeled

| Spec concept | Model |
| --- | --- |
| Note `(value, assetId, ownerKey, blinding)` | `Note` in `src/note.ts`. Value is limited to 64 bits, standing in for a circuit range check |
| Commitment `Hash(value, assetId, ownerKey, blinding)` | `commitment(note)` |
| Nullifier `Hash(nullifierKey, commitment, leafPosition)` | `nullifier(note, spendingKey, leafIndex)`. The nullifier key is derived from the spending key |
| Merkle tree, insert returns a leaf position | `MerkleTree.insert` |
| Recent valid roots | A window of the last N roots, the current root included |
| Reject if a nullifier is already spent | `DoubleSpendError` |
| Reject if the root is not recent | `StaleRootError` |
| Append new commitments, move public value | Change commitment appended, balance and fee tracked per asset |
| Selective disclosure through an allow-list | Optional association set |

## Checks that stand in for a proof

A withdrawal request has public fields (root, nullifier, asset, amount, fee, recipient, change commitment, optional association evidence) and a witness (the note, its leaf index, the sibling path, the spending key, the change note). `Pool.withdraw` checks, in this order, and stops at the first failure:

1. Shape: amount above zero, fee not negative, recipient not empty, hashes well formed. `InvalidRequestError`.
2. The root is among the recent roots. `StaleRootError`.
3. The nullifier is not in the spent set. `DoubleSpendError`.
4. The spending key derives the note's owner key. `WrongKeyError`.
5. The note's commitment is in the tree under the request root, along a path of the pool depth. `InvalidInclusionProofError`.
6. The nullifier is derived from the key, the commitment and the leaf index. `NullifierMismatchError`.
7. The note and the request use the same asset. `AssetMismatchError`.
8. The change note and the change commitment agree, and use the same asset. `ChangeMismatchError`, `AssetMismatchError`.
9. Note value equals amount plus fee plus change value. `ValueMismatchError`.
10. If association evidence is given or required, it is accepted and valid. `AssociationRequiredError`, `UnknownAssociationRootError`, `NotInAssociationSetError`.

Only after every check passes does the pool change state. The change commitment is inserted first, because inserting can still fail (duplicate commitment, full tree). A failed withdrawal leaves no nullifier behind.

## Roots and pending withdrawals

A request proves membership under a root. Appending leaves changes the root, so a request built against an older root stays valid while that root is inside the window and becomes `StaleRootError` after it ages out. The wallet rebuilds the request against the current root. The window length is a pool option.

## Partial withdrawal

The whole note is spent, never a part of it. The pool pays `amount` and `fee`, and the remainder becomes a new note whose commitment is appended as a new leaf. That note can be spent later like any other. The change owner key can be a different key.

## Association set

An association set is an allow-list of deposit commitments, kept as its own Merkle tree. A list curator publishes its root. A pool accepts and retires roots. A withdrawal can carry evidence that the deposit its funds came from is on the list, and a pool can require this.

Funds must keep their origin across change. The model keeps a table in the pool from each commitment to the deposit it descends from, and a change note takes the origin of the note it came from. A real design would bind this origin into the note commitment so the pool does not need the table. Here the table is a stand-in and it makes the pool learn the origin, which a real pool would not.

## What is not modeled

- Zero knowledge. The witness is given to the pool. Nothing is hidden.
- The hash. SHA-256 over framed inputs replaces a circuit-friendly hash.
- Key hierarchy. The spec has a spending key, a nullifier key, view keys and a scanning key. The model has one spending key from which the owner key and nullifier key are derived. View keys and epochs are out of scope. See spec section 08.
- Stealth addresses, one-time receiving keys and encrypted note payloads.
- Multi-input and multi-output transfers inside the pool. Only a one-input withdrawal with one change output is modeled.
- Public value movement. Deposits and withdrawals change balances in a map. There are no tokens or transfers.
- Anonymity set analysis, timing and amount linkage.
- Concurrency and ordering of updates. Calls are sequential.
- Persistence. All state is in memory.
- Association list curation, publication and dispute rules.

## Open questions

- Tree depth and root history length.
- Where the origin of a note lives and how a proof binds it.
- Whether a withdrawal may combine an association proof with a different list per input once multi-input spends exist.
