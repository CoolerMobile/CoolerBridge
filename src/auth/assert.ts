// #region Cloud Pairing Assertion
/**
 * @docs The verified claims carried by a cloud pairing assertion: the cloud
 * user, bridge, and pairing ids, plus the assertion's own id.
 */
export type CloudPairingAssertion = {
  cloudUserId: string
  cloudBridgeId: string
  pairingId: string
  // assertion id, reported back to the cloud to confirm the pairing
  jti: string
}
// #endregion
