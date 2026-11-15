import type { DevicePreferences } from "@/schemas/bridge"
import type { Event } from "@/schemas/cooler"

// #region Local Minute Of Day
/**
 * minutes since midnight in a time zone
 *
 * @param now moment to read
 * @param timeZone iana time zone
 *
 * @returns {number} minutes since local midnight
 *
 * @docs Reads the minutes since local midnight of a moment in a given time
 * zone, following daylight saving changes.
 */
export const localMinuteOfDay = (now: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now)

  const value = (type: "hour" | "minute") => Number(parts.find((part) => part.type === type)?.value ?? 0)

  return value("hour") * 60 + value("minute")
}
// #endregion

// #region Quiet Hours Active
/**
 * checks if a device is inside its quiet hours
 *
 * matches cooler's own check, matching times mean no window
 *
 * @param preferences device preferences
 * @param now moment to check
 *
 * @returns {boolean} true while quiet hours are active
 *
 * @docs Checks whether a device is inside its quiet hours. A window whose start
 * and end match is treated as no window, and overnight windows such as 22:00 to
 * 07:00 wrap past midnight.
 */
export const quietHoursActive = (preferences: DevicePreferences, now: Date): boolean => {
  if (!preferences.quietHours) return false

  const { from, to } = preferences.quietHours
  if (from === to) return false

  const current = localMinuteOfDay(now, preferences.timeZone)

  // same-day window, e.g. 13:00-17:00
  if (from < to) return current >= from && current < to

  // overnight window, e.g. 22:00-07:00
  return current >= from || current < to
}
// #endregion

// #region Should Notify
/**
 * decides whether a device gets a push for an event
 *
 * devices that never reported preferences get everything
 *
 * @param preferences device preferences or null when never reported
 * @param event event to deliver
 * @param now moment of delivery
 *
 * @returns {boolean} true when the device should be notified
 *
 * @docs Decides whether a device is pushed an event. Devices that never
 * reported preferences get every event, otherwise nothing is sent during quiet
 * hours or for a muted category. The event is still stored and reaches the
 * device the next time Cooler syncs.
 */
export const shouldNotify = (
  preferences: DevicePreferences | null | undefined,
  event: Event,
  now = new Date()
) => {
  if (!preferences) return true
  if (quietHoursActive(preferences, now)) return false
  if (event.category && !preferences.categories[event.category]) return false

  return true
}
// #endregion
