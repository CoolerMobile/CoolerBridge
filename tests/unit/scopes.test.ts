import { describe, expect, test } from "bun:test"
import {
  coolifyPermissionsToScopes,
  hasScope,
  isBridgeScope,
  resolveScopes,
  type BridgeScope,
} from "@/services/scopes"

describe("isBridgeScope", () => {
  test("accepts every known scope", () => {
    const known: BridgeScope[] = [
      "events:read",
      "devices:read",
      "devices:write",
      "session:revoke",
      "coolify:read",
      "coolify:read:sensitive",
      "coolify:write",
      "coolify:deploy",
    ]

    for (const scope of known) {
      expect(isBridgeScope(scope)).toBe(true)
    }
  })

  test("rejects unknown scopes", () => {
    expect(isBridgeScope("coolify:root")).toBe(false)
    expect(isBridgeScope("events:write")).toBe(false)
    expect(isBridgeScope("")).toBe(false)
    expect(isBridgeScope("EVENTS:READ")).toBe(false)
  })
})

describe("resolveScopes", () => {
  test("expands coolify:read:sensitive to include coolify:read", () => {
    const resolved = resolveScopes(["coolify:read:sensitive"])

    expect(resolved.has("coolify:read:sensitive")).toBe(true)
    expect(resolved.has("coolify:read")).toBe(true)
    expect(resolved.size).toBe(2)
  })

  test("leaves scopes without implications untouched", () => {
    const resolved = resolveScopes(["events:read", "devices:write"])

    expect([...resolved].sort()).toEqual(["devices:write", "events:read"])
  })

  test("returns an empty set for no scopes", () => {
    expect(resolveScopes([]).size).toBe(0)
  })

  test("does not duplicate an already-present implied scope", () => {
    const resolved = resolveScopes(["coolify:read:sensitive", "coolify:read"])
    expect(resolved.size).toBe(2)
  })
})

describe("hasScope", () => {
  test("true for a directly granted scope", () => {
    expect(hasScope("events:read", ["events:read"])).toBe(true)
  })

  test("true for an implied scope", () => {
    expect(hasScope("coolify:read", ["coolify:read:sensitive"])).toBe(true)
  })

  test("false when the scope is not granted", () => {
    expect(hasScope("coolify:write", ["coolify:read"])).toBe(false)
  })

  test("false for an empty grant", () => {
    expect(hasScope("events:read", [])).toBe(false)
  })

  test("granting coolify:read does not imply the sensitive variant", () => {
    expect(hasScope("coolify:read:sensitive", ["coolify:read"])).toBe(false)
  })
})

describe("coolifyPermissionsToScopes", () => {
  test("root grants the full coolify set", () => {
    const scopes = coolifyPermissionsToScopes(["root"])

    expect(scopes.sort()).toEqual(
      ["coolify:deploy", "coolify:read", "coolify:read:sensitive", "coolify:write"].sort()
    )
  })

  test("root short-circuits and ignores other permissions", () => {
    const scopes = coolifyPermissionsToScopes(["read", "root", "deploy"])
    expect(scopes).toHaveLength(4)
  })

  test("read maps to coolify:read", () => {
    expect(coolifyPermissionsToScopes(["read"])).toEqual(["coolify:read"])
  })

  test("read:sensitive implies coolify:read as well", () => {
    const scopes = coolifyPermissionsToScopes(["read:sensitive"])
    expect(scopes.sort()).toEqual(["coolify:read", "coolify:read:sensitive"].sort())
  })

  test("write maps to coolify:write", () => {
    expect(coolifyPermissionsToScopes(["write"])).toEqual(["coolify:write"])
  })

  test("deploy maps to coolify:deploy", () => {
    expect(coolifyPermissionsToScopes(["deploy"])).toEqual(["coolify:deploy"])
  })

  test("combines multiple permissions without duplicates", () => {
    const scopes = coolifyPermissionsToScopes(["read", "read:sensitive", "write", "deploy"])
    expect(scopes.sort()).toEqual(
      ["coolify:deploy", "coolify:read", "coolify:read:sensitive", "coolify:write"].sort()
    )
  })

  test("returns nothing for an empty permission list", () => {
    expect(coolifyPermissionsToScopes([])).toEqual([])
  })
})
