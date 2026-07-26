"use server";

import { getSupabaseAuthForRequest } from "@/lib/supabase/request-auth";
import {
  clampDietPhase,
  normalizePhaseProfiles,
  normalizeUserSettings,
  type PhaseProfiles,
} from "@/lib/diet-phase";
import { syncTodayPfcTargetSnapshotAfterSettingsChange } from "./pfc-target-snapshot";

export type UserSettingsPatch = {
  diet_phase?: number;
  phase_profiles?: PhaseProfiles;
};

export async function updateUserSettings(data: UserSettingsPatch): Promise<{ error: string | null }> {
  const { supabase, user } = await getSupabaseAuthForRequest();
  if (!user) return { error: "認証が必要です" };

  if (data.diet_phase === undefined && data.phase_profiles === undefined) {
    return { error: null };
  }

  const { data: existing } = await supabase
    .from("user_settings")
    .select("diet_phase, phase_profiles")
    .eq("user_id", user.id)
    .maybeSingle();

  const base = normalizeUserSettings(existing);
  const diet_phase =
    data.diet_phase !== undefined ? clampDietPhase(data.diet_phase) : base.diet_phase;
  const phase_profiles =
    data.phase_profiles !== undefined ? normalizePhaseProfiles(data.phase_profiles) : base.phase_profiles;

  const { error } = await supabase.from("user_settings").upsert(
    { user_id: user.id, diet_phase, phase_profiles },
    { onConflict: "user_id" }
  );

  if (error) return { error: error.message };

  const snap = await syncTodayPfcTargetSnapshotAfterSettingsChange(base, {
    diet_phase,
    phase_profiles,
  });
  if (snap.error) return { error: snap.error };
  return { error: null };
}
