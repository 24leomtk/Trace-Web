import { createHash } from "node:crypto"

/** SHA-256 of a raw key — the only form ever stored. */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}
