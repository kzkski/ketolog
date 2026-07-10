export const MAX_ACTIVE_CLAUDE_SESSIONS = 5;

export const CLAUDE_INTEGRATION_SECTION_TITLE = "Claude連携";

export const CLAUDE_INTEGRATION_SECTION_DESCRIPTION =
  "Claude などの外部ツールが、あなた本人の食事ログ等にアクセスするための連携トークン（Supabase refresh_token）を発行します。Ketolog の通常ログインとは別の独立セッションのため、トークン利用中も本体のログインは維持されます。";

export const CLAUDE_INTEGRATION_SECURITY_HINT =
  "発行されたトークンは長期間有効な認証情報です。Claude との会話やメモに保存する際は他人と共有しないでください。不要になったら失効してください。";

export const CLAUDE_INTEGRATION_ISSUE_BUTTON_LABEL = "Claude連携トークンを発行する";

export const CLAUDE_INTEGRATION_TOKEN_ONCE_HINT =
  "トークンはこの画面で一度だけ表示されます。コピーして安全な場所に保管してください。失くした場合は再発行してください。";

export const CLAUDE_INTEGRATION_MOBILE_WEB_ONLY_HINT =
  "トークンの発行・一覧・失効は、初版では Web 版の設定から行えます。";

export const CLAUDE_INTEGRATION_MOBILE_OPEN_WEB_LABEL = "Web 版の設定を開く";

export const CLAUDE_INTEGRATION_REVOKE_CONFIRM =
  "この連携セッションを失効しますか？失効後は refresh_token で新しい access_token を取得できなくなります（既存の access_token は最大約1時間有効な場合があります）。";

export type ClaudeIntegrationSessionStatus = "active" | "revoked_or_expired";

export type ClaudeIntegrationUsageGuide = {
  supabase_url: string;
  refresh_endpoint: string;
  api_base: string;
  anon_key_placeholder: string;
  steps_markdown: string;
};

export function normalizeClaudeSessionLabel(input: string | undefined | null): string {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return "Claude連携";
  return trimmed.slice(0, 48);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** access_token JWT から session_id クレームを取り出す（検証はしない） */
export function sessionIdFromAccessToken(token: string): string | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const sessionId = payload.session_id;
  return typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null;
}

export function deriveClaudeSessionStatus(
  revokedAt: string | null | undefined,
  existsInAuthSessions: boolean
): ClaudeIntegrationSessionStatus {
  if (revokedAt) return "revoked_or_expired";
  if (!existsInAuthSessions) return "revoked_or_expired";
  return "active";
}

export function buildClaudeIntegrationUsageGuide(
  supabaseUrl: string,
  anonKey: string
): ClaudeIntegrationUsageGuide {
  const base = supabaseUrl.replace(/\/$/, "");
  const refreshEndpoint = `${base}/auth/v1/token?grant_type=refresh_token`;
  const apiBase = `${base}/rest/v1`;

  const stepsMarkdown = `このリフレッシュトークンを使って、Claude があなたのデータにアクセスします。

- データを見る時: まず \`refresh_token\` で \`access_token\` を取得し、Bearer トークンとして Supabase REST API に問い合わせる
- \`access_token\` が切れたら（約1時間）、都度 \`refresh_token\` で新しいものを取得する。取得のたびに \`refresh_token\` 自体も新しくなるので、その都度上書きして使う

\`\`\`bash
# access_token の取得
curl -X POST '${refreshEndpoint}' \\
  -H "apikey: ${anonKey}" -H "Content-Type: application/json" \\
  -d '{"refresh_token":"<発行されたトークン>"}'

# 取得した access_token でデータ参照（例: 食事ログ）
curl "${apiBase}/food_log?select=*&date=eq.2026-07-10" \\
  -H "apikey: ${anonKey}" \\
  -H "Authorization: Bearer <access_token>"
\`\`\`

RLS があなたの \`auth.uid()\` に基づいて効くため、本人の行だけが返ります。`;

  return {
    supabase_url: base,
    refresh_endpoint: refreshEndpoint,
    api_base: apiBase,
    anon_key_placeholder: anonKey,
    steps_markdown: stepsMarkdown,
  };
}
