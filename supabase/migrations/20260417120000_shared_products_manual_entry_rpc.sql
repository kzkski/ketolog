-- Issue #191: manual shared_products row + menu_items insert in one transaction (RPC).
-- Adds audit column created_by; user-registered rows use source = manual_entry.

ALTER TABLE public.shared_products
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.shared_products.created_by IS
  '初回 INSERT 時の登録ユーザー（手動登録行）。OFF 由来の行は NULL のまま。';

CREATE OR REPLACE FUNCTION public.add_menu_item_with_manual_shared_product(
  p_restaurant_id uuid,
  p_barcode text,
  p_shared_product_name text,
  p_shared_brand text,
  p_shared_protein numeric,
  p_shared_fat numeric,
  p_shared_carbs numeric,
  p_shared_serving_size text,
  p_shared_serving_size_grams numeric,
  p_menu_name text,
  p_menu_protein numeric,
  p_menu_fat numeric,
  p_menu_carbs numeric,
  p_default_grams numeric,
  p_rank smallint,
  p_notes text,
  p_group_name text,
  p_group_order integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_menu_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'add_menu_item_manual_shared: not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = p_restaurant_id AND r.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'add_menu_item_manual_shared: restaurant not found';
  END IF;

  IF p_barcode IS NULL OR btrim(p_barcode) = '' THEN
    RAISE EXCEPTION 'add_menu_item_manual_shared: invalid barcode';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.user_id = v_uid
      AND mi.restaurant_id = p_restaurant_id
      AND mi.shared_barcode = btrim(p_barcode)
  ) THEN
    RAISE EXCEPTION 'add_menu_item_manual_shared: menu_item_barcode_exists';
  END IF;

  INSERT INTO public.shared_products (
    barcode,
    product_name,
    brand,
    protein_per_100g,
    fat_per_100g,
    carbs_per_100g,
    serving_size,
    serving_size_grams,
    source,
    raw_json,
    last_checked_at,
    created_by,
    created_at,
    updated_at
  )
  VALUES (
    btrim(p_barcode),
    p_shared_product_name,
    NULLIF(btrim(COALESCE(p_shared_brand, '')), ''),
    p_shared_protein,
    p_shared_fat,
    p_shared_carbs,
    NULLIF(btrim(COALESCE(p_shared_serving_size, '')), ''),
    p_shared_serving_size_grams,
    'manual_entry',
    NULL,
    now(),
    v_uid,
    now(),
    now()
  )
  ON CONFLICT (barcode) DO NOTHING;

  INSERT INTO public.menu_items (
    user_id,
    restaurant_id,
    name,
    protein_per_100g,
    fat_per_100g,
    carbs_per_100g,
    default_grams,
    order_count,
    rank,
    notes,
    group_name,
    group_order,
    shared_barcode,
    standard_food_code
  )
  VALUES (
    v_uid,
    p_restaurant_id,
    p_menu_name,
    p_menu_protein,
    p_menu_fat,
    p_menu_carbs,
    p_default_grams,
    0,
    p_rank,
    p_notes,
    NULLIF(btrim(COALESCE(p_group_name, '')), ''),
    p_group_order,
    btrim(p_barcode),
    NULL
  )
  RETURNING id INTO v_menu_id;

  RETURN v_menu_id;
END;
$fn$;

COMMENT ON FUNCTION public.add_menu_item_with_manual_shared_product IS
  'Issue #191: OFF 未ヒットの手動登録で shared_products（初回のみ）と menu_items を同一トランザクションで追加。';

REVOKE ALL ON FUNCTION public.add_menu_item_with_manual_shared_product(
  uuid, text, text, text, numeric, numeric, numeric, text, numeric,
  text, numeric, numeric, numeric, numeric, smallint, text, text, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_menu_item_with_manual_shared_product(
  uuid, text, text, text, numeric, numeric, numeric, text, numeric,
  text, numeric, numeric, numeric, numeric, smallint, text, text, integer
) TO authenticated;
