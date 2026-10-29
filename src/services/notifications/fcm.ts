/**
 * sends an FCM notification via expo
 *
 * @see https://docs.expo.dev/push-notifications/what-you-need-to-know/
 */
export const sendFcm = async (expoToken: string, payload: { type: string; eventId: string }) => {
  console.info("FCM notification:", {
    token: expoToken,
    payload,
  })
}
