// #region Generate Secret
/**
 * generates a cryptographically-random secret
 *
 * @docs Generates a cryptographically random, URL-safe secret.
 */
export const genSecret = () => {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")
}
// #endregion
