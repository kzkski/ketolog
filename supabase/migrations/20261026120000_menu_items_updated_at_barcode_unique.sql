-- Issue #358: バーコード再スキャン時に自分の保存値を優先するための土台。
-- 1) menu_items.updated_at（最後に保存した自メニューの判定に使う）
-- 2) 同一ユーザー・同一店舗・同一バーコードの重複を禁止する部分ユニークインデックス
--    名前は既存のエラーマッピング（Web mapMenuItemSaveError / Mobile MenuItemEditorModal）が参照する制約名に合わせる。
--    既存の重複は事前に手動で解消済み（2026-10-26 時点で 0 件）。残っていればインデックス作成で失敗する。

ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS updated_at timestamptz;
UPDATE public.menu_items SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE public.menu_items
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

COMMENT ON COLUMN public.menu_items.updated_at IS
  '最終保存日時（Issue #358）。再スキャン時に最後に保存した自メニューの値を優先するために使う。';

CREATE OR REPLACE FUNCTION public.menu_items_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS menu_items_touch_updated_at ON public.menu_items;
CREATE TRIGGER menu_items_touch_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.menu_items_touch_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS menu_items_user_id_restaurant_id_shared_barcode_key
  ON public.menu_items (user_id, restaurant_id, shared_barcode)
  WHERE shared_barcode IS NOT NULL;
