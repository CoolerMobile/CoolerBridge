/**
 * generates a cryptographically-random secret
 */
export const genSecret = () => {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")
}
