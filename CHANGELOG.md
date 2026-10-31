# Changelog

All notable changes to this repository are documented in this file.

Versions describe the state of the model, not a deployed protocol.

## [Unreleased]

### Added

- Property-style Merkle tree tests across depths and positions.
- Association set edge-case tests for capacity, evidence and root handling.
- Pool accounting tests for assets, fees and chained partial withdrawals.
- `docs/GLOSSARY.md`, a list of the terms used in the code and the docs.

### Changed

- JSDoc on the pool and Merkle tree accessors. No behavior change.

## [0.1.0] - 2026-10-28

### Added

- Domain-separated SHA-256 stand-in hash in `src/hash.ts`, with a note that the real hash is out of scope.
- `Note`, `commitment`, `nullifier` and key derivation in `src/note.ts`. The nullifier follows the spec: nullifier key, commitment and leaf position.
- Fixed-depth incremental Merkle tree in `src/merkle.ts` with configurable depth (default 20), zero hashes, a root history window, inclusion proofs and `verifyMerkleProof`.
- `Pool` in `src/pool.ts` with `deposit` and `withdraw`. Withdrawals can be partial, pay a fee and create a change note. A request builder covers the wallet side.
- One error class per rejection in `src/errors.ts`: stale root, double spend, wrong key, bad inclusion proof, nullifier mismatch, asset mismatch, value mismatch, change mismatch, duplicate commitment, full tree and the association errors.
- Optional association set in `src/associationSet.ts`, with pool support for accepted roots, retired roots and a require flag. Change notes inherit the origin of the note they came from.
- Vitest suites for hashing, notes, the tree, the pool and the association set.
- `docs/MODEL.md`, `docs/API.md`, two runnable examples and the `example:*` npm scripts.
- CI that runs typecheck, tests and build.
