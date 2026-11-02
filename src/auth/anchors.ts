// #region Cloud Anchor
/**
 * @docs Shape of a baked-in Cooler cloud trust anchor: an Ed25519 public key in
 * SPKI PEM form, plus the optional `kid` cloud stamps on the assertions it
 * signs with the matching private key.
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

// #region Cloud Anchors
/**
 * @docs The Cooler cloud public keys shipped with the image. these are the
 * offline root of trust: a fresh bridge verifies pairing and access assertions
 * against them with zero configuration and without any network access.
 *
 * rotation is layered on top of these through jwks discovery in auth/keys, and
 * a self-hosted cloud can replace them entirely with CLOUD_PUBLIC_KEY. because
 * these are public keys, committing them here leaks nothing.
 *
 * to rotate, generate a new pair with `bun dev/gen-anchor.ts <kid>`, add its
 * public key here with the matching kid, and start signing with the new key in
 * cloud. keep the previous anchor until no live assertions reference it.
 */
export const cloudAnchors: CloudAnchor[] = [
  {
    kid: "cloud-2026",
    pem: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAvPrRbymSjddtvXXlJUu9OHXzzUj2vIWN+zXV4ivbbYc=
-----END PUBLIC KEY-----`,
  },
]
// #endregion
