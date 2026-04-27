-- Issue #318: existing menu edit with OFF-miss + manual shared product (FK menu_items → shared_products).

CREATE OR REPLACE FUNCTION public.update_menu_item_with_manual_shared_product(
  p_menu_item_id uuid,
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
  v_restaurant_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'update_menu_item_manual_shared: not authenticated';
  END IF;

  IF p_menu_item_id IS NULL THEN
    RAISE EXCEPTION 'update_menu_item_manual_shared: missing menu item';
  END IF;

  SELECT mi.restaurant_id
  INTO v_restaurant_id
  FROM public.menu_items mi
  WHERE mi.id = p_menu_item_id AND mi.user_id = v_uid
  FOR UPDATE;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'update_menu_item_manual_shared: menu not found';
  END IF;

  IF p_barcode IS NULL OR btrim(p_barcode) = '' THEN
    RAISE EXCEPTION 'update_menu_item_manual_shared: invalid barcode';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.user_id = v_uid
      AND mi.restaurant_id = v_restaurant_id
      AND mi.shared_barcode = btrim(p_barcode)
      AND mi.id <> p_menu_item_id
  ) THEN
    RAISE EXCEPTION 'update_menu_item_manual_shared: menu_item_barcode_exists';
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
    now(),
    now()
  )
  ON CONFLICT (barcode) DO NOTHING;

  UPDATE public.menu_items
  SET
    name = p_menu_name,
    protein_per_100g = p_menu_protein,
    fat_per_100g = p_menu_fat,
    carbs_per_100g = p_menu_carbs,
    default_grams = p_default_grams,
    rank = p_rank,
    notes = p_notes,
    group_name = NULLIF(btrim(COALESCE(p_group_name, '')), ''),
    group_order = p_group_order,
    shared_barcode = btrim(p_barcode),
    standard_food_code = NULL
  WHERE id = p_menu_item_id
    AND user_id = v_uid;

  RETURN p_menu_item_id;
END;
$fn$;

COMMENT ON FUNCTION public.update_menu_item_with_manual_shared_product IS
  'Issue #318: OFF 未ヒットの手動登録で既存 menu_items を更新する前に shared_products 行を確保（同一トランザクション）。';

REVOKE ALL ON FUNCTION public.update_menu_item_with_manual_shared_product(
  uuid, text, text, text, numeric, numeric, numeric, text, numeric,
  text, numeric, numeric, numeric, numeric, smallint, text, text, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_menu_item_with_manual_shared_product(
  uuid, text, text, text, numeric, numeric, numeric, text, numeric,
  text, numeric, numeric, numeric, numeric, smallint, text, text, integer
) TO authenticated;
