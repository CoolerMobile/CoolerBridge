import { importPKCS8, SignJWT } from "jose"

// pairing id from args
const pairingId = process.argv[2]

// exit early if pairing id was not provided
if (!pairingId) {
  console.error("Pairing ID not provided\n")
  console.info("Usage: bun dev:pair <pairing-id>")

  process.exit(1)
}

// import private key
const privatePem = await Bun.file("./dev/keys/cooler-private.pem").text()
const privateKey = await importPKCS8(privatePem, "Ed25519")

// cloud data
const cloudUserId = "usr_dev_danfq"
const cloudBridgeId = `cb_${crypto.randomUUID()}`

// assertion
const assertion = await new SignJWT({ bridgeId: cloudBridgeId, pairingId })
  .setProtectedHeader({ alg: "Ed25519", typ: "JWT" })
  .setSubject(cloudUserId)
  .setIssuer("https://cloud.getcooler.app")
  .setAudience("coolerbridge")
  .setIssuedAt()
  .setExpirationTime("5m")
  .sign(privateKey)

// log result
console.info(
  "Pairing result:",
  JSON.stringify(
    {
      cloudUserId,
      cloudBridgeId,
      pairingId,
      assertion,
    },
    null,
    2
  )
)
