/**
 * generates a session token encoded as `base64url`
 */
export const generateSessionToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `cbt_${Buffer.from(bytes).toString("base64url")}`
}

/**
 * calculates a session token's digest
 *
 * @param token token to calculate digest for
 * @returns token digest encoded as `hex`
 */
export const sessionTokenDigest = (token: string) => {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex")
}
