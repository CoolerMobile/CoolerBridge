// #region Bridge Type
/**
 * @docs In-memory shape of a bridge entry, holding its id and creation
 * timestamp.
 */
export type Bridge = {
  id: string
  createdAt: string
}
// #endregion

// #region Bridge Store
/**
 * @docs Process-local map of bridges keyed by id, used for lightweight
 * in-memory lookups.
 */
export const bridges = new Map<string, Bridge>()
// #endregion
