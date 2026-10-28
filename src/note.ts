import { DOMAINS, hashDomain, isHash, type Hash } from "./hash.js";
import { InvalidNoteError } from "./errors.js";

/**
 * A private unit of value. Field names follow the spec:
 * `Hash(value, assetId, ownerKey, blinding)` is the commitment.
 */
export interface Note {
  /** Amount in the smallest unit of the asset. */
  readonly value: bigint;
  /** Which asset. */
  readonly assetId: bigint;
  /** Public key that owns the note, derived from a spending key. */
  readonly ownerKey: Hash;
  /** Random value that hides the note. */
  readonly blinding: bigint;
}

export type Commitment = Hash;
export type Nullifier = Hash;

/** Notes carry a 64 bit value, which stands in for the range check a circuit enforces. */
export const MAX_NOTE_VALUE = (1n << 64n) - 1n;
export const MAX_ASSET_ID = (1n << 64n) - 1n;
export const MAX_BLINDING = (1n << 256n) - 1n;

export function assertValidNote(note: Note): void {
  if (typeof note.value !== "bigint" || note.value <= 0n || note.value > MAX_NOTE_VALUE) {
    throw new InvalidNoteError("value must be a bigint from 1 to 2^64 - 1");
  }
  if (typeof note.assetId !== "bigint" || note.assetId < 0n || note.assetId > MAX_ASSET_ID) {
    throw new InvalidNoteError("assetId must be a bigint from 0 to 2^64 - 1");
  }
  if (!isHash(note.ownerKey)) {
    throw new InvalidNoteError("ownerKey must be 64 lowercase hex characters");
  }
  if (typeof note.blinding !== "bigint" || note.blinding < 0n || note.blinding > MAX_BLINDING) {
    throw new InvalidNoteError("blinding must be a bigint from 0 to 2^256 - 1");
  }
}

/** Public owner key for a spending key. The model collapses the key tree of the spec to one secret. */
export function deriveOwnerKey(spendingKey: Hash): Hash {
  return hashDomain(DOMAINS.ownerKey, spendingKey);
}

/** Nullifier key for a spending key. The spec keeps this separate from view keys. */
export function deriveNullifierKey(spendingKey: Hash): Hash {
  return hashDomain(DOMAINS.nullifierKey, spendingKey);
}

export function commitment(note: Note): Commitment {
  assertValidNote(note);
  return hashDomain(DOMAINS.commitment, note.value, note.assetId, note.ownerKey, note.blinding);
}

/**
 * `Hash(nullifierKey, commitment, leafPosition)`. Unique per note and tree
 * position, and not computable from the commitment without the key.
 */
export function nullifier(note: Note, spendingKey: Hash, leafIndex: number): Nullifier {
  if (!Number.isSafeInteger(leafIndex) || leafIndex < 0) {
    throw new RangeError("leafIndex must be a non-negative integer");
  }
  return hashDomain(DOMAINS.nullifier, deriveNullifierKey(spendingKey), commitment(note), leafIndex);
}
