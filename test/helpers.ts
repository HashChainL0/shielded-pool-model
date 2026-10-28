import { deriveOwnerKey, type Note } from "../src/note.js";
import type { Hash } from "../src/hash.js";

export const ALICE_KEY: Hash = "a1".repeat(32);
export const BOB_KEY: Hash = "b2".repeat(32);
export const ASSET = 1n;

let counter = 0n;

export function makeNote(value: bigint, spendingKey: Hash = ALICE_KEY, assetId: bigint = ASSET): Note {
  counter += 1n;
  return { value, assetId, ownerKey: deriveOwnerKey(spendingKey), blinding: 1000n + counter };
}
