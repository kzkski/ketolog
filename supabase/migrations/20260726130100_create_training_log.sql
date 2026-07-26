-- training_log: 1 HealthKit ワークアウト = 1行（MyVitalRelay）
-- 本番へ MyVitalRelay 経由で適用済み。履歴 placeholder（20260704063102）は触らず、冪等 CREATE で揃える。

CREATE TABLE IF NOT EXISTS training_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  date date NOT NULL,
  data_source text NOT NULL CHECK (data_source IN ('garmin', 'life_fitness', 'manual')),
  healthkit_uuid uuid UNIQUE,
  discipline text NOT NULL CHECK (discipline IN ('run', 'bike', 'swim', 'brick', 'strength', 'other')),
  workout_type text,
  start_time timestamptz,
  end_time timestamptz,
  duration_min numeric,
  distance_km numeric,
  avg_speed_kmh numeric,
  calories_burned numeric,
  avg_hr numeric,
  max_hr numeric,
  elevation_gain_m numeric,
  hr_zone_minutes jsonb,
  cadence numeric,
  power_watts numeric,
  stroke_count numeric,
  stroke_style text CHECK (stroke_style IN ('freestyle', 'backstroke', 'breaststroke', 'butterfly', 'mixed', 'unknown')),
  equipment text,
  surface text,
  rpe smallint CHECK (rpe BETWEEN 1 AND 10),
  srpe numeric GENERATED ALWAYS AS (duration_min * rpe) STORED,
  condition_notes text,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_log_user_date
  ON training_log (user_id, date);

ALTER TABLE training_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_log_owner_access ON training_log;
CREATE POLICY training_log_owner_access ON training_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE training_log IS
  'ワークアウト1セッション=1行。EEE（エネルギー可用性）は calories_burned の日次合計。date は活動日 D（シフトなし）。';

COMMENT ON COLUMN training_log.date IS
  'ワークアウト開始の JST 暦日（活動日 D）。daily_activity_summary.date の D+1 規約とは異なる。';
