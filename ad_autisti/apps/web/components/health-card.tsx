"use client";

import { useEffect, useState } from "react";
import { getHealth } from "@/lib/api";

type HealthState =
  | { status: "loading" }
  | { status: "ok" }
  | { status: "error"; message: string };

export function HealthCard() {
  const [state, setState] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal)
      .then(() => setState({ status: "ok" }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "health_unknown",
          });
        }
      });

    return () => controller.abort();
  }, []);

  const label =
    state.status === "loading"
      ? "Checking"
      : state.status === "ok"
        ? "API online"
        : "API unavailable";

  return (
    <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-6" aria-live="polite">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">React Base</h1>
          <p className="mt-1 text-sm text-slate-600">Replaceable frontend, stable NestJS REST API, OpenAPI contract.</p>
        </div>
        <span
          className={`inline-flex min-h-8 w-fit items-center rounded-full border px-3 py-1 text-sm ${
            state.status === "ok"
              ? "border-better-auth-700/30 text-better-auth-700"
              : state.status === "error"
                ? "border-red-600/30 text-red-700"
                : "border-slate-200 text-slate-500"
          }`}
        >
          {label}
        </span>
      </div>
      <p className="text-sm text-slate-600">
        The web app reads <code>GET /api/health</code> through the Next server-side API proxy
        configured by <code>API_INTERNAL_URL</code>.
      </p>
      {state.status === "error" ? <p className="text-sm text-red-700">{state.message}</p> : null}
    </section>
  );
}
