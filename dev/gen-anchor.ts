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

// write keys to the gitignored keys dir
// the private key belongs in cooler cloud, keep it out of the repo
await Bun.write("./keys/cloud-private.pem", privatePem)
await Bun.write("./keys/cloud-public.pem", publicPem)

// log results, the public key is pasted into auth/anchors as a baked anchor
console.info(`Generated CoolerCloud signing key-pair (kid: ${kid})`)
console.log()
console.info("Private key -> keys/cloud-private.pem (install in cooler cloud, never commit)")
console.info("Public key  -> keys/cloud-public.pem (bake into src/auth/anchors.ts)")
console.log()
console.info(publicPem)
