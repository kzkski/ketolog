/** Web の `src/lib/snapshot-restaurant.ts` と同一。メニュー選択 UI からは除外する。 */
export const SNAPSHOT_RESTAURANT_NAME = "（スナップショット記録）" as const;

export function isSnapshotRestaurant(r: { name: string }): boolean {
  return r.name === SNAPSHOT_RESTAURANT_NAME;
}
