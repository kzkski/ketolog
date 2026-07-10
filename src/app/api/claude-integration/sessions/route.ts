import { NextResponse } from "next/server";

import { resolveRequestUser } from "@/lib/api/resolve-request-user";
import {
  ClaudeIntegrationError,
  issueClaudeIntegrationSession,
  listClaudeIntegrationSessions,
} from "@/lib/claude-integration/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const resolved = await resolveRequestUser(request);
  if (!resolved) return jsonError("認証が必要です", 401);

  try {
    const body = await listClaudeIntegrationSessions(resolved.user.id);
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof ClaudeIntegrationError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("連携セッション一覧の取得に失敗しました", 500);
  }
}

export async function POST(request: Request) {
  const resolved = await resolveRequestUser(request);
  if (!resolved) return jsonError("認証が必要です", 401);

  let label: string | undefined;
  try {
    const body = (await request.json()) as { label?: unknown };
    if (typeof body.label === "string") label = body.label;
  } catch {
    // body なしでも可
  }

  try {
    const result = await issueClaudeIntegrationSession(resolved.user, label);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ClaudeIntegrationError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("連携トークンの発行に失敗しました", 500);
  }
}
