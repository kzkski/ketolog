-- その日評価時点の PFC 目標スナップショット（Insights 達成率用）
-- date は food_log と同じ JST 暦日（活動日 D）。

CREATE TABLE IF NOT EXISTS daily_pfc_target_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  diet_phase smallint NOT NULL,
  phase_name text,
  protein_target_g numeric NOT NULL,
  fat_target_g numeric NOT NULL,
  carbs_target_g numeric NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_pfc_target_snapshot_diet_phase_check
    CHECK (diet_phase >= 1 AND diet_phase <= 3),
  CONSTRAINT daily_pfc_target_snapshot_source_check
    CHECK (source IN (
      'app_switch',
      'app_profile_edit',
      'food_log_ensure',
      'app_ensure',
      'claude_backfill'
    )),
  CONSTRAINT daily_pfc_target_snapshot_targets_positive_check
    CHECK (
      protein_target_g > 0
      AND fat_target_g > 0
      AND carbs_target_g > 0
    ),
  CONSTRAINT daily_pfc_target_snapshot_user_id_date_key UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_pfc_target_snapshot_user_date
  ON daily_pfc_target_snapshot (user_id, date);

ALTER TABLE daily_pfc_target_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_pfc_target_snapshot_owner_access ON daily_pfc_target_snapshot;
CREATE POLICY daily_pfc_target_snapshot_owner_access ON daily_pfc_target_snapshot
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE daily_pfc_target_snapshot IS
  '日次 PFC 目標スナップショット。Insights 達成率は当時の目標で評価する。';
