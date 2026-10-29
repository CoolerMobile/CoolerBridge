const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/**
 * generates a human-readable code matching `ABCD-ABCD`
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

/**
 * normalizes pairing code for in-algorithm operations
 *
 * @param code
 */
const normalizeCode = (code: string) => code.trim().toUpperCase().replaceAll("-", "")

/**
 * calculates a given `code`'s digest
 *
 * @param code
 * @returns code digest encoded as hex
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

/**
 * generates a session token encoded as `base64url`
 */
export const generateSessionToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `cbt_${Buffer.from(bytes).toString("base64url")}`
}

/**
 * calculates a token's digest
 *
 * @param token token to calculate digest for
 * @returns token digest encoded as `hex`
 */
export const tokenDigest = (token: string) => {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex")
}
