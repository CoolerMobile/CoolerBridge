export type CoolifyPermission = "read" | "read:sensitive" | "write" | "deploy" | "root"

export type BridgeScope =
  | "events:read"
  | "devices:read"
  | "devices:write"
  | "session:revoke"
  | "coolify:read"
  | "coolify:read:sensitive"
  | "coolify:write"
  | "coolify:deploy"

/**
 * scope implications in tree-format
 */
const scopeImplications: Partial<Record<BridgeScope, readonly BridgeScope[]>> = {
  "coolify:read:sensitive": ["coolify:read"],
}

/**
 * resolve & normalize scopes based on their
 * individual implications
 *
 * @param scopes scopes to resolve
 * @returns resolved scopes
 */
export const resolveScopes = (scopes: readonly BridgeScope[]): Set<BridgeScope> => {
  const resolved = new Set(scopes)

  let changed = true

  while (changed) {
    changed = false

    for (const scope of [...resolved]) {
      for (const implied of scopeImplications[scope] ?? []) {
        if (!resolved.has(implied)) {
          resolved.add(implied)
          changed = true
        }
      }
    }
  }

  return resolved
}

/**
 * verifies if requested scope has been
 * granted to the user
 *
 * @param scope requested scope
 * @param grantedScopes scopes granted to user
 */
export const hasScope = (scope: BridgeScope, grantedScopes: readonly BridgeScope[]) => {
  return resolveScopes(grantedScopes).has(scope)
}

/**
 * maps upstream coolify permissions to
 * CoolerBridge-native scopes
 *
 * @param permissions
 * @returns
 */
export function coolifyPermissionsToScopes(permissions: readonly CoolifyPermission[]): BridgeScope[] {
  const result = new Set<BridgeScope>()

  if (permissions.includes("root")) {
    result.add("coolify:read")
    result.add("coolify:read:sensitive")
    result.add("coolify:write")
    result.add("coolify:deploy")

    return [...result]
  }

  if (permissions.includes("read")) {
    result.add("coolify:read")
  }

  if (permissions.includes("read:sensitive")) {
    result.add("coolify:read")
    result.add("coolify:read:sensitive")
  }

  if (permissions.includes("write")) {
    result.add("coolify:write")
  }

  if (permissions.includes("deploy")) {
    result.add("coolify:deploy")
  }

  return [...result]
}
