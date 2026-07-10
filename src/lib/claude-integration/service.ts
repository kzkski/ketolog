import {
  buildClaudeIntegrationUsageGuide,
  deriveClaudeSessionStatus,
  MAX_ACTIVE_CLAUDE_SESSIONS,
  normalizeClaudeSessionLabel,
  sessionIdFromAccessToken,
} from "@ketolog/domain/claude-integration";
import type { ClaudeIntegrationIssueResponseDto, ClaudeIntegrationSessionDto } from "@ketolog/types";
import type { User } from "@supabase/supabase-js";

import {
  getSupabaseAnonAuthClient,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/service-role";

type TrackedRow = {
  id: string;
  user_id: string;
  auth_session_id: string;
  label: string;
  created_at: string;
  revoked_at: string | null;
};

export class ClaudeIntegrationError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ClaudeIntegrationError";
  }
}

async function authSessionExists(authSessionId: string): Promise<boolean> {
  const admin = getSupabaseServiceRoleClient();
  const { data, error } = await admin
    .schema("auth")
    .from("sessions")
    .select("id")
    .eq("id", authSessionId)
    .maybeSingle();

  if (error) {
    throw new ClaudeIntegrationError("セッション状態の確認に失敗しました", 503);
  }
  return data != null;
}

async function countActiveTrackedSessions(userId: string): Promise<number> {
  const admin = getSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("claude_integration_sessions")
    .select("auth_session_id, revoked_at")
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (error) {
    throw new ClaudeIntegrationError("連携セッションの確認に失敗しました", 503);
  }

  const rows = (data ?? []) as Pick<TrackedRow, "auth_session_id" | "revoked_at">[];
  let active = 0;
  for (const row of rows) {
    if (await authSessionExists(row.auth_session_id)) active += 1;
  }
  return active;
}

function toSessionDto(row: TrackedRow, existsInAuthSessions: boolean): ClaudeIntegrationSessionDto {
  return {
    id: row.id,
    label: row.label,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
    status: deriveClaudeSessionStatus(row.revoked_at, existsInAuthSessions),
  };
}

export async function issueClaudeIntegrationSession(
  user: User,
  labelInput?: string | null
): Promise<ClaudeIntegrationIssueResponseDto> {
  if (!user.email) {
    throw new ClaudeIntegrationError("メールアドレスが確認できないため発行できません", 403);
  }

  const activeCount = await countActiveTrackedSessions(user.id);
  if (activeCount >= MAX_ACTIVE_CLAUDE_SESSIONS) {
    throw new ClaudeIntegrationError(
      `アクティブな連携セッションは最大 ${MAX_ACTIVE_CLAUDE_SESSIONS} 件までです。不要なセッションを失効してから再試行してください。`,
      429
    );
  }

  const admin = getSupabaseServiceRoleClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });

  const hashedToken = linkData?.properties?.hashed_token;
  if (linkError || !hashedToken) {
    throw new ClaudeIntegrationError("連携トークンの生成に失敗しました", 503);
  }

  const anonClient = getSupabaseAnonAuthClient();
  const { data: issued, error: verifyError } = await anonClient.auth.verifyOtp({
    token_hash: hashedToken,
    type: "email",
  });

  const refreshToken = issued?.session?.refresh_token;
  const accessToken = issued?.session?.access_token;
  if (verifyError || !refreshToken || !accessToken) {
    throw new ClaudeIntegrationError("連携セッションの確立に失敗しました", 503);
  }

  const authSessionId = sessionIdFromAccessToken(accessToken);
  if (!authSessionId) {
    throw new ClaudeIntegrationError("連携セッション ID の取得に失敗しました", 503);
  }

  const label = normalizeClaudeSessionLabel(labelInput);
  const { data: inserted, error: insertError } = await admin
    .from("claude_integration_sessions")
    .insert({
      user_id: user.id,
      auth_session_id: authSessionId,
      label,
    })
    .select("id, user_id, auth_session_id, label, created_at, revoked_at")
    .single();

  if (insertError || !inserted) {
    throw new ClaudeIntegrationError("連携セッションの記録に失敗しました", 503);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const usage = buildClaudeIntegrationUsageGuide(supabaseUrl, anonKey);

  return {
    session: toSessionDto(inserted as TrackedRow, true),
    refresh_token: refreshToken,
    usage,
  };
}

export async function listClaudeIntegrationSessions(userId: string) {
  const admin = getSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("claude_integration_sessions")
    .select("id, user_id, auth_session_id, label, created_at, revoked_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new ClaudeIntegrationError("連携セッション一覧の取得に失敗しました", 503);
  }

  const rows = (data ?? []) as TrackedRow[];
  const sessions: ClaudeIntegrationSessionDto[] = [];
  let activeCount = 0;

  for (const row of rows) {
    const exists = row.revoked_at ? false : await authSessionExists(row.auth_session_id);
    const dto = toSessionDto(row, exists);
    sessions.push(dto);
    if (dto.status === "active") activeCount += 1;
  }

  return {
    sessions,
    limits: {
      max_active: MAX_ACTIVE_CLAUDE_SESSIONS,
      active_count: activeCount,
    },
  };
}

export async function revokeClaudeIntegrationSession(userId: string, trackingId: string): Promise<void> {
  const admin = getSupabaseServiceRoleClient();
  const { data: row, error: fetchError } = await admin
    .from("claude_integration_sessions")
    .select("id, user_id, auth_session_id, label, created_at, revoked_at")
    .eq("id", trackingId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    throw new ClaudeIntegrationError("連携セッションの取得に失敗しました", 503);
  }
  if (!row) {
    throw new ClaudeIntegrationError("連携セッションが見つかりません", 404);
  }

  const tracked = row as TrackedRow;
  if (tracked.revoked_at) {
    return;
  }

  const { data: revoked, error: rpcError } = await admin.rpc("revoke_claude_auth_session", {
    p_auth_session_id: tracked.auth_session_id,
    p_user_id: userId,
  });

  if (rpcError) {
    throw new ClaudeIntegrationError("連携セッションの失効に失敗しました", 503);
  }

  if (!revoked) {
    // auth.sessions に既に無い場合も追跡行は失効済みにする
  }

  const { error: updateError } = await admin
    .from("claude_integration_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", trackingId)
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (updateError) {
    throw new ClaudeIntegrationError("連携セッションの更新に失敗しました", 503);
  }
}
