# Contributing

Thanks for reading the model closely. This repository is a research reference for the Hash Chain private note model, so the most useful contributions are corrections and counterexamples.

Issues and discussion are welcome. Code contributions (pull requests) are not accepted for now. The source is all rights reserved, so any code contribution would need a written agreement with Hash Chain first. Please open an issue instead and describe the change you have in mind.

## Ways to contribute

- **Report a mismatch** between the model and the [spec](https://github.com/HashChainL0/protocol-spec). Say which document and rule.
- **Add a failing test** that shows a withdrawal the model accepts and should reject, or the reverse.
- **Point out small things** such as typos and unclear wording in an issue.
- **Report a security problem** privately. See [SECURITY.md](SECURITY.md).

## If a change has been agreed

This applies only after a written agreement.

1. Create a branch.
2. Change one topic per pull request.
3. Run `npm run typecheck` and `npm test`. Both must pass.
4. If you change a rule, update `docs/MODEL.md` and add or change tests, including the rejection cases.
5. Explain in the description what changed and why, and link the spec section it follows.

## Style

- TypeScript strict, ESM, no `any`, no runtime dependencies.
- The model stays deterministic: no clocks, I/O or network. Randomness is only in the optional helpers that make secrets.
- Use the spec's terms: note, commitment, nullifier, nullifier key, Merkle tree, anonymity set.
- Do not describe the model as audited, deployed or safe for funds.
- Do not describe the stand-in hash or the checked predicates as real cryptography. Defaults are placeholders and say so.
- Use commas, colons and periods. Do not use em dashes.
- Comments only where the logic is not obvious.

## Code of Conduct

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

The repository is all rights reserved, see [LICENSE](LICENSE). Nothing you submit in an issue or discussion grants anyone a license to the code, and a code contribution is only considered under a written agreement.
