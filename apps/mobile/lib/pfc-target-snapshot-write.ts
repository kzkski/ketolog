import type { SupabaseClient } from "@supabase/supabase-js";
import type { DietPhase, PhaseProfiles } from "@ketolog/domain/diet-phase";
import {
  buildPfcTargetSnapshotWriteRow,
  isInsertOnlyPfcTargetSnapshotSource,
  type PfcTargetSnapshotSource,
} from "@ketolog/domain/pfc-target-snapshot";

type Settings = {
  diet_phase: DietPhase;
  phase_profiles: PhaseProfiles;
};

export async function writePfcTargetSnapshot(
  supabase: SupabaseClient,
  input: {
    userId: string;
    date: string;
    settings: Settings;
    source: PfcTargetSnapshotSource;
  }
): Promise<{ error: string | null }> {
  const row = buildPfcTargetSnapshotWriteRow({
    userId: input.userId,
    date: input.date,
    diet_phase: input.settings.diet_phase,
    phase_profiles: input.settings.phase_profiles,
    source: input.source,
  });

  if (isInsertOnlyPfcTargetSnapshotSource(input.source)) {
    const { error } = await supabase.from("daily_pfc_target_snapshot").upsert(row, {
      onConflict: "user_id,date",
      ignoreDuplicates: true,
    });
    if (error) return { error: error.message };
    return { error: null };
  }

  const { error } = await supabase.from("daily_pfc_target_snapshot").upsert(row, {
    onConflict: "user_id,date",
  });
  if (error) return { error: error.message };
  return { error: null };
}
