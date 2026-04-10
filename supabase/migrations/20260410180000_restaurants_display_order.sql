ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;
