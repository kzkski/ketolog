"use server";

import { toJstDateString } from "@ketolog/domain/date";
import {
  snapshotSourceForSettingsChangeWithRepair,
  type PfcTargetSnapshotSource,
} from "@ketolog/domain/pfc-target-snapshot";
import {
  normalizeUserSettings,
  resolveActiveDietPhase,
  type PhaseProfiles,
} from "@/lib/diet-phase";
import { writePfcTargetSnapshot } from "@/lib/pfc-target-snapshot-write";
import { getSupabaseAuthForRequest } from "@/lib/supabase/request-auth";

async function loadSettingsForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
) {
  const { data } = await supabase
    .from("user_settings")
    .select("diet_phase, phase_profiles")
    .eq("user_id", userId)
    .maybeSingle();
  return normalizeUserSettings(data);
}

/** 切替 / アクティブ profile 編集後の当日スナップショット upsert */
export async function syncTodayPfcTargetSnapshotAfterSettingsChange(
  prev: { diet_phase: number; phase_profiles: PhaseProfiles },
  next: { diet_phase: number; phase_profiles: PhaseProfiles },
  rawDietPhaseFromDb?: unknown
): Promise<{ error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { error: "認証が必要です" };

  const prevNorm = normalizeUserSettings(prev);
  const nextNorm = normalizeUserSettings(next);
  const source = snapshotSourceForSettingsChangeWithRepair({
    prev: prevNorm,
    next: nextNorm,
    rawDietPhaseFromDb: rawDietPhaseFromDb ?? prev.diet_phase,
  });
  if (!source) return { error: null };

  return writePfcTargetSnapshot(supabase, {
    userId: user.id,
    date: toJstDateString(),
    settings: {
      diet_phase: resolveActiveDietPhase(nextNorm.diet_phase, nextNorm.phase_profiles),
      phase_profiles: nextNorm.phase_profiles,
    },
    source,
  });
}

/** Today 表示時 / 初回 food_log 用の INSERT-only ensure */
export async function ensurePfcTargetSnapshotForDate(
  date: string,
  source: Extract<PfcTargetSnapshotSource, "app_ensure" | "food_log_ensure">
): Promise<{ error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { error: "認証が必要です" };

  const settings = await loadSettingsForUser(supabase, user.id);
  return writePfcTargetSnapshot(supabase, {
    userId: user.id,
    date,
    settings,
    source,
  });
}
