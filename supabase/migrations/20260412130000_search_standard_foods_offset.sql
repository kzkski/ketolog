-- search_standard_foods に OFFSET を追加（ページ送り用）

DROP FUNCTION IF EXISTS public.search_standard_foods(text, text, int);

CREATE OR REPLACE FUNCTION public.search_standard_foods(
  p_query text,
  p_group_code text DEFAULT NULL,
  p_limit int DEFAULT 40,
  p_offset int DEFAULT 0
)
RETURNS SETOF public.standard_food_items
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  q text := trim(replace(replace(coalesce(p_query, ''), E'　', ' '), '  ', ' '));
  g text := nullif(trim(coalesce(p_group_code, '')), '');
  lim int := least(100, greatest(1, coalesce(p_limit, 40)));
  off int := greatest(0, least(coalesce(p_offset, 0), 10000));
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
    LIMIT lim OFFSET off;
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
  LIMIT lim OFFSET off;
END;
$$;

COMMENT ON FUNCTION public.search_standard_foods(text, text, int, int) IS '名称の ILIKE 部分一致と pg_trgm similarity。群のみ指定時は群内を名前順に返す。p_offset でページ送り（最大10000）。';

GRANT EXECUTE ON FUNCTION public.search_standard_foods(text, text, int, int) TO authenticated;
