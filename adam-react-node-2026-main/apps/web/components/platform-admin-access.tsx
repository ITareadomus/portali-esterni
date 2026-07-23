"use client";

import { FormEvent, useEffect, useState } from "react";
import type { PlatformContextResponse } from "@adam/types";
import { getPlatformContext } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return "Errore accesso platform.";
}

export function PlatformAdminAccess() {
  const session = authClient.useSession();
  const [context, setContext] = useState<PlatformContextResponse | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadContext() {
      if (!session.data) {
        setContext(null);
        return;
      }

      setIsLoadingContext(true);
      setFeedback(null);
      try {
        const response = await getPlatformContext();
        if (active) {
          setContext(response);
        }
      } catch (error) {
        if (active) {
          setContext(null);
          setFeedback(getErrorMessage(error));
        }
      } finally {
        if (active) {
          setIsLoadingContext(false);
        }
      }
    }

    void loadContext();

    return () => {
      active = false;
    };
  }, [session.data]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    setFeedback(null);
    setIsSubmitting(true);

    try {
      const response = await authClient.signIn.email({
        email,
        password,
      });
      if (response.error) {
        throw response.error;
      }

      await session.refetch();
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignOut() {
    setFeedback(null);
    setIsSubmitting(true);

    try {
      const response = await authClient.signOut();
      if (response.error) {
        throw response.error;
      }

      setContext(null);
      await session.refetch();
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const isReady = Boolean(context);
  const label = session.isPending
    ? "Verifica sessione"
    : isLoadingContext
      ? "Caricamento contesto"
      : isReady
        ? "Admin globale"
        : "Accesso richiesto";

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-4" aria-live="polite">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">ADAM Platform</p>
          <h1 className="text-2xl font-bold text-slate-950">Accesso amministrazione globale</h1>
        </div>
        <span
          className={`inline-flex min-h-8 w-fit items-center rounded-full border px-3 py-1 text-sm ${
            isReady ? "border-better-auth-700/30 text-better-auth-700" : "border-slate-200 text-slate-500"
          }`}
        >
          {label}
        </span>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,420px)_1fr] lg:items-start">
        <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-6" onSubmit={handleSubmit}>
          <div>
            <h2 className="text-xl font-bold text-slate-950">AD Premium</h2>
            <p className="mt-1 text-sm text-slate-600">Login riservato all'admin globale Better Auth.</p>
          </div>
          <label className="grid gap-1.5 text-sm text-slate-600">
            Email
            <input
              className="min-h-10 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-950 outline-none transition focus:border-better-auth-700 focus:ring-4 focus:ring-better-auth-700/15"
              autoComplete="email"
              defaultValue="it@areadomus.it"
              name="email"
              required
              type="email"
            />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-600">
            Password
            <input
              className="min-h-10 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-950 outline-none transition focus:border-better-auth-700 focus:ring-4 focus:ring-better-auth-700/15"
              autoComplete="current-password"
              minLength={8}
              name="password"
              required
              type="password"
            />
          </label>
          <div className="flex flex-wrap gap-2.5">
            <button
              className="min-h-10 min-w-[120px] rounded-lg border border-better-auth-700 bg-better-auth-700 px-4 font-medium text-white transition hover:bg-better-auth-700/90 disabled:cursor-not-allowed disabled:opacity-65"
              disabled={isSubmitting}
              type="submit"
            >
              Accedi
            </button>
            {session.data ? (
              <button
                className="min-h-10 min-w-[120px] rounded-lg border border-slate-200 bg-white px-4 font-medium text-slate-950 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-65"
                disabled={isSubmitting}
                onClick={handleSignOut}
                type="button"
              >
                Esci
              </button>
            ) : null}
          </div>
          {feedback ? <p className="text-sm text-slate-600">{feedback}</p> : null}
          {session.error ? <p className="text-sm text-slate-600">{session.error.message}</p> : null}
        </form>

        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-6">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Contesto platform</h2>
            <p className="mt-1 text-sm text-slate-600">
              Il contesto viene letto da Nest tramite sessione Better Auth.
            </p>
          </div>
          <dl className="grid gap-3">
            <div className="grid gap-1 border-b border-slate-200 pb-3 sm:grid-cols-[140px_1fr] sm:gap-3">
              <dt className="text-slate-500">Utente</dt>
              <dd className="m-0 [overflow-wrap:anywhere]">{context?.user.name ?? "-"}</dd>
            </div>
            <div className="grid gap-1 border-b border-slate-200 pb-3 sm:grid-cols-[140px_1fr] sm:gap-3">
              <dt className="text-slate-500">Email</dt>
              <dd className="m-0 [overflow-wrap:anywhere]">{context?.user.email ?? "-"}</dd>
            </div>
            <div className="grid gap-1 border-b border-slate-200 pb-3 sm:grid-cols-[140px_1fr] sm:gap-3">
              <dt className="text-slate-500">Ruolo globale</dt>
              <dd className="m-0 [overflow-wrap:anywhere]">{context?.platform.role ?? "-"}</dd>
            </div>
            <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-3">
              <dt className="text-slate-500">Tenant bound</dt>
              <dd className="m-0 [overflow-wrap:anywhere]">{context ? String(context.platform.tenantBound) : "-"}</dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}
