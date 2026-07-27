-- PFC 目標プリセット（diet_phase）を最大5スロットまで許可する。
-- phase_profiles jsonb のデータ移行は不要（キー存在ベースの可変運用）。

ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS user_settings_diet_phase_check;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_diet_phase_check
  CHECK (diet_phase >= 1 AND diet_phase <= 5);

ALTER TABLE public.daily_pfc_target_snapshot
  DROP CONSTRAINT IF EXISTS daily_pfc_target_snapshot_diet_phase_check;

ALTER TABLE public.daily_pfc_target_snapshot
  ADD CONSTRAINT daily_pfc_target_snapshot_diet_phase_check
  CHECK (diet_phase >= 1 AND diet_phase <= 5);
