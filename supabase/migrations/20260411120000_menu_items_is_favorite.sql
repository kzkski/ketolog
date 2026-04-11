-- Issue #6: メニュー項目のお気に入りフラグ
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;
