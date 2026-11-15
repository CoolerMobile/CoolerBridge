import { describe, expect, test } from "bun:test"
import type { DevicePreferences } from "@/schemas/bridge"
import type { Event } from "@/schemas/cooler"
import { eventCategory } from "@/services/normalize"
import { localMinuteOfDay, quietHoursActive, shouldNotify } from "@/services/preferences"

const allCategories = { deployments: true, backups: true, scheduledTasks: true, servers: true }

const preferences = (overrides: Partial<DevicePreferences> = {}): DevicePreferences => ({
  timeZone: "UTC",
  quietHours: null,
  categories: allCategories,
  ...overrides,
})

const event = (category?: Event["category"]): Event => ({
  id: crypto.randomUUID(),
  bridgeId: crypto.randomUUID(),
  type: "coolify.backup_failed",
  severity: "error",
  title: "Backup failed",
  message: "Database backup failed",
  category,
  createdAt: new Date(),
})

// 23:30 utc
const lateNight = new Date("2026-11-15T23:30:00Z")
// 12:00 utc
const noon = new Date("2026-11-15T12:00:00Z")

describe("localMinuteOfDay", () => {
  test("reads the time in the device's time zone", () => {
    expect(localMinuteOfDay(noon, "UTC")).toBe(12 * 60)
    expect(localMinuteOfDay(noon, "Asia/Tokyo")).toBe(21 * 60)
    expect(localMinuteOfDay(lateNight, "America/New_York")).toBe(18 * 60 + 30)
  })
})

describe("quietHoursActive", () => {
  test("handles an overnight window", () => {
    const night = preferences({ quietHours: { from: 22 * 60, to: 7 * 60 } })

    expect(quietHoursActive(night, lateNight)).toBe(true)
    expect(quietHoursActive(night, noon)).toBe(false)
  })

  test("handles a same-day window", () => {
    const afternoon = preferences({ quietHours: { from: 11 * 60, to: 13 * 60 } })

    expect(quietHoursActive(afternoon, noon)).toBe(true)
    expect(quietHoursActive(afternoon, lateNight)).toBe(false)
  })

  test("follows the device's time zone", () => {
    // noon utc is 21:00 in tokyo, inside 20:00-23:00
    const evening = preferences({ timeZone: "Asia/Tokyo", quietHours: { from: 20 * 60, to: 23 * 60 } })

    expect(quietHoursActive(evening, noon)).toBe(true)
  })

  test("treats matching times as no window", () => {
    expect(quietHoursActive(preferences({ quietHours: { from: 600, to: 600 } }), noon)).toBe(false)
  })
})

describe("shouldNotify", () => {
  test("notifies devices that never reported preferences", () => {
    expect(shouldNotify(null, event("backups"), lateNight)).toBe(true)
  })

  test("holds back pushes during quiet hours", () => {
    const night = preferences({ quietHours: { from: 22 * 60, to: 7 * 60 } })

    expect(shouldNotify(night, event("backups"), lateNight)).toBe(false)
    expect(shouldNotify(night, event(), lateNight)).toBe(false)
  })

  test("holds back muted categories only", () => {
    const noBackups = preferences({ categories: { ...allCategories, backups: false } })

    expect(shouldNotify(noBackups, event("backups"), noon)).toBe(false)
    expect(shouldNotify(noBackups, event("servers"), noon)).toBe(true)
    expect(shouldNotify(noBackups, event(), noon)).toBe(true)
  })
})

describe("eventCategory", () => {
  test("maps coolify events to alert categories", () => {
    expect(eventCategory("deployment_failed")).toBe("deployments")
    expect(eventCategory("status_changed")).toBe("deployments")
    expect(eventCategory("container_restarted")).toBe("deployments")
    expect(eventCategory("backup_failed")).toBe("backups")
    expect(eventCategory("volume_backup_recovered")).toBe("backups")
    expect(eventCategory("task_failed")).toBe("scheduledTasks")
    expect(eventCategory("server_unreachable")).toBe("servers")
    expect(eventCategory("docker_cleanup_failed")).toBe("servers")
  })

  test("never mutes always-sent or unknown events", () => {
    expect(eventCategory("general")).toBeUndefined()
    expect(eventCategory("test")).toBeUndefined()
    expect(eventCategory("api_token_failing")).toBeUndefined()
    expect(eventCategory("some_new_event")).toBeUndefined()
  })
})
