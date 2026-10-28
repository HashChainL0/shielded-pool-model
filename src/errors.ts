/** Typed rejections. Every rule the pool enforces maps to one class. */

export type PoolErrorCode =
  | "INVALID_NOTE"
  | "INVALID_REQUEST"
  | "TREE_FULL"
  | "DUPLICATE_COMMITMENT"
  | "STALE_ROOT"
  | "DOUBLE_SPEND"
  | "WRONG_KEY"
  | "INVALID_INCLUSION_PROOF"
  | "NULLIFIER_MISMATCH"
  | "ASSET_MISMATCH"
  | "VALUE_MISMATCH"
  | "CHANGE_MISMATCH"
  | "ASSOCIATION_REQUIRED"
  | "UNKNOWN_ASSOCIATION_ROOT"
  | "NOT_IN_ASSOCIATION_SET";

export class PoolError extends Error {
  readonly code: PoolErrorCode;
  constructor(code: PoolErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class InvalidNoteError extends PoolError {
  constructor(message: string) {
    super("INVALID_NOTE", message);
  }
}

export class InvalidRequestError extends PoolError {
  constructor(message: string) {
    super("INVALID_REQUEST", message);
  }
}

export class TreeFullError extends PoolError {
  constructor(capacity: number) {
    super("TREE_FULL", `tree is full (capacity ${capacity})`);
  }
}

export class DuplicateCommitmentError extends PoolError {
  constructor() {
    super("DUPLICATE_COMMITMENT", "commitment is already in the tree");
  }
}

export class StaleRootError extends PoolError {
  constructor() {
    super("STALE_ROOT", "root is not among the recent accepted roots");
  }
}

export class DoubleSpendError extends PoolError {
  constructor() {
    super("DOUBLE_SPEND", "nullifier has already been published");
  }
}

export class WrongKeyError extends PoolError {
  constructor() {
    super("WRONG_KEY", "spending key does not match the note owner key");
  }
}

export class InvalidInclusionProofError extends PoolError {
  constructor() {
    super("INVALID_INCLUSION_PROOF", "note commitment is not in the tree under the given root");
  }
}

export class NullifierMismatchError extends PoolError {
  constructor() {
    super("NULLIFIER_MISMATCH", "nullifier is not correctly derived from the spent note");
  }
}

export class AssetMismatchError extends PoolError {
  constructor() {
    super("ASSET_MISMATCH", "request, spent note and change note must use the same asset");
  }
}

export class ValueMismatchError extends PoolError {
  constructor() {
    super("VALUE_MISMATCH", "spent value must equal amount plus fee plus change");
  }
}

export class ChangeMismatchError extends PoolError {
  constructor(message: string) {
    super("CHANGE_MISMATCH", message);
  }
}

export class AssociationRequiredError extends PoolError {
  constructor() {
    super("ASSOCIATION_REQUIRED", "this pool requires an association set proof");
  }
}

export class UnknownAssociationRootError extends PoolError {
  constructor() {
    super("UNKNOWN_ASSOCIATION_ROOT", "association root is not accepted by this pool");
  }
}

export class NotInAssociationSetError extends PoolError {
  constructor() {
    super("NOT_IN_ASSOCIATION_SET", "note origin is not a member of the association set");
  }
}
