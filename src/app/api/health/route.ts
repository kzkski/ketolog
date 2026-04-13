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
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getTimestamp() {
  return new Date().toISOString();
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
      .select("id", { head: true, count: "exact" })
      .limit(1);

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
      },
    });

    const body: HealthResponse = {
      ok: false,
      checks: {
        app: "ok",
        supabase: "error",
      },
      db_latency_ms: Math.round(performance.now() - startedAt),
      timestamp: getTimestamp(),
      error: message,
    };

    return NextResponse.json(body, { status: 503 });
  }
}
