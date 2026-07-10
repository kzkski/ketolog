import { NextResponse } from "next/server";

import { resolveRequestUser } from "@/lib/api/resolve-request-user";
import {
  ClaudeIntegrationError,
  revokeClaudeIntegrationSession,
} from "@/lib/claude-integration/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const resolved = await resolveRequestUser(request);
  if (!resolved) return jsonError("認証が必要です", 401);

  const { id } = await context.params;
  if (!id) return jsonError("連携セッション ID が必要です", 400);

  try {
    await revokeClaudeIntegrationSession(resolved.user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ClaudeIntegrationError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("連携セッションの失効に失敗しました", 500);
  }
}
