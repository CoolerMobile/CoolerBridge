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

// #region Cloud Revoke Assertion
/**
 * @docs The verified claims carried by a cloud revoke assertion: the cloud user
 * and the bridge they unpaired.
 */
export type CloudRevokeAssertion = {
  cloudUserId: string
  cloudBridgeId: string
}
// #endregion
