const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

// #region Random String
/**
 * generates a random string of a given `length`
 *
 * @param length string length
 *
 * @docs Generates a random string of the requested length, drawn from an
 * unambiguous alphabet.
 */
export const randomString = (length: number) => {
  // random values as bytes
  const bytes = crypto.getRandomValues(new Uint8Array(length))

  // return random string
  return Array.from(bytes, (byte) => {
    return ALPHABET[byte % ALPHABET.length]
  }).join("")
}
// #endregion
