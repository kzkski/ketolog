-- Issue #74: Remove tables not used by the app (also dropped from baseline).
-- On fresh DBs after the updated baseline, these are no-ops.

DROP TABLE IF EXISTS public.daily_log CASCADE;
DROP TABLE IF EXISTS public.daily_summary CASCADE;
DROP TABLE IF EXISTS public.body_composition CASCADE;
