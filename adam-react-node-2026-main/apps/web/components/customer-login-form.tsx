"use client";

import { useActionState, useRef } from "react";
import Image from "next/image";
import { loginCustomerAction } from "@/app/clienti/login/actions";
import type { ThemeName } from "@/lib/theme";
import { ThemeToggle } from "@/components/theme-toggle";

type CustomerLoginFormProps = {
  initialTheme: ThemeName;
};

const initialCustomerLoginState = {
  email: "",
  message: null,
  remember: false,
};

export function CustomerLoginForm({ initialTheme }: CustomerLoginFormProps) {
  const [state, formAction, isPending] = useActionState(loginCustomerAction, initialCustomerLoginState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <main className="clienti-page-shell relative flex min-h-dvh items-center justify-center px-4 py-10 text-clienti-text transition-colors sm:px-6 dark:text-clienti-dark-100">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle initialTheme={initialTheme} shape="pillow" />
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
          className="clienti-glass-strong grid w-full gap-5 rounded-3xl border p-6 transition-colors sm:p-8"
          aria-labelledby="clienti-login-title"
        >
          <h1 className="clienti-title-condensed text-center text-[2.4rem] leading-none text-clienti-text dark:text-clienti-dark-100" id="clienti-login-title">
            Portale clienti
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
            <label className="grid gap-1.5 text-sm text-clienti-muted dark:text-clienti-dark-300">
              <span className="pl-4">Email</span>
              <input
                className="min-h-12 w-full rounded-full border border-[color:var(--clienti-glass-border)] bg-[var(--clienti-glass-muted)] px-4 py-2 text-base text-clienti-text outline-none transition placeholder:text-clienti-muted/70 focus:border-clienti-primary focus:ring-4 focus:ring-clienti-primary/15 dark:text-clienti-dark-100 dark:placeholder:text-clienti-dark-300/60 dark:focus:border-clienti-dark-300 dark:focus:ring-clienti-dark-300/20"
                autoComplete="email"
                defaultValue={state.email}
                enterKeyHint="next"
                name="email"
                placeholder="nome@azienda.it"
                required
                type="email"
              />
            </label>

            <label className="grid gap-1.5 text-sm text-clienti-muted dark:text-clienti-dark-300">
              <span className="pl-4">Password</span>
              <input
                className="min-h-12 w-full rounded-full border border-[color:var(--clienti-glass-border)] bg-[var(--clienti-glass-muted)] px-4 py-2 text-base text-clienti-text outline-none transition placeholder:text-clienti-muted/70 focus:border-clienti-primary focus:ring-4 focus:ring-clienti-primary/15 dark:text-clienti-dark-100 dark:placeholder:text-clienti-dark-300/60 dark:focus:border-clienti-dark-300 dark:focus:ring-clienti-dark-300/20"
                autoComplete="current-password"
                enterKeyHint="done"
                name="password"
                placeholder="Password"
                required
                type="password"
              />
            </label>

            <label className="mt-2.5 flex items-center gap-2.5 pl-4 text-sm text-clienti-muted dark:text-clienti-dark-300">
              <input
                className="size-5 rounded-full border-clienti-border text-clienti-primary accent-clienti-primary dark:border-clienti-dark-700 dark:accent-clienti-dark-300"
                defaultChecked={state.remember}
                name="remember"
                type="checkbox"
              />
              <span>Ricordami su questo dispositivo</span>
            </label>

            <button
              className="min-h-12 rounded-full border border-clienti-primary bg-clienti-primary px-5 font-light text-clienti-on-primary transition hover:bg-clienti-primary-hover disabled:cursor-not-allowed disabled:opacity-65 dark:border-clienti-dark-300 dark:bg-clienti-dark-300 dark:text-clienti-dark-950 dark:hover:bg-clienti-dark-100"
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
