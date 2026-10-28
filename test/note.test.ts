import { describe, expect, it } from "vitest";
import {
  InvalidNoteError,
  commitment,
  deriveOwnerKey,
  hashDomain,
  isHash,
  nullifier,
  randomBlinding,
  randomSecret,
} from "../src/index.js";
import { ALICE_KEY, BOB_KEY, makeNote } from "./helpers.js";

describe("hashDomain", () => {
  it("is deterministic and returns 64 hex characters", () => {
    const a = hashDomain("test.domain", 1n, 2);
    expect(a).toBe(hashDomain("test.domain", 1n, 2));
    expect(isHash(a)).toBe(true);
  });

  it("separates domains", () => {
    expect(hashDomain("domain.a", 1n)).not.toBe(hashDomain("domain.b", 1n));
  });

  it("separates part types and framing", () => {
    expect(hashDomain("d", 1n)).not.toBe(hashDomain("d", 1));
    expect(hashDomain("d", 1n, 2n)).not.toBe(hashDomain("d", 12n));
  });

  it("rejects bad parts and domains", () => {
    expect(() => hashDomain("d", -1n)).toThrow(RangeError);
    expect(() => hashDomain("d", 1n << 256n)).toThrow(RangeError);
    expect(() => hashDomain("d", "not hex")).toThrow(RangeError);
    expect(() => hashDomain("d", 1.5)).toThrow(RangeError);
    expect(() => hashDomain("", 1n)).toThrow(RangeError);
  });

  it("random helpers produce valid values", () => {
    expect(isHash(randomSecret())).toBe(true);
    expect(randomBlinding() >= 0n).toBe(true);
    expect(randomSecret()).not.toBe(randomSecret());
  });
});

describe("commitment", () => {
  it("is deterministic", () => {
    const n = makeNote(10n);
    expect(commitment(n)).toBe(commitment({ ...n }));
  });

  it("changes with every field", () => {
    const n = makeNote(10n);
    const base = commitment(n);
    expect(commitment({ ...n, value: 11n })).not.toBe(base);
    expect(commitment({ ...n, assetId: 2n })).not.toBe(base);
    expect(commitment({ ...n, ownerKey: deriveOwnerKey(BOB_KEY) })).not.toBe(base);
    expect(commitment({ ...n, blinding: n.blinding + 1n })).not.toBe(base);
  });

  it("hides equal notes behind different blinding", () => {
    const a = { ...makeNote(10n), blinding: 1n };
    const b = { ...a, blinding: 2n };
    expect(commitment(a)).not.toBe(commitment(b));
  });

  it("rejects invalid notes", () => {
    const n = makeNote(10n);
    expect(() => commitment({ ...n, value: 0n })).toThrow(InvalidNoteError);
    expect(() => commitment({ ...n, value: -5n })).toThrow(InvalidNoteError);
    expect(() => commitment({ ...n, value: 1n << 64n })).toThrow(InvalidNoteError);
    expect(() => commitment({ ...n, assetId: -1n })).toThrow(InvalidNoteError);
    expect(() => commitment({ ...n, ownerKey: "zz" })).toThrow(InvalidNoteError);
    expect(() => commitment({ ...n, blinding: -1n })).toThrow(InvalidNoteError);
  });
});

describe("nullifier", () => {
  it("is deterministic per note, key and position", () => {
    const n = makeNote(10n);
    expect(nullifier(n, ALICE_KEY, 3)).toBe(nullifier(n, ALICE_KEY, 3));
  });

  it("depends on key and leaf position", () => {
    const n = makeNote(10n);
    expect(nullifier(n, ALICE_KEY, 3)).not.toBe(nullifier(n, BOB_KEY, 3));
    expect(nullifier(n, ALICE_KEY, 3)).not.toBe(nullifier(n, ALICE_KEY, 4));
  });

  it("is not the commitment", () => {
    const n = makeNote(10n);
    expect(nullifier(n, ALICE_KEY, 0)).not.toBe(commitment(n));
  });

  it("rejects a bad leaf index", () => {
    expect(() => nullifier(makeNote(1n), ALICE_KEY, -1)).toThrow(RangeError);
  });
});
