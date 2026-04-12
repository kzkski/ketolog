-- 既定プリセット表示名を「ケト導入期 / ケト脂肪燃焼期間 / TKD」に統一（未カスタムのユーザー向け）

UPDATE public.user_settings
SET
  phase_profiles = jsonb_set(
    jsonb_set(
      jsonb_set(
        phase_profiles,
        '{1,name}',
        '"ケト導入期"'::jsonb
      ),
      '{2,name}',
      '"ケト脂肪燃焼期間"'::jsonb
    ),
    '{3,name}',
    '"TKD"'::jsonb
  )
WHERE
  phase_profiles->'1'->>'name' = 'ケト脂肪燃焼'
  AND phase_profiles->'2'->>'name' = 'TKD導入'
  AND phase_profiles->'3'->>'name' = 'アイアンマン';

ALTER TABLE public.user_settings
  ALTER COLUMN phase_profiles SET DEFAULT '{"1":{"name":"ケト導入期","protein_target_g":100,"fat_target_g":120,"carbs_target_g":40},"2":{"name":"ケト脂肪燃焼期間","protein_target_g":110,"fat_target_g":110,"carbs_target_g":60},"3":{"name":"TKD","protein_target_g":120,"fat_target_g":100,"carbs_target_g":100}}'::jsonb;
