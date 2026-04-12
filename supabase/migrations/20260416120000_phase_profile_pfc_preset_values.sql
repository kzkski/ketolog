-- PFC プリセット既定値を 導入期(100/150/20)・脂肪燃焼期(100/120/40)・TKD(110/110/60) に更新

UPDATE public.user_settings
SET
  phase_profiles = '{"1":{"name":"導入期","protein_target_g":100,"fat_target_g":150,"carbs_target_g":20},"2":{"name":"脂肪燃焼期","protein_target_g":100,"fat_target_g":120,"carbs_target_g":40},"3":{"name":"TKD","protein_target_g":110,"fat_target_g":110,"carbs_target_g":60}}'::jsonb
WHERE
  phase_profiles = '{"1":{"name":"ケト導入期","protein_target_g":100,"fat_target_g":120,"carbs_target_g":40},"2":{"name":"ケト脂肪燃焼期間","protein_target_g":110,"fat_target_g":110,"carbs_target_g":60},"3":{"name":"TKD","protein_target_g":120,"fat_target_g":100,"carbs_target_g":100}}'::jsonb
  OR phase_profiles = '{"1":{"name":"ケト脂肪燃焼","protein_target_g":100,"fat_target_g":120,"carbs_target_g":40},"2":{"name":"TKD導入","protein_target_g":110,"fat_target_g":110,"carbs_target_g":60},"3":{"name":"アイアンマン","protein_target_g":120,"fat_target_g":100,"carbs_target_g":100}}'::jsonb;

ALTER TABLE public.user_settings
  ALTER COLUMN phase_profiles SET DEFAULT '{"1":{"name":"導入期","protein_target_g":100,"fat_target_g":150,"carbs_target_g":20},"2":{"name":"脂肪燃焼期","protein_target_g":100,"fat_target_g":120,"carbs_target_g":40},"3":{"name":"TKD","protein_target_g":110,"fat_target_g":110,"carbs_target_g":60}}'::jsonb;
