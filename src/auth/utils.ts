const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

// #region Generate Code
/**
 * generates a human-readable code matching `ABCD-ABCD`
 *
 * @docs Generates a human-readable pairing code in the ABCD-ABCD format.
 */
export const generateCode = () => {
  // section
  const section = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) => {
      return ALPHABET[byte % ALPHABET.length]
    }).join("")

  // return random string as "ABCD-ABCD"
  return `${section()}-${section()}`
}
// #endregion

// #region Normalize Code
/**
 * normalizes pairing code for in-algorithm operations
 *
 * @param code
 *
 * @docs Normalizes a pairing code for internal comparison by trimming,
 * upper-casing, and stripping separators.
 */
const normalizeCode = (code: string) => code.trim().toUpperCase().replaceAll("-", "")
// #endregion

// #region Code Digest
/**
 * calculates a given `code`'s digest
 *
 * @param code
 * @returns code digest encoded as hex
 *
 * @docs Computes a peppered SHA-256 digest of a pairing code, encoded as hex.
 */
export const codeDigest = (code: string) => {
  // normalized code
  const normalized = normalizeCode(code)

  // hasher based on pairing pepper
  const hasher = new Bun.CryptoHasher("sha256", Bun.env.PAIRING_PEPPER)

  // update hash with normalized data
  hasher.update(normalized)

  // return digest encoded as hex
  return hasher.digest("hex")
}
// #endregion

// #region Generate Session Token
/**
 * generates a session token encoded as `base64url`
 *
 * @docs Generates an opaque, URL-safe session token prefixed for easy
 * identification.
 */
export const generateSessionToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `cbt_${Buffer.from(bytes).toString("base64url")}`
}
// #endregion

// #region Token Digest
/**
 * calculates a token's digest
 *
 * @param token token to calculate digest for
 * @returns token digest encoded as `hex`
 *
 * @docs Computes a SHA-256 digest of a session token, encoded as hex.
 */
export const tokenDigest = (token: string) => {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex")
}
// #endregion
