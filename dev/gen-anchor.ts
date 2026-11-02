import { exportPKCS8, exportSPKI, generateKeyPair } from "jose"

// kid from args, defaults to a year-stamped label
// the same value must be stamped on the assertions cloud signs with this key
const kid = process.argv[2] ?? `cloud-${new Date().getFullYear()}`

// key-pair
const { privateKey, publicKey } = await generateKeyPair("Ed25519", {
  extractable: true,
})

// export keys
const privatePem = await exportPKCS8(privateKey)
const publicPem = await exportSPKI(publicKey)

// the private key belongs in cooler cloud, keep it in the gitignored keys dir
await Bun.write("./keys/cloud-private.pem", privatePem)

// the public key is a committed anchor, written straight to its home
const anchorPath = `./src/auth/anchors/${kid}.pem`
await Bun.write(anchorPath, publicPem)

// log results, register the anchor in auth/anchors to start trusting it
console.info(`Generated CoolerCloud signing key-pair (kid: ${kid})`)
console.log()
console.info("Private key -> keys/cloud-private.pem (install in cooler cloud, never commit)")
console.info(`Public key  -> ${anchorPath} (committed anchor)`)
console.log()
console.info(`Register it in src/auth/anchors.ts:`)
console.info(`  { kid: "${kid}", pem: await readAnchorPem("${kid}.pem") }`)
