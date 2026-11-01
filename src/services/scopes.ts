// #region Coolify Permission Type
/**
 * @docs The permission levels Coolify grants upstream, from read through root.
 */
export type CoolifyPermission = "read" | "read:sensitive" | "write" | "deploy" | "root"
// #endregion

// #region Bridge Scope Type
/**
 * @docs The native scopes a bridge session can hold, covering events, devices,
 * sessions, and Coolify access.
 */
export type BridgeScope =
  | "events:read"
  | "devices:read"
  | "devices:write"
  | "session:revoke"
  | "coolify:read"
  | "coolify:read:sensitive"
  | "coolify:write"
  | "coolify:deploy"
// #endregion

// #region Bridge Scope Guard
/**
 * @docs The set of all valid bridge scopes, with a type guard that narrows an
 * arbitrary string to a known scope.
 */
const bridgeScopes: ReadonlySet<string> = new Set<BridgeScope>([
  "events:read",
  "devices:read",
  "devices:write",
  "session:revoke",
  "coolify:read",
  "coolify:read:sensitive",
  "coolify:write",
  "coolify:deploy",
])

export const isBridgeScope = (scope: string): scope is BridgeScope => bridgeScopes.has(scope)
// #endregion

// #region Scope Implications
/**
 * scope implications in tree-format
 *
 * @docs Declares which scopes imply others, expressed as a tree of implied
 * scopes.
 */
const scopeImplications: Partial<Record<BridgeScope, readonly BridgeScope[]>> = {
  "coolify:read:sensitive": ["coolify:read"],
}
// #endregion

// #region Resolve Scopes
/**
 * resolve & normalize scopes based on their
 * individual implications
 *
 * @param scopes scopes to resolve
 * @returns resolved scopes
 *
 * @docs Expands a set of scopes to include every scope they transitively
 * imply.
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
// #endregion

// #region Has Scope
/**
 * verifies if requested scope has been
 * granted to the user
 *
 * @param scope requested scope
 * @param grantedScopes scopes granted to user
 *
 * @docs Checks whether a required scope is granted, accounting for scope
 * implications.
 */
export const hasScope = (scope: BridgeScope, grantedScopes: readonly BridgeScope[]) => {
  return resolveScopes(grantedScopes).has(scope)
}
// #endregion

// #region Coolify Permissions To Scopes
/**
 * maps upstream coolify permissions to
 * CoolerBridge-native scopes
 *
 * @param permissions
 * @returns
 *
 * @docs Maps upstream Coolify permissions onto the bridge's native scopes.
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
// #endregion
