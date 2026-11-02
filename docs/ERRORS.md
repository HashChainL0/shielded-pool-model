# Errors

Every rule the pool enforces maps to one error class and one `code`. All classes extend `PoolError`, defined in `src/errors.ts`. A rejected call never changes pool state.

| Code | Class | Raised when |
| --- | --- | --- |
| `INVALID_NOTE` | `InvalidNoteError` | A note has a value, asset id, owner key or blinding outside its allowed range |
| `INVALID_REQUEST` | `InvalidRequestError` | A request is malformed: bad root or nullifier format, zero amount, negative fee or empty recipient |
| `TREE_FULL` | `TreeFullError` | A deposit is made into a tree with no free leaf |
| `DUPLICATE_COMMITMENT` | `DuplicateCommitmentError` | A commitment already in the tree is deposited again |
| `STALE_ROOT` | `StaleRootError` | The request refers to a root outside the root history window |
| `DOUBLE_SPEND` | `DoubleSpendError` | The nullifier has already been spent |
| `WRONG_KEY` | `WrongKeyError` | The spending key does not match the note owner key |
| `INVALID_INCLUSION_PROOF` | `InvalidInclusionProofError` | The Merkle path does not lead to the stated root |
| `NULLIFIER_MISMATCH` | `NullifierMismatchError` | The nullifier does not match the note, key and leaf index |
| `ASSET_MISMATCH` | `AssetMismatchError` | The request, spent note and change note do not all use the same asset |
| `VALUE_MISMATCH` | `ValueMismatchError` | The spent value is not amount plus fee plus change |
| `CHANGE_MISMATCH` | `ChangeMismatchError` | The change commitment and change note do not match, or only one of them is given |
| `ASSOCIATION_REQUIRED` | `AssociationRequiredError` | The pool requires association evidence and none was given |
| `UNKNOWN_ASSOCIATION_ROOT` | `UnknownAssociationRootError` | The association root is not one the pool accepts |
| `NOT_IN_ASSOCIATION_SET` | `NotInAssociationSetError` | The evidence does not show the note origin is in the set |

## Handling

Check `err.code` rather than the class name or the message. Codes are part of the public API. Messages may change.

A few input checks outside a withdrawal, such as a malformed association root or a negative leaf index, throw a plain `RangeError` instead.

```ts
try {
  pool.withdraw(request);
} catch (err) {
  if (err instanceof PoolError && err.code === "STALE_ROOT") {
    // rebuild the request against the current root
  } else {
    throw err;
  }
}
```

`npm run example:rejections` prints the codes for a wrong key, a stale root and a replay.
