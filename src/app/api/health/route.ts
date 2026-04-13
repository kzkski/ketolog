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
  diagnostic?: {
    code?: string;
    message: string;
    details?: string;
    hint?: string;
  };
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getTimestamp() {
  return new Date().toISOString();
}

function pickHttpDiagnostic(error: unknown): {
  code?: string;
  message: string;
  details?: string;
  hint?: string;
} {
  if (error == null) {
    return { message: "caught_null_or_undefined" };
  }
  if (typeof error === "string") {
    return { message: error.slice(0, 800) };
  }
  if (typeof error === "number" || typeof error === "boolean") {
    return { message: String(error) };
  }

  if (error instanceof Error) {
    const code =
      "code" in error && typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;
    const details =
      "details" in error && typeof (error as { details?: unknown }).details === "string"
        ? (error as { details: string }).details
        : undefined;
    const hint =
      "hint" in error && typeof (error as { hint?: unknown }).hint === "string"
        ? (error as { hint: string }).hint
        : undefined;
    const base =
      (error.message && error.message.trim()) || error.name || "Error_without_message";
    let message = base;
    const { cause } = error;
    if (cause instanceof Error && cause.message) {
      message = `${message} | cause: ${cause.message}`;
    }
    return {
      code,
      details,
      hint,
      message: message.slice(0, 800),
    };
  }

  if (typeof error === "object") {
    const o = error as Record<string, unknown>;
    const code = typeof o.code === "string" ? o.code : undefined;
    const details = typeof o.details === "string" ? o.details : undefined;
    const hint = typeof o.hint === "string" ? o.hint : undefined;
    const msg =
      (typeof o.message === "string" && o.message) ||
      (typeof o.error_description === "string" && o.error_description) ||
      (typeof o.msg === "string" && o.msg);
    if (msg) {
      return { code, details, hint, message: msg.slice(0, 800) };
    }
    try {
      const keys = Object.keys(o).slice(0, 12);
      const brief = keys
        .map((k) => {
          const v = o[k];
          if (v == null) return `${k}=null`;
          if (typeof v === "string") return `${k}=${v.slice(0, 160)}`;
          if (typeof v === "number" || typeof v === "boolean") return `${k}=${v}`;
          return `${k}=${typeof v}`;
        })
        .join("; ");
      return { message: brief || "empty_object" };
    } catch {
      return { message: Object.prototype.toString.call(error) };
    }
  }

  return { message: String(error).slice(0, 800) };
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
        ? { diagnostic: pickHttpDiagnostic(error) }
        : {}),
    };

    return NextResponse.json(body, { status: 503 });
  }
}
