/** 食事ログのスナップショット専用に `food_log.source` へ入れる予約レストラン行の表示名（ユーザーごとに1件 getOrCreate） */
export const SNAPSHOT_RESTAURANT_NAME = "（スナップショット記録）" as const;

export function isSnapshotRestaurant(r: { name: string }): boolean {
  return r.name === SNAPSHOT_RESTAURANT_NAME;
}
