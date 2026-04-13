import * as Sentry from "@sentry/nextjs";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type HealthResponse = {
  ok: boolean;
  checks: {
    app: "ok";
    supabase: "ok" | "error";
  };
  db_latency_ms: number;
  timestamp: string;
  error?: "supabase_unavailable" | "healthcheck_misconfigured";
  /** PostgREST 等の表層メッセージ（機密は含めない想定）。503 時のみ。 */
  diagnostic?: { code?: string; message: string };
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getTimestamp() {
  return new Date().toISOString();
}

function pickHttpDiagnostic(error: unknown): { code?: string; message: string } | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const o = error as Record<string, unknown>;
  const code = typeof o.code === "string" ? o.code : undefined;
  const message = typeof o.message === "string" ? o.message : undefined;
  if (message) {
    return { code, message };
  }
  if (error instanceof Error && error.message) {
    return { message: error.message };
  }
  return undefined;
}

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Health check is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET() {
  const startedAt = performance.now();

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("shared_products")
      .select("id", { head: true, count: "exact" });

    if (error) {
      throw error;
    }

    const body: HealthResponse = {
      ok: true,
      checks: {
        app: "ok",
        supabase: "ok",
      },
      db_latency_ms: Math.round(performance.now() - startedAt),
      timestamp: getTimestamp(),
    };

    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("missing")
        ? "healthcheck_misconfigured"
        : "supabase_unavailable";

    Sentry.captureException(error, {
      tags: {
        check: "supabase",
        route: "/api/health",
      },
      level: "error",
      extra: {
        db_latency_ms: Math.round(performance.now() - startedAt),
        ...pickHttpDiagnostic(error),
      },
    });

    // Vercel サーバーレスではプロセス終了が早く、未 flush のイベントが落ちることがある
    await Sentry.flush(2000);

    const body: HealthResponse = {
      ok: false,
      checks: {
        app: "ok",
        supabase: "error",
      },
      db_latency_ms: Math.round(performance.now() - startedAt),
      timestamp: getTimestamp(),
      error: message,
      ...(message === "supabase_unavailable"
        ? { diagnostic: pickHttpDiagnostic(error) ?? { message: "unknown_error" } }
        : {}),
    };

    return NextResponse.json(body, { status: 503 });
  }
}
