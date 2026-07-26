-- training_log: 論理キー UNIQUE（MyVitalRelay 20260709100000 相当・冪等）
-- 本番適用済み想定。新規環境向けに重複クリーンアップ後、制約を IF NOT EXISTS で追加。

DELETE FROM training_log t
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, start_time, end_time, workout_type
           ORDER BY
             (CASE
               WHEN rpe IS NOT NULL
                 OR condition_notes IS NOT NULL
                 OR notes IS NOT NULL
               THEN 0 ELSE 1
             END) ASC,
             created_at DESC
         ) AS rn
  FROM training_log
  WHERE start_time IS NOT NULL
    AND end_time IS NOT NULL
    AND workout_type IS NOT NULL
) ranked
WHERE t.id = ranked.id AND ranked.rn > 1;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'training_log_logical_unique'
  ) THEN
    ALTER TABLE training_log
      ADD CONSTRAINT training_log_logical_unique
      UNIQUE (user_id, start_time, end_time, workout_type);
  END IF;
END $$;
