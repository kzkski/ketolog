-- Ketolog public schema baseline (Issue #72).
-- Captured from linked Supabase project introspection; trimmed to objects the app uses (see #74).
-- Regenerate from your DB: `npm run db:dump-baseline` (requires `supabase link` or DATABASE_URL).
-- Note: `restaurants.display_order` is required by the app; included here even if an older remote lacked it.

-- Shared OFF cache (referenced by menu_items.shared_barcode)
CREATE TABLE public.shared_products (
  barcode text PRIMARY KEY,
  product_name text NOT NULL,
  brand text,
  protein_per_100g numeric,
  fat_per_100g numeric,
  carbs_per_100g numeric,
  serving_size text,
  serving_size_grams numeric,
  source text NOT NULL DEFAULT 'open_food_facts',
  raw_json jsonb,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'external',
  notes text,
  order_count integer NOT NULL DEFAULT 0,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  name text NOT NULL,
  protein_per_100g numeric,
  fat_per_100g numeric,
  carbs_per_100g numeric,
  default_grams numeric NOT NULL DEFAULT 100,
  order_count integer NOT NULL DEFAULT 0,
  rank smallint NOT NULL DEFAULT 2,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  group_name text,
  group_order integer NOT NULL DEFAULT 0,
  shared_barcode text,
  CONSTRAINT menu_items_rank_check CHECK (rank >= 1 AND rank <= 4),
  CONSTRAINT menu_items_shared_barcode_fkey FOREIGN KEY (shared_barcode)
    REFERENCES public.shared_products (barcode) ON DELETE SET NULL
);

CREATE TABLE public.food_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  date date NOT NULL,
  meal_type text NOT NULL DEFAULT 'dinner',
  eaten_at timestamptz NOT NULL DEFAULT now(),
  item_name text NOT NULL,
  grams numeric NOT NULL,
  protein_g numeric,
  fat_g numeric,
  carbs_g numeric,
  source text NOT NULL DEFAULT 'manual',
  menu_item_id uuid REFERENCES public.menu_items (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT food_log_meal_type_check CHECK (
    meal_type = ANY (ARRAY['breakfast'::text, 'lunch'::text, 'dinner'::text, 'snack'::text])
  )
);

CREATE TABLE public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  diet_phase smallint NOT NULL DEFAULT 1,
  protein_target_g integer NOT NULL DEFAULT 100,
  fat_target_g integer NOT NULL DEFAULT 120,
  carbs_target_g integer NOT NULL DEFAULT 40,
  byok_api_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_settings_diet_phase_check CHECK (diet_phase >= 1 AND diet_phase <= 3)
);

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
  menu_item_id uuid NOT NULL UNIQUE REFERENCES public.menu_items (id) ON DELETE CASCADE,
  display_order integer NOT NULL DEFAULT 0
);

-- Indexes (non-PK / non-embedded-unique)
CREATE INDEX menu_items_restaurant_id_rank_order_count_idx
  ON public.menu_items (restaurant_id, rank, order_count DESC);
CREATE INDEX idx_menu_items_shared_barcode ON public.menu_items (shared_barcode);
CREATE INDEX restaurants_user_id_order_count_idx ON public.restaurants (user_id, order_count DESC);
CREATE INDEX idx_shared_products_last_checked_at ON public.shared_products (last_checked_at);
CREATE INDEX food_log_user_id_date_idx ON public.food_log (user_id, date);
CREATE INDEX idx_favorite_groups_user_display ON public.favorite_groups (user_id, display_order);
CREATE INDEX idx_favorite_entries_group_display ON public.favorite_entries (favorite_group_id, display_order);

-- Row level security
ALTER TABLE public.shared_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_entries ENABLE ROW LEVEL SECURITY;

-- Policies: shared_products (authenticated read/write cache)
CREATE POLICY shared_products_select_authenticated ON public.shared_products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY shared_products_insert_authenticated ON public.shared_products
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY shared_products_update_authenticated ON public.shared_products
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Policies: user-owned Ketolog tables (JWT role "authenticated" uses public policies)
CREATE POLICY "Users can manage their own restaurants" ON public.restaurants
  FOR ALL TO public USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage their own menu_items" ON public.menu_items
  FOR ALL TO public USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage their own food_log" ON public.food_log
  FOR ALL TO public USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage their own settings" ON public.user_settings
  FOR ALL TO public USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY favorite_groups_select_own ON public.favorite_groups
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY favorite_groups_insert_own ON public.favorite_groups
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY favorite_groups_update_own ON public.favorite_groups
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY favorite_groups_delete_own ON public.favorite_groups
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY favorite_entries_select_own ON public.favorite_entries
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.favorite_groups fg
      WHERE fg.id = favorite_group_id AND fg.user_id = auth.uid()
    )
  );
CREATE POLICY favorite_entries_insert_own ON public.favorite_entries
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.favorite_groups fg
      WHERE fg.id = favorite_group_id AND fg.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.menu_items mi
      WHERE mi.id = menu_item_id AND mi.user_id = auth.uid()
    )
  );
CREATE POLICY favorite_entries_update_own ON public.favorite_entries
  FOR UPDATE TO authenticated USING (
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
CREATE POLICY favorite_entries_delete_own ON public.favorite_entries
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.favorite_groups fg
      WHERE fg.id = favorite_group_id AND fg.user_id = auth.uid()
    )
  );

-- Grants (Supabase API roles)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
