import { createHash, randomBytes } from "node:crypto";

/**
 * Hash stand-in. A real shielded pool uses a hash that is cheap inside a
 * zero-knowledge circuit. Choosing that hash is out of scope for this model, so
 * SHA-256 from `node:crypto` is used over domain-separated, length-framed
 * encodings. It is a placeholder that lets the structure be tested. It is not a
 * claim about what the protocol will use.
 */

/** A 32 byte value as 64 lowercase hex characters. */
export type Hash = string;

/** Inputs a domain-separated hash accepts. Strings must be `Hash` values. */
export type HashPart = bigint | number | Hash;

const HEX32 = /^[0-9a-f]{64}$/;
const MAX_FIELD = (1n << 256n) - 1n;

export const DOMAINS = {
  commitment: "hashchain.model.note.commitment.v1",
  nullifier: "hashchain.model.note.nullifier.v1",
  ownerKey: "hashchain.model.key.owner.v1",
  nullifierKey: "hashchain.model.key.nullifier.v1",
  emptyLeaf: "hashchain.model.merkle.empty-leaf.v1",
  node: "hashchain.model.merkle.node.v1",
} as const;

export function isHash(value: unknown): value is Hash {
  return typeof value === "string" && HEX32.test(value);
}

function frame(part: HashPart): Buffer {
  let tag: number;
  let n: bigint;
  if (typeof part === "bigint") {
    tag = 1;
    n = part;
  } else if (typeof part === "number") {
    if (!Number.isSafeInteger(part)) throw new RangeError("hash part must be a safe integer");
    tag = 2;
    n = BigInt(part);
  } else {
    if (!isHash(part)) throw new RangeError("hash part string must be 64 lowercase hex characters");
    tag = 3;
    n = BigInt(`0x${part}`);
  }
  if (n < 0n || n > MAX_FIELD) throw new RangeError("hash part out of range");
  const out = Buffer.alloc(33);
  out[0] = tag;
  out.write(n.toString(16).padStart(64, "0"), 1, "hex");
  return out;
}

/** SHA-256 over `len(domain) || domain || frame(part)...`. Returns lowercase hex. */
export function hashDomain(domain: string, ...parts: HashPart[]): Hash {
  const d = Buffer.from(domain, "utf8");
  if (d.length === 0 || d.length > 255) throw new RangeError("domain must be 1 to 255 bytes");
  const h = createHash("sha256");
  h.update(Buffer.from([d.length]));
  h.update(d);
  for (const p of parts) h.update(frame(p));
  return h.digest("hex");
}

/** A fresh random 32 byte secret, for examples. Tests use fixed values. */
export function randomSecret(): Hash {
  return randomBytes(32).toString("hex");
}

/** A fresh random blinding value below 2^256, for examples. */
export function randomBlinding(): bigint {
  return BigInt(`0x${randomBytes(32).toString("hex")}`);
}
