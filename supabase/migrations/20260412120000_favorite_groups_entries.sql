-- Issue #66: お気に入りを favorite_groups / favorite_entries に移行し menu_items.is_favorite を廃止

CREATE TABLE public.favorite_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT favorite_groups_user_name_unique UNIQUE (user_id, name)
);

CREATE TABLE public.favorite_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  favorite_group_id uuid NOT NULL REFERENCES public.favorite_groups (id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items (id) ON DELETE CASCADE,
  display_order integer NOT NULL DEFAULT 0,
  CONSTRAINT favorite_entries_menu_item_unique UNIQUE (menu_item_id)
);

CREATE INDEX idx_favorite_groups_user_display
  ON public.favorite_groups (user_id, display_order);

CREATE INDEX idx_favorite_entries_group_display
  ON public.favorite_entries (favorite_group_id, display_order);

-- 既存 is_favorite を移行（店名と一致する favorite_groups を作成し、エントリを挿入）
INSERT INTO public.favorite_groups (user_id, name, display_order)
SELECT user_id, gname, dord
FROM (
  SELECT DISTINCT
    m.user_id,
    r.name AS gname,
    (DENSE_RANK() OVER (PARTITION BY m.user_id ORDER BY r.name) - 1)::integer AS dord
  FROM public.menu_items m
  INNER JOIN public.restaurants r
    ON r.id = m.restaurant_id AND r.user_id = m.user_id
  WHERE COALESCE(m.is_favorite, false) = true
) AS distinct_groups;

INSERT INTO public.favorite_entries (favorite_group_id, menu_item_id, display_order)
SELECT fg.id, m.id,
  (ROW_NUMBER() OVER (PARTITION BY fg.id ORDER BY m.name) - 1)::integer
FROM public.menu_items m
INNER JOIN public.restaurants r
  ON r.id = m.restaurant_id AND r.user_id = m.user_id
INNER JOIN public.favorite_groups fg
  ON fg.user_id = m.user_id AND fg.name = r.name
WHERE COALESCE(m.is_favorite, false) = true;

ALTER TABLE public.menu_items
  DROP COLUMN IF EXISTS is_favorite;

ALTER TABLE public.favorite_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "favorite_groups_select_own"
  ON public.favorite_groups FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "favorite_groups_insert_own"
  ON public.favorite_groups FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "favorite_groups_update_own"
  ON public.favorite_groups FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "favorite_groups_delete_own"
  ON public.favorite_groups FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "favorite_entries_select_own"
  ON public.favorite_entries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.favorite_groups fg
      WHERE fg.id = favorite_group_id AND fg.user_id = auth.uid()
    )
  );

CREATE POLICY "favorite_entries_insert_own"
  ON public.favorite_entries FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.favorite_groups fg
      WHERE fg.id = favorite_group_id AND fg.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.menu_items mi
      WHERE mi.id = menu_item_id AND mi.user_id = auth.uid()
    )
  );

CREATE POLICY "favorite_entries_update_own"
  ON public.favorite_entries FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.favorite_groups fg
      WHERE fg.id = favorite_group_id AND fg.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.favorite_groups fg
      WHERE fg.id = favorite_group_id AND fg.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.menu_items mi
      WHERE mi.id = menu_item_id AND mi.user_id = auth.uid()
    )
  );

CREATE POLICY "favorite_entries_delete_own"
  ON public.favorite_entries FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.favorite_groups fg
      WHERE fg.id = favorite_group_id AND fg.user_id = auth.uid()
    )
  );
