-- Deduplicate snapshot restaurants per user and enforce at most one row.
-- Fixes unbounded growth when maybeSingle() failed on duplicates and inserts retried (closes #120).

DO $$
DECLARE
  u RECORD;
  keep_id uuid;
BEGIN
  FOR u IN
    SELECT user_id
    FROM public.restaurants
    WHERE name = '（スナップショット記録）'
    GROUP BY user_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT r.id INTO keep_id
    FROM public.restaurants r
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS c
      FROM public.food_log fl
      WHERE fl.user_id = r.user_id AND fl.source = r.id::text
    ) fc ON true
    WHERE r.user_id = u.user_id AND r.name = '（スナップショット記録）'
    ORDER BY COALESCE(fc.c, 0) DESC, r.created_at ASC, r.id ASC
    LIMIT 1;

    IF keep_id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.food_log fl
    SET source = keep_id::text
    WHERE fl.user_id = u.user_id
      AND EXISTS (
        SELECT 1
        FROM public.restaurants r2
        WHERE r2.user_id = u.user_id
          AND r2.name = '（スナップショット記録）'
          AND r2.id <> keep_id
          AND fl.source = r2.id::text
      );

    UPDATE public.menu_items mi
    SET restaurant_id = keep_id
    WHERE mi.user_id = u.user_id
      AND mi.restaurant_id IN (
        SELECT id
        FROM public.restaurants
        WHERE user_id = u.user_id
          AND name = '（スナップショット記録）'
          AND id <> keep_id
      );

    DELETE FROM public.restaurants
    WHERE user_id = u.user_id
      AND name = '（スナップショット記録）'
      AND id <> keep_id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_snapshot_one_per_user
  ON public.restaurants (user_id)
  WHERE name = '（スナップショット記録）';
