-- Issue #3: 文科省食品標準成分表（八訂増補2023・第2章）マスタと検索
-- シードデータは別マイグレーション（npm run etl:mext-ch2 で再生成）

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.standard_food_items (
  food_code text PRIMARY KEY CHECK (food_code ~ '^[0-9]{5}$'),
  group_code text NOT NULL CHECK (group_code ~ '^[0-9]{2}$'),
  name text NOT NULL,
  name_normalized text NOT NULL,
  protein_per_100g numeric,
  fat_per_100g numeric,
  carbs_per_100g numeric,
  source_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX standard_food_items_group_code_idx ON public.standard_food_items (group_code);
CREATE INDEX standard_food_items_name_normalized_trgm_idx
  ON public.standard_food_items USING gin (name_normalized gin_trgm_ops);

ALTER TABLE public.menu_items
  ADD COLUMN standard_food_code text;

ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_standard_food_code_fkey
  FOREIGN KEY (standard_food_code)
  REFERENCES public.standard_food_items (food_code)
  ON DELETE SET NULL;

CREATE INDEX idx_menu_items_standard_food_code ON public.menu_items (standard_food_code);

ALTER TABLE public.standard_food_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY standard_food_items_select_authenticated ON public.standard_food_items
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.search_standard_foods(
  p_query text,
  p_group_code text DEFAULT NULL,
  p_limit int DEFAULT 40
)
RETURNS SETOF public.standard_food_items
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  q text := trim(replace(replace(coalesce(p_query, ''), E'　', ' '), '  ', ' '));
  g text := nullif(trim(coalesce(p_group_code, '')), '');
  lim int := least(100, greatest(1, coalesce(p_limit, 40)));
BEGIN
  IF length(q) < 1 AND g IS NULL THEN
    RETURN;
  END IF;

  IF length(q) < 1 AND g IS NOT NULL THEN
    RETURN QUERY
    SELECT s.*
    FROM public.standard_food_items s
    WHERE s.group_code = g
    ORDER BY s.name_normalized, s.food_code
    LIMIT lim;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.*
  FROM public.standard_food_items s
  WHERE (g IS NULL OR s.group_code = g)
    AND (
      s.name_normalized ILIKE '%' || q || '%'
      OR (length(q) >= 2 AND similarity(s.name_normalized, q) > 0.12)
    )
  ORDER BY similarity(s.name_normalized, q) DESC NULLS LAST,
           s.name_normalized,
           s.food_code
  LIMIT lim;
END;
$$;

COMMENT ON TABLE public.standard_food_items IS '日本食品標準成分表（八訂）増補2023・第2章（可食部100gあたり）。糖質相当は CHOAVL（利用可能炭水化物・質量計）。';
COMMENT ON FUNCTION public.search_standard_foods IS '名称の ILIKE 部分一致と pg_trgm similarity。群のみ指定時は群内を名前順に返す。';

GRANT SELECT ON public.standard_food_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_standard_foods(text, text, int) TO authenticated;
