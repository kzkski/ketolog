-- daily_log ビューを security_invoker にし、権限を最小化する。
-- Issue: kzkski/MyVitalRelay#14
-- 本番では security_invoker のみ先行適用済み。本 migration で権限整理も含めて再現可能にする。

ALTER VIEW public.daily_log SET (security_invoker = true);

COMMENT ON VIEW public.daily_log IS
  '日次集計ビュー（food_log / body_composition / sleep / activity）。security_invoker=true で基底テーブル RLS 準拠。';

REVOKE ALL ON public.daily_log FROM anon;
REVOKE ALL ON public.daily_log FROM PUBLIC;

REVOKE ALL ON public.daily_log FROM authenticated;
GRANT SELECT ON public.daily_log TO authenticated;
