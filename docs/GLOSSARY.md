# Glossary

> Research model. Not a working pool. These are the terms the code and the other pages use, in the same words as the [spec](https://github.com/HashChainL0/protocol-spec).

| Term | Meaning in this model |
| --- | --- |
| Note | A private unit of value: `value`, `assetId`, `ownerKey` and `blinding`. Spent whole, never in part |
| Commitment | `Hash(value, assetId, ownerKey, blinding)`. The only part of a note that is stored in the tree |
| Blinding | A random value that makes two notes with equal fields have different commitments |
| Spending key | The one secret of the model. The owner key and the nullifier key are derived from it |
| Owner key | The public key a note is locked to, derived from the spending key |
| Nullifier key | A key derived from the spending key and used only to compute nullifiers |
| Nullifier | `Hash(nullifierKey, commitment, leafPosition)`. Published when a note is spent. A second withdrawal with the same nullifier is a double spend |
| Leaf position | The index at which a commitment was inserted. It is part of the nullifier |
| Merkle tree | A fixed-depth, append-only tree of commitments with precomputed zero hashes for empty positions |
| Root | The hash at the top of the tree. Changes with every insert |
| Root history window | The last N roots the pool still accepts. The current root counts |
| Stale root | A root that has aged out of the window. A request built against it is rejected and must be rebuilt |
| Inclusion proof | The leaf, its index and the sibling hashes from the leaf up to just below the root |
| Witness | The private inputs of a withdrawal: the note, its position, the path, the spending key and the change note. The model hands them to the pool, a real pool would hide them behind a proof |
| Withdrawal | Spends one note: pays out an amount and a fee and may create one change note |
| Change note | The remainder of a partial withdrawal, appended as a new leaf. It can go to a different owner key |
| Fee | The part of a withdrawal paid to a relayer or the pool operator. May be zero |
| Association set | An optional allow-list of deposit commitments, kept as its own Merkle tree and published by a curator as a root |
| Association root | The root of an association set. The pool decides which published roots it accepts and can retire them |
| Origin label | The deposit a note descends from. Change notes inherit the label of the note they came from. In the model this is a table in the pool, a real design would bind it into the commitment |
| Stand-in hash | SHA-256 over domain-separated, length-framed inputs. A placeholder for a circuit-friendly hash |

See [MODEL.md](MODEL.md) for the checks a withdrawal passes and [API.md](API.md) for the exports.
