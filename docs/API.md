# API

> Research model. Not a working pool. Every function is deterministic apart from the two random helpers, and no function touches a network or a clock. Every default number is an illustrative placeholder.

Everything is exported from `src/index.ts` (`dist/src/index.js` after `npm run build`).

## Conventions

- Values, asset ids and blinding are `bigint`. Leaf indexes are `number`.
- Hashes, owner keys and spending keys are `Hash`: 64 lowercase hex characters.
- Invalid arguments such as a bad depth or a malformed hash throw a `RangeError` that names the argument.
- A rule the pool enforces throws a `PoolError` subclass with a `code`. All classes are in `errors.ts`.
- A rejected withdrawal changes no state.
- `verifyMerkleProof` and `verifyAssociation` return a boolean and never throw on malformed input.

## Hash (`hash.ts`)

| Export | Purpose |
| --- | --- |
| `hashDomain(domain, ...parts)` | SHA-256 over a domain tag and framed parts. Parts are `bigint`, safe integer `number` or `Hash` |
| `DOMAINS` | The domain tags used by the model |
| `isHash(value)` | Type guard for `Hash` |
| `randomSecret()`, `randomBlinding()` | Random spending key and blinding for examples |

## Notes (`note.ts`)

| Export | Purpose |
| --- | --- |
| `Note` | `{ value, assetId, ownerKey, blinding }` |
| `commitment(note)` | Commitment of a valid note. Throws `InvalidNoteError` for a bad note |
| `nullifier(note, spendingKey, leafIndex)` | Nullifier for a note at a leaf position |
| `deriveOwnerKey(spendingKey)`, `deriveNullifierKey(spendingKey)` | Keys derived from one spending key |
| `assertValidNote(note)` | Value from 1 to 2^64 - 1, asset from 0 to 2^64 - 1, well formed keys |

## Merkle tree (`merkle.ts`)

| Export | Purpose |
| --- | --- |
| `new MerkleTree({ depth?, rootHistorySize? })` | Depth 1 to 32, default 20. History default 30 |
| `tree.insert(leaf)` | Returns the leaf index. Throws `TreeFullError` at capacity |
| `tree.root()`, `tree.recentRoots()`, `tree.isKnownRoot(root)` | Current root and the accepted window |
| `tree.prove(index)` | `MerkleProof` against the current root |
| `verifyMerkleProof(proof, depth?)` | Checks a proof, and the path length when `depth` is given |
| `computeRootFromPath`, `computeZeroHashes`, `emptyRoot` | Lower level helpers |

## Pool (`pool.ts`)

| Export | Purpose |
| --- | --- |
| `new Pool({ depth?, rootHistorySize?, associationDepth?, requireAssociation? })` | Empty pool |
| `pool.deposit(note)` | `{ leafIndex, commitment, root }`. Throws `DuplicateCommitmentError` for a repeat |
| `pool.withdraw(request)` | `WithdrawResult`. See the check order in [MODEL.md](MODEL.md) |
| `buildWithdrawRequest(pool, params)` | Wallet side: builds a request and the change note against the current root |
| `pool.root()`, `pool.recentRoots()`, `pool.isKnownRoot(root)` | Tree views |
| `pool.isSpent(nullifier)`, `pool.nullifierCount` | Spent set |
| `pool.balanceOf(assetId)`, `pool.feesCollected(assetId)` | Public value held and fees paid out |
| `pool.proveInclusion(leafIndex)` | Inclusion proof against the current root |
| `pool.acceptAssociationRoot(root)`, `pool.retireAssociationRoot(root)`, `pool.isAssociationRootAccepted(root)` | Association roots the pool accepts |
| `pool.labelOf(commitment)` | Origin deposit of a note, a stand-in described in [MODEL.md](MODEL.md) |

## Association set (`associationSet.ts`)

| Export | Purpose |
| --- | --- |
| `new AssociationSet({ depth? })` | Empty allow-list |
| `set.add(commitment)` | Adds a deposit commitment. Idempotent |
| `set.root()`, `set.has(commitment)`, `set.size` | Views |
| `set.prove(commitment)` | `AssociationEvidence`. Throws `NotInAssociationSetError` for a non-member |
| `verifyAssociation(label, evidence, depth?)` | Boolean check |

## Errors (`errors.ts`)

| Class | Code |
| --- | --- |
| `InvalidNoteError` | `INVALID_NOTE` |
| `InvalidRequestError` | `INVALID_REQUEST` |
| `TreeFullError` | `TREE_FULL` |
| `DuplicateCommitmentError` | `DUPLICATE_COMMITMENT` |
| `StaleRootError` | `STALE_ROOT` |
| `DoubleSpendError` | `DOUBLE_SPEND` |
| `WrongKeyError` | `WRONG_KEY` |
| `InvalidInclusionProofError` | `INVALID_INCLUSION_PROOF` |
| `NullifierMismatchError` | `NULLIFIER_MISMATCH` |
| `AssetMismatchError` | `ASSET_MISMATCH` |
| `ValueMismatchError` | `VALUE_MISMATCH` |
| `ChangeMismatchError` | `CHANGE_MISMATCH` |
| `AssociationRequiredError` | `ASSOCIATION_REQUIRED` |
| `UnknownAssociationRootError` | `UNKNOWN_ASSOCIATION_ROOT` |
| `NotInAssociationSetError` | `NOT_IN_ASSOCIATION_SET` |
