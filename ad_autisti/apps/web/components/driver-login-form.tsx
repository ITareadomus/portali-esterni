"use client";

import { useActionState, useRef } from "react";
import Image from "next/image";
import { loginDriverAction } from "@/app/autisti/login/actions";
import type { ThemeName } from "@/lib/theme";
import { ThemeToggle } from "@/components/theme-toggle";

type DriverLoginFormProps = {
  initialTheme: ThemeName;
};

const initialDriverLoginState = {
  code: "",
  message: null,
  remember: false,
};

export function DriverLoginForm({ initialTheme }: DriverLoginFormProps) {
  const [state, formAction, isPending] = useActionState(loginDriverAction, initialDriverLoginState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <main className="autisti-page-shell relative flex min-h-dvh items-center justify-center px-4 py-10 text-autisti-text transition-colors sm:px-6 dark:text-autisti-dark-100">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle initialTheme={initialTheme} shape="pillow" tone="autisti" />
      </div>

      <div className="grid w-full max-w-md justify-items-center gap-6">
        <Image
          alt="AD Premium"
          className="h-auto w-[110px] max-w-full dark:hidden"
          height={90}
          loading="eager"
          src="/img/ad-premium.png"
          width={90}
        />
        <Image
          alt="AD Premium"
          className="hidden h-auto w-[110px] max-w-full dark:block"
          height={90}
          loading="eager"
          src="/img/ad-premium-inv.png"
          width={90}
        />

        <section
          className="autisti-glass-strong grid w-full gap-5 rounded-3xl border p-6 transition-colors sm:p-8"
          aria-labelledby="autisti-login-title"
        >
          <h1
            className="autisti-title-condensed text-center text-[2.4rem] leading-none text-autisti-text dark:text-autisti-dark-100"
            id="autisti-login-title"
          >
            Portale autisti
          </h1>

          {state.message ? (
            <div
              className="rounded-2xl border border-red-600/20 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {state.message}
            </div>
          ) : null}

          <form action={formAction} className="grid gap-4" ref={formRef}>
            <label className="grid gap-1.5 text-sm text-autisti-muted dark:text-autisti-dark-300">
              <span className="pl-4">Codice furgone</span>
              <input
                className="min-h-12 w-full rounded-full border border-[color:var(--autisti-glass-border)] bg-[var(--autisti-glass-muted)] px-4 py-2 text-base uppercase text-autisti-text outline-none transition placeholder:normal-case placeholder:text-autisti-muted/70 focus:border-autisti-primary focus:ring-4 focus:ring-autisti-primary/15 dark:text-autisti-dark-100 dark:placeholder:text-autisti-dark-300/60 dark:focus:border-autisti-dark-300 dark:focus:ring-autisti-dark-300/20"
                autoCapitalize="characters"
                autoComplete="username"
                defaultValue={state.code}
                enterKeyHint="next"
                name="code"
                placeholder="Veicolo"
                required
                spellCheck={false}
                type="text"
              />
            </label>

            <label className="grid gap-1.5 text-sm text-autisti-muted dark:text-autisti-dark-300">
              <span className="pl-4">Password</span>
              <input
                className="min-h-12 w-full rounded-full border border-[color:var(--autisti-glass-border)] bg-[var(--autisti-glass-muted)] px-4 py-2 text-base text-autisti-text outline-none transition placeholder:text-autisti-muted/70 focus:border-autisti-primary focus:ring-4 focus:ring-autisti-primary/15 dark:text-autisti-dark-100 dark:placeholder:text-autisti-dark-300/60 dark:focus:border-autisti-dark-300 dark:focus:ring-autisti-dark-300/20"
                autoComplete="current-password"
                enterKeyHint="done"
                name="password"
                placeholder="Password"
                required
                type="password"
              />
            </label>

            <label className="mt-2.5 flex items-center gap-2.5 pl-4 text-sm text-autisti-muted dark:text-autisti-dark-300">
              <input
                className="size-5 rounded-full border-autisti-border text-autisti-primary accent-autisti-primary dark:border-autisti-dark-700 dark:accent-autisti-dark-300"
                defaultChecked={state.remember}
                name="remember"
                type="checkbox"
              />
              <span>Ricordami su questo dispositivo</span>
            </label>

            <button
              className="min-h-12 rounded-full border border-autisti-primary bg-autisti-primary px-5 font-light text-autisti-on-primary transition hover:bg-autisti-primary-hover disabled:cursor-not-allowed disabled:opacity-65 dark:border-autisti-dark-300 dark:bg-autisti-dark-300 dark:text-autisti-dark-950 dark:hover:bg-autisti-dark-100"
              disabled={isPending}
              onClick={() => formRef.current?.requestSubmit()}
              type="button"
            >
              {isPending ? "Accesso in corso" : "Accedi"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
