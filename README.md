# shielded-pool-model

![CI](https://github.com/HashChainL0/shielded-pool-model/actions/workflows/ci.yml/badge.svg)

A small reference model of the note-based shielded pool described in the [Hash Chain protocol spec](https://github.com/HashChainL0/protocol-spec). It has notes, commitments and nullifiers, a fixed-depth incremental Merkle tree with a root history window, a pool that supports deposits and partial withdrawals, and an optional association set, so the rules in the spec can be run, tested and argued about.

> **Research model. Not a working pool. Do not use with funds.** There are no real zero-knowledge proofs here. A proof is modeled as a set of checked predicates: the pool receives the private inputs (the witness) and checks the same statements a circuit would prove. Nothing is hidden. The hash is SHA-256 over domain-separated encodings, a stand-in for a circuit-friendly hash. This code holds no real keys and touches no network, RPC or wallet. Nothing here is audited or deployed. Parameters are placeholders.

## What's new in 0.1.0

- **Notes.** `{ value, assetId, ownerKey, blinding }`, a commitment over all four fields, and a nullifier derived from the nullifier key, the commitment and the leaf position, as in the spec.
- **Merkle tree.** Fixed depth (default 20), precomputed zero hashes, insert, root, a window of the last N accepted roots, inclusion proofs and a verifier.
- **Pool.** `deposit` returns a leaf index. `withdraw` spends one note, pays an amount and a fee and creates an optional change note. It rejects double spends, stale roots, wrong keys, bad inclusion paths, wrong nullifiers, asset mismatches and value mismatches, each with its own error class.
- **Association set.** An optional allow-list of deposit commitments. A withdrawal can prove that the deposit its funds came from is on the list, and a pool can require it.

## What this is not

- Not zero knowledge. The pool sees the note, the key and the path.
- Not a statement about which hash or proof system Hash Chain will use.
- Not a privacy analysis. Anonymity set size, timing and amount linkage are out of scope. See [docs/MODEL.md](docs/MODEL.md).

## Why

The shielded transfer rules in the spec are prose and a short pseudocode block. Prose hides gaps, such as what a stale root does to a pending withdrawal, or how change interacts with an allow-list. A small executable model makes those cases concrete and gives reviewers something to break.

## Quickstart

Node 22 or newer.

```sh
npm install
npm run typecheck
npm test
npm run build

npm run example:deposit-withdraw
npm run example:partial-withdraw
```

Examples compile to `dist/` with `tsc` and run with plain `node`. There are no runtime dependencies.

```ts
import { Pool, buildWithdrawRequest, deriveOwnerKey, randomBlinding, randomSecret } from "./src/index.js";

const pool = new Pool({ depth: 8 });
const spendingKey = randomSecret();
const note = { value: 100n, assetId: 1n, ownerKey: deriveOwnerKey(spendingKey), blinding: randomBlinding() };

const { leafIndex } = pool.deposit(note);
const { request, change } = buildWithdrawRequest(pool, {
  note,
  leafIndex,
  spendingKey,
  recipient: "destination-1",
  amount: 60n,
  fee: 1n,
});
pool.withdraw(request); // the 39 change note is now a new leaf in the pool
```

## Terms

Taken from the spec: note, commitment, nullifier, nullifier key, Merkle tree, anonymity set. The model adds the words **root history** (the recent roots a pool accepts), **witness** (the private inputs a proof would hide) and **association set** (an allow-list of deposit commitments).

## Layout

| Path | Contents |
| --- | --- |
| `src/hash.ts` | Domain-separated SHA-256 stand-in and secret helpers |
| `src/note.ts` | `Note`, `commitment`, `nullifier`, key derivation |
| `src/merkle.ts` | Fixed-depth incremental tree, root history, inclusion proofs |
| `src/pool.ts` | `Pool`, withdrawal request types and the wallet-side request builder |
| `src/associationSet.ts` | Association set and membership evidence |
| `src/errors.ts` | One error class per rejection |
| `examples/` | Runnable traces |
| `test/` | Vitest suites |
| `docs/MODEL.md` | What is modeled, what is not, and the checks that stand in for a proof |
| `docs/API.md` | Public exports by module, conventions and error handling |
| `docs/GLOSSARY.md` | The terms used in the code and the docs |

## Spec

- [03 Accounts and private transfers](https://github.com/HashChainL0/protocol-spec/blob/main/docs/03-accounts-and-private-transfers.md)
- [08 Proofs and view keys](https://github.com/HashChainL0/protocol-spec/blob/main/docs/08-proofs-and-view-keys.md)
- [Glossary](https://github.com/HashChainL0/protocol-spec/blob/main/docs/glossary.md)

## Open questions

- The hash, the tree depth and the root history length are placeholders. The spec leaves them to be specified.
- How the origin of a note is bound into its commitment so that change inherits it. The model keeps a table in the pool as a stand-in.
- How association roots are published, curated and retired. The model only lets a pool accept and retire roots.
- Data availability of encrypted note payloads is out of scope here and open in the spec.

## Contributing

Issues and discussion are welcome, especially ones that find a withdrawal the model gets wrong. Code contributions are not accepted for now. See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports go through [SECURITY.md](SECURITY.md). Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Links

- GitHub: https://github.com/HashChainL0
- Spec: https://github.com/HashChainL0/protocol-spec

## License

Copyright (c) 2026 Hash Chain. All rights reserved. The source is published for reference and review only, and no permission is granted to copy, modify, distribute, sublicense or use it without prior written permission. See [LICENSE](LICENSE). The protocol spec it models is licensed separately under CC BY 4.0. The Hash Chain name and logo are covered separately in the brand kit.
