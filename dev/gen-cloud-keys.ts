import { exportPKCS8, exportSPKI, generateKeyPair } from "jose"

// key-pair
const { privateKey, publicKey } = await generateKeyPair("Ed25519", {
  extractable: true,
})

// export keys
const privatePem = await exportPKCS8(privateKey)
const publicPem = await exportSPKI(publicKey)

// write keys to files
await Bun.write("./dev/keys/cooler-private.pem", privatePem)
await Bun.write("./dev/keys/cooler-public.pem", publicPem)

// log results
console.info("Generated CoolerCloud development keys")
console.log()
console.info(publicPem)
