/**
 * sends an APNS notification via expo
 *
 * @see https://docs.expo.dev/push-notifications/what-you-need-to-know/
 */
export const sendApns = async (expoToken: string, payload: { type: string; eventId: string }) => {
  console.info("APNS notification:", {
    token: expoToken,
    payload,
  })
}
