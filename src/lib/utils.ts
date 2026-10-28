const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/**
 * generates a random string of a given `length`
 *
 * @param length string length
 */
export const randomString = (length: number) => {
  // random values as bytes
  const bytes = crypto.getRandomValues(new Uint8Array(length))

  // return random string
  return Array.from(bytes, (byte) => {
    return ALPHABET[byte % ALPHABET.length]
  }).join("")
}
