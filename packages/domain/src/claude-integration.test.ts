import { describe, expect, it } from "vitest";
import {
  buildClaudeIntegrationUsageGuide,
  deriveClaudeSessionStatus,
  normalizeClaudeSessionLabel,
  sessionIdFromAccessToken,
} from "./claude-integration";

describe("normalizeClaudeSessionLabel", () => {
  it("空ならデフォルトラベル", () => {
    expect(normalizeClaudeSessionLabel("")).toBe("Claude連携");
    expect(normalizeClaudeSessionLabel(null)).toBe("Claude連携");
  });

  it("48文字に切り詰める", () => {
    expect(normalizeClaudeSessionLabel("a".repeat(60))).toHaveLength(48);
  });
});

describe("sessionIdFromAccessToken", () => {
  it("session_id を取り出す", () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ session_id: "11111111-1111-1111-1111-111111111111" })
    ).toString("base64url");
    const token = `${header}.${payload}.sig`;
    expect(sessionIdFromAccessToken(token)).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("不正なトークンは null", () => {
    expect(sessionIdFromAccessToken("not-a-jwt")).toBeNull();
  });
});

describe("deriveClaudeSessionStatus", () => {
  it("revoked_at があれば失効", () => {
    expect(deriveClaudeSessionStatus("2026-01-01T00:00:00Z", true)).toBe("revoked_or_expired");
  });

  it("auth.sessions に無ければ失効扱い", () => {
    expect(deriveClaudeSessionStatus(null, false)).toBe("revoked_or_expired");
  });

  it("追跡行が有効なら active", () => {
    expect(deriveClaudeSessionStatus(null, true)).toBe("active");
  });
});

describe("buildClaudeIntegrationUsageGuide", () => {
  it("エンドポイント URL を組み立てる", () => {
    const guide = buildClaudeIntegrationUsageGuide(
      "https://abc.supabase.co/",
      "anon-key-example"
    );
    expect(guide.refresh_endpoint).toContain("/auth/v1/token?grant_type=refresh_token");
    expect(guide.api_base).toBe("https://abc.supabase.co/rest/v1");
    expect(guide.steps_markdown).toContain("anon-key-example");
  });
});
