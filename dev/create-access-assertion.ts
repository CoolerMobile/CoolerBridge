import { importPKCS8, SignJWT } from "jose"
import { config } from "@/config"

// bridge id from args
const bridgeId = process.argv[2]

// exit early if bridge id was not provided
if (!bridgeId) {
  console.error("Bridge ID not provided\n")
  console.info("Usage: bun dev:access <cloud-bridge-id>")

  process.exit(1)
}

// import private key
const privatePem = await Bun.file("./dev/keys/cooler-private.pem").text()
const privateKey = await importPKCS8(privatePem, "Ed25519")

// assertion
const assertion = await new SignJWT({
  bridgeId,
  scope: ["events:read", "devices:write"],
})
  .setProtectedHeader({
    alg: "Ed25519",
    typ: config.cloud.tokenTypes.access,
  })
  .setJti(crypto.randomUUID())
  .setSubject("usr_dev_danfq")
  .setIssuer("https://cloud.getcooler.app")
  .setAudience("coolerbridge")
  .setIssuedAt()
  .setExpirationTime("5m")
  .sign(privateKey)

// log result
console.info("Assertion result:", assertion)
