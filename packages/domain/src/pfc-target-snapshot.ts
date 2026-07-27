/**
 * 日次 PFC 目標スナップショット（達成率集計用）。
 * DB 行の組み立てと source 優先度のみ。書き込み I/O はアプリ層。
 */

import {
  activePhaseProfile,
  clampDietPhase,
  resolveActiveDietPhase,
  type DietPhase,
  type PhaseProfiles,
} from "./diet-phase";

export const PFC_TARGET_SNAPSHOT_SOURCES = [
  "app_switch",
  "app_profile_edit",
  "food_log_ensure",
  "app_ensure",
  "claude_backfill",
] as const;

export type PfcTargetSnapshotSource = (typeof PFC_TARGET_SNAPSHOT_SOURCES)[number];

/** 数値が大きいほど優先。ensure / backfill は既存行を上書きしない想定。 */
export const PFC_TARGET_SNAPSHOT_SOURCE_RANK: Record<PfcTargetSnapshotSource, number> = {
  app_switch: 3,
  app_profile_edit: 3,
  food_log_ensure: 2,
  app_ensure: 2,
  claude_backfill: 1,
};

export function isPfcTargetSnapshotSource(value: unknown): value is PfcTargetSnapshotSource {
  return (
    typeof value === "string" &&
    (PFC_TARGET_SNAPSHOT_SOURCES as readonly string[]).includes(value)
  );
}

export function canOverwritePfcTargetSnapshot(
  existing: PfcTargetSnapshotSource,
  incoming: PfcTargetSnapshotSource
): boolean {
  return PFC_TARGET_SNAPSHOT_SOURCE_RANK[incoming] >= PFC_TARGET_SNAPSHOT_SOURCE_RANK[existing];
}

/** INSERT-only 系（既存行があれば触らない） */
export function isInsertOnlyPfcTargetSnapshotSource(source: PfcTargetSnapshotSource): boolean {
  return (
    source === "food_log_ensure" || source === "app_ensure" || source === "claude_backfill"
  );
}

export type PfcTargetSnapshotWriteRow = {
  user_id: string;
  date: string;
  diet_phase: DietPhase;
  phase_name: string;
  protein_target_g: number;
  fat_target_g: number;
  carbs_target_g: number;
  source: PfcTargetSnapshotSource;
  updated_at: string;
};

export function buildPfcTargetSnapshotWriteRow(input: {
  userId: string;
  date: string;
  diet_phase: DietPhase;
  phase_profiles: PhaseProfiles;
  source: PfcTargetSnapshotSource;
  updatedAt?: string;
}): PfcTargetSnapshotWriteRow {
  const diet_phase = resolveActiveDietPhase(input.diet_phase, input.phase_profiles);
  const profile = activePhaseProfile({
    diet_phase,
    phase_profiles: input.phase_profiles,
  });
  return {
    user_id: input.userId,
    date: input.date,
    diet_phase,
    phase_name: profile.name,
    protein_target_g: profile.protein_target_g,
    fat_target_g: profile.fat_target_g,
    carbs_target_g: profile.carbs_target_g,
    source: input.source,
    updated_at: input.updatedAt ?? new Date().toISOString(),
  };
}

export function activePhaseTargetsChanged(
  prev: { diet_phase: DietPhase; phase_profiles: PhaseProfiles },
  next: { diet_phase: DietPhase; phase_profiles: PhaseProfiles }
): boolean {
  const prevPhase = resolveActiveDietPhase(prev.diet_phase, prev.phase_profiles);
  const nextPhase = resolveActiveDietPhase(next.diet_phase, next.phase_profiles);
  if (prevPhase !== nextPhase) return true;
  const a = activePhaseProfile({ ...prev, diet_phase: prevPhase });
  const b = activePhaseProfile({ ...next, diet_phase: nextPhase });
  return (
    a.protein_target_g !== b.protein_target_g ||
    a.fat_target_g !== b.fat_target_g ||
    a.carbs_target_g !== b.carbs_target_g ||
    a.name !== b.name
  );
}

export function snapshotSourceForSettingsChange(
  prev: { diet_phase: DietPhase; phase_profiles: PhaseProfiles },
  next: { diet_phase: DietPhase; phase_profiles: PhaseProfiles }
): PfcTargetSnapshotSource | null {
  if (!activePhaseTargetsChanged(prev, next)) return null;
  const prevPhase = resolveActiveDietPhase(prev.diet_phase, prev.phase_profiles);
  const nextPhase = resolveActiveDietPhase(next.diet_phase, next.phase_profiles);
  if (prevPhase !== nextPhase) return "app_switch";
  return "app_profile_edit";
}

/**
 * DB 生の diet_phase（clamp のみ）と、resolve 済み diet_phase が異なるか。
 * lazy repair 時に normalize 済み prev/next だけでは差分が出ないケースを拾う。
 */
export function dietPhaseResolvedByRepair(
  rawDietPhase: unknown,
  resolvedDietPhase: DietPhase,
  phaseProfiles: PhaseProfiles
): boolean {
  const clampedRaw = clampDietPhase(rawDietPhase);
  const resolvedFromRaw = resolveActiveDietPhase(clampedRaw, phaseProfiles);
  return clampedRaw !== resolvedDietPhase || clampedRaw !== resolvedFromRaw;
}

/**
 * 設定変更のスナップショット同期要否。
 * 通常の prev/next 差分に加え、生値→解決の修理が起きた場合は app_switch 相当で同期する。
 */
export function snapshotSourceForSettingsChangeWithRepair(input: {
  prev: { diet_phase: DietPhase; phase_profiles: PhaseProfiles };
  next: { diet_phase: DietPhase; phase_profiles: PhaseProfiles };
  rawDietPhaseFromDb: unknown;
}): PfcTargetSnapshotSource | null {
  const fromChange = snapshotSourceForSettingsChange(input.prev, input.next);
  if (fromChange) return fromChange;
  if (
    dietPhaseResolvedByRepair(
      input.rawDietPhaseFromDb,
      input.next.diet_phase,
      input.next.phase_profiles
    )
  ) {
    return "app_switch";
  }
  return null;
}
