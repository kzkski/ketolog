import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

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

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const t = value.trim();
  return t.length > 0 ? t : undefined;
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
    const code = nonEmptyString(o.code);
    const details = nonEmptyString(o.details);
    const hint = nonEmptyString(o.hint);
    const statusPart =
      typeof o.status === "number"
        ? `status=${o.status}`
        : typeof o.statusCode === "number"
          ? `statusCode=${o.statusCode}`
          : typeof o.statusCode === "string" && o.statusCode.trim()
            ? `statusCode=${o.statusCode.trim()}`
            : undefined;

    const msg =
      nonEmptyString(o.message) ||
      nonEmptyString(o.error_description) ||
      nonEmptyString(o.msg) ||
      nonEmptyString(typeof o.error === "string" ? o.error : undefined);

    if (msg || code || details || hint || statusPart) {
      const parts = [statusPart, code && `code=${code}`, details, hint, msg].filter(
        Boolean
      ) as string[];
      return {
        code,
        details,
        hint,
        message: parts.join(" | ").slice(0, 800) || "structured_error_without_text",
      };
    }

    // 別レルム等で Error っぽいが instanceof 失敗したオブジェクト
    const name = nonEmptyString(o.name);
    const stack = nonEmptyString(typeof o.stack === "string" ? o.stack : undefined);
    if (name || stack) {
      return {
        message: [name, stack?.split("\n")[0]].filter(Boolean).join(" | ").slice(0, 800),
      };
    }

    try {
      const keys = Object.keys(o).slice(0, 16);
      const brief = keys
        .map((k) => {
          const v = o[k];
          if (v == null) return `${k}=null`;
          if (typeof v === "string") {
            const s = v.trim();
            if (!s) return null;
            return `${k}=${s.slice(0, 160)}`;
          }
          if (typeof v === "number" || typeof v === "boolean") return `${k}=${v}`;
          return `${k}=${typeof v}`;
        })
        .filter((x): x is string => x != null)
        .join("; ");
      if (brief) {
        return { message: brief };
      }
      const json = JSON.stringify(o);
      return {
        message:
          json.length > 600 ? `${json.slice(0, 600)}…(truncated)` : json || "empty_object",
      };
    } catch {
      return { message: Object.prototype.toString.call(error) };
    }
  }

  return { message: String(error).slice(0, 800) };
}

function getSupabaseClient() {
  try {
    return getSupabaseServiceRoleClient();
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : "Health check is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    );
  }
}

export async function GET() {
  const startedAt = performance.now();

  try {
    const supabase = getSupabaseClient();
    // `head: true` は PostgREST へ HEAD になり、環境によっては失敗する（Vercel の External API ログで HEAD が赤くなる）。
    // `shared_products` の主キーは `barcode`（`id` 列はない）。軽量の GET + limit(1) で疎通だけ確認する。
    const { error } = await supabase.from("shared_products").select("barcode").limit(1);

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
