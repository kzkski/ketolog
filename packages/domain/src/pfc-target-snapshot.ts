/**
 * 日次 PFC 目標スナップショット（達成率集計用）。
 * DB 行の組み立てと source 優先度のみ。書き込み I/O はアプリ層。
 */

import {
  activePhaseProfile,
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
  const profile = activePhaseProfile({
    diet_phase: input.diet_phase,
    phase_profiles: input.phase_profiles,
  });
  return {
    user_id: input.userId,
    date: input.date,
    diet_phase: input.diet_phase,
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
  if (prev.diet_phase !== next.diet_phase) return true;
  const a = activePhaseProfile(prev);
  const b = activePhaseProfile(next);
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
  if (prev.diet_phase !== next.diet_phase) return "app_switch";
  return "app_profile_edit";
}
