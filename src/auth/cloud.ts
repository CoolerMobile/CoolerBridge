import { importSPKI, jwtVerify } from "jose"
import { CloudPairingAssertion } from "@/auth/assert"

// encryption algorithm
const alg = "Ed25519"

// public key - env in prod and file in dev
let pubKey
switch (Bun.env.NODE_ENV) {
  case "production":
    pubKey = await importSPKI(Bun.env.CLOUD_PUBLIC_KEY!, alg)
    break

  case "development": {
    const pem = await Bun.file(new URL("../../dev/keys/cooler-public.pem", import.meta.url)).text()
    pubKey = await importSPKI(pem, alg)
    break
  }

  default:
    pubKey = null
}

// exit early if key is not present
if (!pubKey) {
  console.error('No public key. Did you run "bun gen:keys"?')
  process.exit(1)
}

/**
 * verifies pairing `assertion` against valid public key
 *
 * @param assertion assertion to verify
 */
export const verifyAssertion = async (assertion: string): Promise<CloudPairingAssertion> => {
  const { payload } = await jwtVerify(assertion, pubKey, {
    algorithms: [alg],
    issuer: "https://cloud.getcooler.app",
    audience: "coolerbridge",
  })

  if (
    typeof payload.sub !== "string" ||
    typeof payload.bridgeId !== "string" ||
    typeof payload.pairingId !== "string"
  ) {
    console.error("Invalid cloud assertion:")
    throw new Error("Invalid cloud assertion")
  }

  return {
    cloudUserId: payload.sub,
    cloudBridgeId: payload.bridgeId,
    pairingId: payload.pairingId,
  }
}
