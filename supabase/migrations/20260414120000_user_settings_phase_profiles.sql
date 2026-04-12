-- Issue #132: PFC targets per diet phase (1–3). Remove redundant global columns.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS phase_profiles jsonb;

UPDATE public.user_settings
SET
  phase_profiles = jsonb_build_object(
    '1',
    jsonb_build_object(
      'name',
      'ケト脂肪燃焼',
      'protein_target_g',
      CASE WHEN diet_phase = 1 THEN protein_target_g ELSE 100 END,
      'fat_target_g',
      CASE WHEN diet_phase = 1 THEN fat_target_g ELSE 120 END,
      'carbs_target_g',
      CASE WHEN diet_phase = 1 THEN carbs_target_g ELSE 40 END
    ),
    '2',
    jsonb_build_object(
      'name',
      'TKD導入',
      'protein_target_g',
      CASE WHEN diet_phase = 2 THEN protein_target_g ELSE 110 END,
      'fat_target_g',
      CASE WHEN diet_phase = 2 THEN fat_target_g ELSE 110 END,
      'carbs_target_g',
      CASE WHEN diet_phase = 2 THEN carbs_target_g ELSE 60 END
    ),
    '3',
    jsonb_build_object(
      'name',
      'アイアンマン',
      'protein_target_g',
      CASE WHEN diet_phase = 3 THEN protein_target_g ELSE 120 END,
      'fat_target_g',
      CASE WHEN diet_phase = 3 THEN fat_target_g ELSE 100 END,
      'carbs_target_g',
      CASE WHEN diet_phase = 3 THEN carbs_target_g ELSE 100 END
    )
  )
WHERE phase_profiles IS NULL;

UPDATE public.user_settings
SET
  phase_profiles = '{"1":{"name":"ケト脂肪燃焼","protein_target_g":100,"fat_target_g":120,"carbs_target_g":40},"2":{"name":"TKD導入","protein_target_g":110,"fat_target_g":110,"carbs_target_g":60},"3":{"name":"アイアンマン","protein_target_g":120,"fat_target_g":100,"carbs_target_g":100}}'::jsonb
WHERE phase_profiles IS NULL;

ALTER TABLE public.user_settings
  ALTER COLUMN phase_profiles SET NOT NULL;

ALTER TABLE public.user_settings
  ALTER COLUMN phase_profiles SET DEFAULT '{"1":{"name":"ケト脂肪燃焼","protein_target_g":100,"fat_target_g":120,"carbs_target_g":40},"2":{"name":"TKD導入","protein_target_g":110,"fat_target_g":110,"carbs_target_g":60},"3":{"name":"アイアンマン","protein_target_g":120,"fat_target_g":100,"carbs_target_g":100}}'::jsonb;

ALTER TABLE public.user_settings DROP COLUMN IF EXISTS protein_target_g;
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS fat_target_g;
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS carbs_target_g;
