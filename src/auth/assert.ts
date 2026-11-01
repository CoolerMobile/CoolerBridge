// #region Cloud Pairing Assertion
/**
 * @docs The verified claims carried by a cloud pairing assertion: the cloud
 * user, bridge, and pairing ids.
 */
export type CloudPairingAssertion = {
  cloudUserId: string
  cloudBridgeId: string
  pairingId: string
}
// #endregion
