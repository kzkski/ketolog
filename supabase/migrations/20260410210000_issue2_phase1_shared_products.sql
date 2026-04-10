CREATE TABLE IF NOT EXISTS public.shared_products (
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

ALTER TABLE public.shared_products
  ADD COLUMN IF NOT EXISTS serving_size text;

ALTER TABLE public.shared_products
  ADD COLUMN IF NOT EXISTS serving_size_grams numeric;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS shared_barcode text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'menu_items_shared_barcode_fkey'
  ) THEN
    ALTER TABLE public.menu_items
      ADD CONSTRAINT menu_items_shared_barcode_fkey
      FOREIGN KEY (shared_barcode)
      REFERENCES public.shared_products(barcode)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_menu_items_shared_barcode
  ON public.menu_items (shared_barcode);

CREATE INDEX IF NOT EXISTS idx_shared_products_last_checked_at
  ON public.shared_products (last_checked_at);
