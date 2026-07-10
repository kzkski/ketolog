-- Claude 連携用に発行した独立 Supabase Auth セッションの追跡（refresh_token 自体は保存しない）
-- 本番には SQL Editor で先行適用済みのため、IF NOT EXISTS で冪等にしている。
CREATE TABLE IF NOT EXISTS public.claude_integration_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  auth_session_id uuid NOT NULL,
  label text NOT NULL DEFAULT 'Claude連携',
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT claude_integration_sessions_auth_session_id_key UNIQUE (auth_session_id)
);

CREATE INDEX IF NOT EXISTS claude_integration_sessions_user_id_created_at_idx
  ON public.claude_integration_sessions (user_id, created_at DESC);

ALTER TABLE public.claude_integration_sessions ENABLE ROW LEVEL SECURITY;

-- service_role 経由の API のみが読み書きする（authenticated 向けポリシーは設けない）

CREATE OR REPLACE FUNCTION public.revoke_claude_auth_session(
  p_auth_session_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM auth.sessions
  WHERE id = p_auth_session_id AND user_id = p_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_claude_auth_session(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_claude_auth_session(uuid, uuid) TO service_role;
