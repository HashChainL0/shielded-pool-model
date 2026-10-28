# Security Policy

## Status

This repository is a research model. It holds no real keys, makes no network calls, moves no funds and contains no zero-knowledge proofs, so there is no deployed system to attack. Review of the model is still valuable, because a wrong rule here may point at a wrong rule in the spec.

## What to report

- A withdrawal the model accepts that would let a note be spent twice, or let value be created.
- A check that is missing or ordered so that a stale root, a wrong key or a mismatched value is accepted.
- A rule that disagrees with the spec in a way that matters.
- Anything in the docs that could mislead a reader into treating this code as a usable shielded pool.

## How to report

Please report privately. Open a **private security advisory** on this repository using the "Report a vulnerability" option under the Security tab. Do not open a public issue or pull request for a vulnerability.

Include, as far as you can:

- A description of the problem and the affected file or rule.
- A sequence of calls that shows it.
- The impact you expect.
- Any suggested fix.

## What to expect

- We will acknowledge the report in the advisory thread.
- We will work with you to confirm the issue.
- We will fix the model, and the spec if needed, and credit you if you wish.

## Safe harbor

Good-faith research and responsible disclosure under this policy will not be met with legal action.

## Bounties

There is no bounty program at this stage.
