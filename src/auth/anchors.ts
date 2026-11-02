// #region Cloud Anchor
/**
 * @docs Shape of a baked-in CoolerCloud trust anchor: an Ed25519 public key in
 * SPKI PEM form, plus the optional `kid` CoolerCloud stamps on the assertions
 * it signs with the matching private key.
 *
 * when `kid` is set it is matched against the assertion header so a specific
 * key can be selected during rotation. an anchor without a `kid` is treated as
 * a wildcard and tried for any assertion.
 */
export type CloudAnchor = {
  // key id, matched against the assertion header `kid` when present
  kid?: string
  // Ed25519 public key, SPKI PEM
  pem: string
}
// #endregion

// #region Read Anchor
/**
 * reads a committed anchor pem next to this module
 *
 * @param file pem file name under anchors/
 *
 * @docs Reads a baked anchor pem from the anchors/ directory. the files ship
 * in the image alongside the source, so the read works offline at runtime.
 *
 * @returns {Promise<string>} the pem contents
 */
const readAnchorPem = (file: string) => Bun.file(new URL(`./anchors/${file}`, import.meta.url)).text()
// #endregion

// #region Cloud Anchors
/**
 * @docs The CoolerCloud public keys shipped with the image. these are the
 * offline root of trust: a fresh bridge verifies pairing and access assertions
 * against them with zero configuration and without any network access.
 *
 * rotation is layered on top of these through jwks discovery in auth/keys, and
 * CLOUD_PUBLIC_KEY can replace them for development and testing. because these
 * are public keys, committing them here leaks nothing.
 *
 * to rotate, generate a new pair with `bun dev/gen-anchor.ts <kid>`, register
 * its public key here with the matching kid, and start signing with the new key
 * in CoolerCloud. keep the previous anchor until no live assertions reference it.
 */
export const cloudAnchors: CloudAnchor[] = [
  {
    kid: "cloud-2026",
    pem: await readAnchorPem("cloud-2026.pem"),
  },
]
// #endregion
