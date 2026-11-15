// Production 5xx error monitoring.
//
// 1. Logs single-line structured JSON (`[BILLJOT_5XX]`) to stderr so Vercel
//    Log Alerts / Log Drains can filter on `[BILLJOT_5XX]` or `level:"error"`.
// 2. Persists recent server crashes to `public.server_error_logs` (service-role
//    only under RLS) for post-mortem inspection without external services.
// 3. Optionally forwards alerts to `ERROR_ALERT_WEBHOOK_URL` (Slack / Discord /
//    custom JSON webhook) and/or `SENTRY_DSN` via Sentry's HTTP Envelope API
//    with zero runtime SDK overhead.

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

export type CapturedErrorInput = {
  error: unknown;
  route: string;
  method?: string;
  context?: Record<string, unknown>;
};

export function parseSentryDsn(dsn: string | undefined): {
  envelopeUrl: string;
  publicKey: string;
  dsn: string;
} | null {
  if (!dsn?.trim()) return null;
  try {
    const u = new URL(dsn.trim());
    const publicKey = u.username;
    const parts = u.pathname.split("/").filter(Boolean);
    const projectId = parts[parts.length - 1];
    if (!publicKey || !projectId) return null;
    const basePath = parts.length > 1 ? `/${parts.slice(0, -1).join("/")}` : "";
    return {
      envelopeUrl: `${u.protocol}//${u.host}${basePath}/api/${projectId}/envelope/`,
      publicKey,
      dsn: dsn.trim(),
    };
  } catch {
    return null;
  }
}

function normalizeError(err: unknown): {
  name: string;
  message: string;
  digest: string | null;
  stack: string | null;
} {
  if (err instanceof Error) {
    const digest =
      typeof (err as Error & { digest?: unknown }).digest === "string"
        ? ((err as Error & { digest?: string }).digest ?? null)
        : null;
    return {
      name: err.name || "Error",
      message: err.message || "Unhandled server error",
      digest,
      stack: err.stack ? err.stack.slice(0, 6000) : null,
    };
  }
  return {
    name: "UnknownError",
    message: typeof err === "string" ? err : JSON.stringify(err ?? "Unknown error"),
    digest: null,
    stack: null,
  };
}

export async function captureServerError(input: CapturedErrorInput): Promise<void> {
  const info = normalizeError(input.error);

  // Ignore Next.js internal control-flow throws (redirect / notFound)
  if (
    info.digest?.startsWith("NEXT_REDIRECT") ||
    info.digest?.startsWith("NEXT_NOT_FOUND")
  ) {
    return;
  }

  const timestamp = new Date().toISOString();
  const payload = {
    tag: "BILLJOT_5XX",
    level: "error",
    timestamp,
    route: input.route,
    method: input.method ?? "GET",
    error_name: info.name,
    message: info.message,
    digest: info.digest,
    context: input.context ?? {},
  };

  // 1. Structured Vercel log line
  console.error(`[BILLJOT_5XX] ${JSON.stringify(payload)}`);

  const tasks: Promise<unknown>[] = [];

  // 2. Persist in `server_error_logs` (best-effort)
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    tasks.push(
      (async () => {
        try {
          const admin = createAdminClient();
          await admin.from("server_error_logs").insert({
            route: input.route.slice(0, 500),
            method: (input.method ?? "GET").slice(0, 16),
            error_name: info.name.slice(0, 120),
            message: info.message.slice(0, 2000),
            digest: info.digest,
            stack: info.stack,
            context: (input.context ?? {}) as Json,
          });
        } catch {
          // Never let telemetry break request handling
        }
      })(),
    );
  }

  // 3. Optional webhook alert (Slack / Discord / custom HTTP endpoint)
  const webhookUrl = process.env.ERROR_ALERT_WEBHOOK_URL?.trim();
  if (webhookUrl) {
    tasks.push(
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `🚨 [Billjot 5xx] ${input.method ?? "GET"} ${input.route}: ${info.name}: ${info.message}`,
          ...payload,
        }),
        signal: AbortSignal.timeout(4000),
      }).catch(() => undefined),
    );
  }

  // 4. Optional Sentry Envelope ingestion when SENTRY_DSN is set
  const sentry = parseSentryDsn(process.env.SENTRY_DSN);
  if (sentry) {
    const eventId = randomUUID().replace(/-/g, "");
    const envelopeHeader = JSON.stringify({
      event_id: eventId,
      sent_at: timestamp,
      dsn: sentry.dsn,
    });
    const itemHeader = JSON.stringify({ type: "event" });
    const eventBody = JSON.stringify({
      event_id: eventId,
      timestamp,
      platform: "node",
      level: "error",
      environment: process.env.NODE_ENV ?? "production",
      transaction: input.route,
      exception: {
        values: [
          {
            type: info.name,
            value: info.message,
          },
        ],
      },
      tags: {
        route: input.route,
        method: input.method ?? "GET",
      },
      extra: {
        digest: info.digest,
        stack: info.stack,
        ...(input.context ?? {}),
      },
    });
    tasks.push(
      fetch(sentry.envelopeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-sentry-envelope",
          "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=billjot/1.0, sentry_key=${sentry.publicKey}`,
        },
        body: `${envelopeHeader}\n${itemHeader}\n${eventBody}\n`,
        signal: AbortSignal.timeout(4000),
      }).catch(() => undefined),
    );
  }

  await Promise.allSettled(tasks);
}
