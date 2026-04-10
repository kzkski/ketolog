-- shared_products は OFF 由来の共有キャッシュ。認証ユーザーが読み取り・upsert できるようにする。
-- RLS 有効かつポリシー無しだと、JWT 経由の操作はすべて拒否され行が増えず menu_items の FK が失敗する。

ALTER TABLE public.shared_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_products_select_authenticated" ON public.shared_products;
DROP POLICY IF EXISTS "shared_products_insert_authenticated" ON public.shared_products;
DROP POLICY IF EXISTS "shared_products_update_authenticated" ON public.shared_products;

CREATE POLICY "shared_products_select_authenticated"
  ON public.shared_products
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "shared_products_insert_authenticated"
  ON public.shared_products
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "shared_products_update_authenticated"
  ON public.shared_products
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
