"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronDown,
  ExternalLink,
  KeyRound,
  Keyboard,
  LoaderCircle,
  Lock,
  LogOut,
  MapPinned,
  Navigation,
  Pause,
  Phone,
  Play,
  RotateCcw,
  Truck,
  Unlock,
  X,
} from "lucide-react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import type { DriverAccessBundle, DriverAuthUser, DriverTimelineStop, DriverTodayRouteResponse } from "@adam/types";
import { getDriverTodayRoute, startDriverStop, finishDriverStop, reopenDriverStop, logoutDriver } from "@/lib/api";
import type { ThemeName } from "@/lib/theme";
import { ThemeToggle } from "@/components/theme-toggle";

const POLL_INTERVAL_MS = 15_000;
const SELECTED_DATE_STORAGE_KEY = "autisti.selectedDate";

type DriverRoutePanelProps = {
  initialTheme: ThemeName;
  user: DriverAuthUser;
};

type LoadMode = "initial" | "poll";

export function DriverRoutePanel({ initialTheme, user }: DriverRoutePanelProps) {
  const todayYmd = useMemo(() => getLocalYmd(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [data, setData] = useState<DriverTodayRouteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const lastScrollYRef = useRef(0);

  const displayName = useMemo(() => {
    const vanCode = user.vehicle?.code?.trim();
    if (vanCode) {
      return vanCode.toUpperCase();
    }

    const fromSession = [user.name, user.lastname].filter(Boolean).join(" ");
    return fromSession || "Veicolo";
  }, [user.lastname, user.name, user.vehicle?.code]);

  const vehicleLabel = useMemo(() => {
    return (
      user.vehicle?.name?.trim() ||
      data?.driver.vehicle?.name?.trim() ||
      user.vehicle?.pmsCode?.trim() ||
      data?.driver.vehicle?.pmsCode?.trim() ||
      null
    );
  }, [
    data?.driver.vehicle?.name,
    data?.driver.vehicle?.pmsCode,
    user.vehicle?.name,
    user.vehicle?.pmsCode,
  ]);

  const loadRoute = useCallback(
    async (mode: LoadMode, date: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (mode === "initial") {
        setLoading(true);
      }

      try {
        const response = await getDriverTodayRoute(controller.signal, { date });
        setData(response);
        setError(false);
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        setError(true);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    setSelectedDate(readStoredSelectedDate(todayYmd));
  }, [todayYmd]);

  useEffect(() => {
    if (!selectedDate) {
      return;
    }

    writeStoredSelectedDate(selectedDate);
    void loadRoute("initial", selectedDate);

    return () => {
      abortRef.current?.abort();
    };
  }, [loadRoute, selectedDate]);

  useEffect(() => {
    if (!selectedDate) {
      return;
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadRoute("poll", selectedDate);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadRoute, selectedDate]);

  useEffect(() => {
    lastScrollYRef.current = window.scrollY;

    const onScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollYRef.current;

      if (currentY < 24) {
        setNavHidden(false);
      } else if (delta > 6) {
        setNavHidden(true);
      } else if (delta < -6) {
        setNavHidden(false);
      }

      lastScrollYRef.current = currentY;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    try {
      await logoutDriver();
    } catch {
      // still leave the portal
    } finally {
      window.location.assign("/autisti/login");
    }
  }

  const stops = data?.stops ?? [];
  const activeDate = selectedDate ?? todayYmd;
  const isToday = activeDate === todayYmd;
  const routeMapsHref = useMemo(() => buildFullRouteMapsHref(stops), [stops]);

  return (
    <main className="autisti-page-shell min-h-dvh text-autisti-text transition-colors dark:text-autisti-dark-100">
      <div className="mx-auto flex min-h-dvh w-full max-w-[460px] flex-col px-4 pb-28 pt-5 lg:max-w-5xl lg:px-8 lg:pb-10 lg:pt-8">
        <header className="autisti-glass mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.16em] text-autisti-muted dark:text-autisti-dark-300">
              Portale autisti
            </p>
            <h1 className="autisti-title-condensed mt-0.5 text-[1.25rem] leading-tight break-words sm:text-[1.45rem]">
              Ciao {displayName}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="relative hidden lg:block">
              <button
                aria-label={isToday ? "Scegli data" : `Scegli data (attualmente ${activeDate})`}
                className={`relative inline-flex size-11 cursor-pointer items-center justify-center rounded-full border transition ${
                  isToday
                    ? "border-[color:var(--autisti-glass-border)] bg-[var(--autisti-glass-muted)] text-autisti-muted dark:text-autisti-dark-300"
                    : "border-autisti-primary/30 bg-autisti-primary/10 text-autisti-primary dark:border-autisti-dark-300/40 dark:bg-autisti-dark-800 dark:text-autisti-dark-100"
                }`}
                onClick={() => {
                  const input = dateInputRef.current;
                  if (!input) {
                    return;
                  }
                  try {
                    if (typeof input.showPicker === "function") {
                      void input.showPicker();
                      return;
                    }
                  } catch {
                    // Fall through to focus/click for browsers without showPicker.
                  }
                  input.focus();
                  input.click();
                }}
                type="button"
              >
                <CalendarDays aria-hidden className="size-4" />
              </button>
              <input
                ref={dateInputRef}
                aria-hidden
                className="pointer-events-none absolute h-px w-px opacity-0"
                onChange={(event) => {
                  if (event.target.value) {
                    setSelectedDate(event.target.value);
                  }
                }}
                tabIndex={-1}
                type="date"
                value={activeDate}
              />
            </div>
            <ThemeToggle initialTheme={initialTheme} shape="pillow" tone="autisti" />
            <button
              className="autisti-glass-muted inline-flex size-11 items-center justify-center rounded-full border text-autisti-primary transition hover:bg-autisti-surface-muted focus:outline-none focus:ring-4 focus:ring-autisti-primary/15 disabled:opacity-60 dark:text-autisti-dark-100 dark:hover:bg-autisti-dark-800 dark:focus:ring-autisti-dark-300/20"
              disabled={loggingOut}
              onClick={() => void handleLogout()}
              type="button"
              aria-label="Esci"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </header>

        <section className="autisti-glass-strong mb-4 rounded-lg border p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-autisti-muted dark:text-autisti-dark-300">
                {isToday ? "Giro di oggi" : "Giro del giorno"}
              </p>
              <p className="autisti-numeric mt-1 text-3xl font-light leading-none">{stops.length}</p>
              <p className="mt-1 text-sm text-autisti-muted dark:text-autisti-dark-300">
                {stops.length === 1 ? "fermata programmata" : "fermate programmate"}
              </p>
            </div>
            <div className="flex max-w-[55%] items-center gap-2">
              {vehicleLabel ? (
                <p className="min-w-0 text-right text-sm font-medium leading-snug text-autisti-text dark:text-autisti-dark-100">
                  {vehicleLabel}
                </p>
              ) : null}
              <div className="autisti-glass-muted inline-flex size-12 shrink-0 items-center justify-center rounded-full border text-autisti-primary dark:text-autisti-dark-100">
                <Truck className="size-5" />
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="grid gap-3">
            <div className="autisti-glass-muted h-28 animate-pulse rounded-lg border" />
            <div className="autisti-glass-muted h-28 animate-pulse rounded-lg border" />
            <div className="autisti-glass-muted h-28 animate-pulse rounded-lg border" />
          </div>
        ) : error ? (
          <div className="autisti-glass rounded-lg border px-4 py-10 text-center">
            <p className="text-sm text-autisti-muted dark:text-autisti-dark-300">
              Non riesco a caricare il giro. Riprova.
            </p>
            <button
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-autisti-primary bg-autisti-primary px-4 text-sm font-light text-autisti-on-primary dark:border-autisti-dark-300 dark:bg-autisti-dark-300 dark:text-autisti-dark-950"
              onClick={() => void loadRoute("initial", activeDate)}
              type="button"
            >
              <RotateCcw className="size-4" />
              Riprova
            </button>
          </div>
        ) : stops.length === 0 ? (
          <div className="autisti-glass rounded-lg border px-4 py-10 text-center">
            <MapPinned className="mx-auto size-8 text-autisti-primary dark:text-autisti-dark-100" />
            <p className="mt-3 text-sm text-autisti-muted dark:text-autisti-dark-300">
              {user.vehicle
                ? isToday
                  ? "Non è stato assegnato alcun giro a questo furgone per oggi."
                  : "Non è stato assegnato alcun giro a questo furgone per questa data."
                : isToday
                  ? "Nessun giro programmato per oggi."
                  : "Nessun giro programmato per questa data."}
            </p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {stops.map((stop, index) => (
              <StopCard
                key={stop.id}
                index={index}
                onStatusChange={() => {
                  if (activeDate) {
                    void loadRoute("poll", activeDate);
                  }
                }}
                stop={stop}
              />
            ))}
          </ul>
        )}
      </div>

      <nav
        className={`fixed inset-x-0 bottom-0 z-30 px-4 pb-4 transition-transform duration-300 ease-out lg:hidden ${
          navHidden ? "pointer-events-none translate-y-[calc(100%+1rem)]" : "translate-y-0"
        }`}
      >
        <div className="autisti-glass-nav mx-auto flex max-w-[460px] items-center justify-center rounded-lg border px-3 py-2">
          {routeMapsHref ? (
            <a
              aria-label="Apri percorso su Google Maps"
              className="inline-flex size-11 items-center justify-center rounded-full border border-autisti-primary bg-autisti-primary text-autisti-on-primary shadow-[0_10px_24px_rgba(30,74,122,0.28)] dark:border-autisti-dark-300 dark:bg-autisti-dark-300 dark:text-autisti-dark-950"
              href={routeMapsHref}
              rel="noreferrer"
              target="_blank"
            >
              {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Navigation className="size-4" />}
            </a>
          ) : (
            <span
              aria-disabled="true"
              aria-label="Percorso non disponibile"
              className="inline-flex size-11 items-center justify-center rounded-full border border-autisti-primary/40 bg-autisti-primary/40 text-autisti-on-primary opacity-60 dark:border-autisti-dark-300/40 dark:bg-autisti-dark-300/40 dark:text-autisti-dark-950"
              title="Nessuna tappa con indirizzo o coordinate"
            >
              {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Navigation className="size-4" />}
            </span>
          )}
        </div>
      </nav>
    </main>
  );
}

function StopCard({
  stop,
  index,
  onStatusChange,
}: {
  stop: DriverTimelineStop;
  index: number;
  onStatusChange: () => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [accessBundle, setAccessBundle] = useState<DriverAccessBundle | null>(null);
  const mapsHref =
    stop.lat !== null && stop.lng !== null
      ? `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`
      : stop.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address)}`
        : null;

  const hasCheckTimes = Boolean(stop.checkoutTime || stop.checkinTime);
  const isActive = stop.isStarted && !stop.isPaused && !stop.isFinished;
  const hasBadges = Boolean(
    stop.logisticsTaskKind || stop.premium || stop.straordinaria || stop.isPaused || isActive,
  );
  const sofabedDetail = formatSofabedDetail(stop.singleSofabeds, stop.doubleSofabeds);
  const showDetails = !stop.isFinished || expanded;

  async function handleStart() {
    if (starting || stop.isFinished || isActive) {
      return;
    }

    setStarting(true);
    setStartError(false);
    try {
      await startDriverStop(stop.id);
      onStatusChange();
    } catch {
      setStartError(true);
    } finally {
      setStarting(false);
    }
  }

  async function handleFinish() {
    if (finishing || !isActive) {
      return;
    }

    setFinishing(true);
    setFinishError(false);
    try {
      await finishDriverStop(stop.id);
      onStatusChange();
    } catch {
      setFinishError(true);
    } finally {
      setFinishing(false);
    }
  }

  async function handleReopen() {
    if (reopening || !stop.isFinished) {
      return;
    }

    setReopening(true);
    setReopenError(false);
    try {
      await reopenDriverStop(stop.id);
      setExpanded(false);
      setNotesOpen(false);
      onStatusChange();
    } catch {
      setReopenError(true);
    } finally {
      setReopening(false);
    }
  }

  function toggleExpanded() {
    if (!stop.isFinished) {
      return;
    }
    setExpanded((open) => {
      if (open) {
        setNotesOpen(false);
      }
      return !open;
    });
  }

  return (
    <li
      aria-expanded={stop.isFinished ? expanded : undefined}
      className={`autisti-glass rounded-lg border transition ${
        stop.isFinished
          ? `border-slate-300/80 bg-slate-200/70 text-slate-500 dark:border-slate-600/50 dark:bg-slate-800/50 dark:text-slate-400 ${
              expanded ? "p-3" : "cursor-pointer p-2 hover:border-slate-400/80 dark:hover:border-slate-500/60"
            }`
          : "p-3"
      }`}
      onClick={stop.isFinished ? toggleExpanded : undefined}
      onKeyDown={
        stop.isFinished
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleExpanded();
              }
            }
          : undefined
      }
      role={stop.isFinished ? "button" : undefined}
      tabIndex={stop.isFinished ? 0 : undefined}
    >
      <div className="flex items-start gap-3">
        <div
          className={`autisti-numeric flex shrink-0 items-center justify-center rounded-full border font-light ${
            stop.isFinished
              ? "size-8 border-slate-300/80 bg-slate-300/50 text-xs text-slate-500 dark:border-slate-600/50 dark:bg-slate-700/50 dark:text-slate-400"
              : "autisti-glass-muted size-11 text-sm text-autisti-primary dark:text-autisti-dark-100"
          }`}
        >
          {stop.sequence ?? index + 1}
        </div>
        <div className="min-w-0 flex-1">
          {!showDetails ? (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-600 dark:text-slate-300">
                  {stop.customerName ?? "Fermata completata"}
                </p>
                {stop.address ? (
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{stop.address}</p>
                ) : null}
              </div>
              <span className="shrink-0 rounded-full border border-slate-300/80 bg-slate-300/40 px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-slate-500 dark:border-slate-600/50 dark:bg-slate-700/40 dark:text-slate-400">
                Completato
              </span>
              <ChevronDown className="size-4 shrink-0 text-slate-400" />
            </div>
          ) : (
            <>
              {stop.isFinished ? (
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="rounded-full border border-slate-300/80 bg-slate-300/40 px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-slate-500 dark:border-slate-600/50 dark:bg-slate-700/40 dark:text-slate-400">
                    Completato
                  </span>
                  <ChevronDown className="size-4 shrink-0 rotate-180 text-slate-400" />
                </div>
              ) : null}

              {hasBadges ? (
                <div className="flex flex-wrap items-center gap-2">
                  {stop.logisticsTaskKind ? <TaskKindBadge kind={stop.logisticsTaskKind} /> : null}
                  {isActive ? (
                    <span className="rounded-full border border-emerald-300/80 bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200">
                      In corso
                    </span>
                  ) : null}
                  {stop.isPaused ? (
                    <span className="rounded-full border border-amber-300/80 bg-amber-100 px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200">
                      In pausa
                    </span>
                  ) : null}
                  {stop.premium ? (
                    <span
                      aria-label="Premium"
                      className="inline-flex size-6 items-center justify-center rounded-full border border-amber-300/80 bg-amber-100 text-[0.72rem] font-semibold text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200"
                      title="Premium"
                    >
                      P
                    </span>
                  ) : null}
                  {stop.straordinaria ? (
                    <span
                      aria-label="Straordinario"
                      className="inline-flex size-6 items-center justify-center rounded-full border border-red-300/80 bg-red-100 text-[0.72rem] font-semibold text-red-700 dark:border-red-400/40 dark:bg-red-500/20 dark:text-red-200"
                      title="Straordinario"
                    >
                      S
                    </span>
                  ) : null}
                </div>
              ) : null}

              <dl className={`grid gap-1.5 text-sm ${hasBadges || stop.isFinished ? "mt-2" : ""}`}>
                <InfoRow label="Codice ADAM" value={stop.logisticCode !== null ? String(stop.logisticCode) : null} />
                <InfoRow label="Cliente" value={stop.customerName} strong />
                <InfoRow label="Indirizzo" value={stop.address} />
                {hasCheckTimes ? (
                  <div className="grid gap-0.5">
                    <dt className="text-[0.68rem] uppercase tracking-wide text-autisti-muted dark:text-autisti-dark-300">
                      Checkout / Checkin
                    </dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      {stop.checkoutTime ? (
                        <span className="autisti-numeric inline-flex items-center gap-1 font-light text-emerald-600 dark:text-emerald-400">
                          <ArrowUp aria-hidden className="size-3.5 stroke-[2.5]" />
                          <span className="sr-only">Checkout </span>
                          {stop.checkoutTime}
                        </span>
                      ) : null}
                      {stop.checkinTime ? (
                        <span className="autisti-numeric inline-flex items-center gap-1 font-light text-red-600 dark:text-red-400">
                          <ArrowDown aria-hidden className="size-3.5 stroke-[2.5]" />
                          <span className="sr-only">Checkin </span>
                          {stop.checkinTime}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
                {stop.cleanerAlias || (stop.cleanerSequence !== null && stop.cleanerSequence > 0) ? (
                  <>
                    <div className="grid gap-0.5">
                      <dt className="text-[0.68rem] uppercase tracking-wide text-autisti-muted dark:text-autisti-dark-300">
                        Cleaner
                      </dt>
                      <dd className="flex flex-wrap items-center gap-2 text-autisti-text dark:text-autisti-dark-100">
                        {stop.cleanerSequence !== null && stop.cleanerSequence > 0 ? (
                          <span className="autisti-numeric inline-flex min-w-6 items-center justify-center rounded-full border border-autisti-primary/25 bg-autisti-primary/10 px-1.5 py-0.5 text-[0.7rem] font-medium text-autisti-primary dark:border-autisti-dark-300/40 dark:bg-autisti-dark-800 dark:text-autisti-dark-100">
                            {stop.cleanerSequence}
                          </span>
                        ) : null}
                        {stop.cleanerAlias ? <span className="font-medium">{stop.cleanerAlias}</span> : null}
                        {stop.cleanerMobile ? (
                          <a
                            aria-label={`Chiama ${stop.cleanerAlias ?? "cleaner"}`}
                            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/15 text-emerald-700 transition hover:bg-emerald-500/25 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200"
                            href={`tel:${normalizePhoneHref(stop.cleanerMobile)}`}
                            onClick={(event) => event.stopPropagation()}
                            title={`Chiama ${stop.cleanerAlias ?? "cleaner"}`}
                          >
                            <Phone aria-hidden className="size-4" />
                          </a>
                        ) : null}
                      </dd>
                    </div>
                    <InfoRow
                      label="Finestra di lavoro cleaner"
                      numeric
                      value={formatTimeWindow(stop.cleanerStartTime, stop.cleanerEndTime)}
                    />
                  </>
                ) : null}
                <InfoRow label="Divani" value={sofabedDetail} />
              </dl>

              {stop.accessBundles?.length ? (
                <div className="mt-3 grid gap-2" onClick={(event) => event.stopPropagation()}>
                  <p className="text-[0.68rem] uppercase tracking-wide text-autisti-muted dark:text-autisti-dark-300">
                    Accesso
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {stop.accessBundles.map((bundle, bundleIndex) => {
                      const accessType = resolveAccessType(bundle.type);
                      const Icon = accessType.Icon;
                      return (
                        <button
                          key={`${bundle.id ?? "x"}-${bundle.number ?? "n"}-${bundle.label ?? "l"}-${bundleIndex}`}
                          aria-label={`Dettagli accesso ${accessType.label}`}
                          className={`inline-flex size-11 items-center justify-center rounded-full border transition ${accessType.buttonClass}`}
                          onClick={() => setAccessBundle(bundle)}
                          title={accessType.label}
                          type="button"
                        >
                          <Icon aria-hidden className="size-5" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <Dialog
                onClose={() => setAccessBundle(null)}
                open={accessBundle !== null}
              >
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={(event) => event.stopPropagation()}>
                  <DialogPanel className="autisti-glass w-full max-w-md rounded-2xl border p-4 shadow-xl dark:border-autisti-dark-700">
                    {accessBundle ? (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {(() => {
                              const accessType = resolveAccessType(accessBundle.type);
                              const Icon = accessType.Icon;
                              return (
                                <span className={`inline-flex size-11 items-center justify-center rounded-full border ${accessType.buttonClass}`}>
                                  <Icon aria-hidden className="size-5" />
                                </span>
                              );
                            })()}
                            <div>
                              <DialogTitle className="text-base font-medium text-autisti-text dark:text-autisti-dark-100">
                                {resolveAccessType(accessBundle.type).label}
                              </DialogTitle>
                              <p className="text-sm text-autisti-muted dark:text-autisti-dark-300">
                                Dettagli accesso appartamento
                              </p>
                            </div>
                          </div>
                          <button
                            aria-label="Chiudi"
                            className="inline-flex size-9 items-center justify-center rounded-full border border-[color:var(--autisti-glass-border)] text-autisti-muted transition hover:border-autisti-primary/40 dark:text-autisti-dark-300"
                            onClick={() => setAccessBundle(null)}
                            type="button"
                          >
                            <X className="size-4" />
                          </button>
                        </div>

                        <dl className="mt-4 grid gap-3 text-sm">
                          {accessBundle.number ? (
                            <div className="grid gap-0.5">
                              <dt className="text-[0.68rem] uppercase tracking-wide text-autisti-muted dark:text-autisti-dark-300">
                                N. mazzo
                              </dt>
                              <dd className="autisti-numeric font-medium text-autisti-text dark:text-autisti-dark-100">
                                {accessBundle.number}
                              </dd>
                            </div>
                          ) : null}
                          {accessBundle.label ? (
                            <div className="grid gap-0.5">
                              <dt className="text-[0.68rem] uppercase tracking-wide text-autisti-muted dark:text-autisti-dark-300">
                                Codice / etichetta
                              </dt>
                              <dd className="break-words font-medium text-autisti-text dark:text-autisti-dark-100">
                                {accessBundle.label}
                              </dd>
                            </div>
                          ) : null}
                          <div className="grid gap-0.5">
                            <dt className="text-[0.68rem] uppercase tracking-wide text-autisti-muted dark:text-autisti-dark-300">
                              Tipo
                            </dt>
                            <dd className="font-medium text-autisti-text dark:text-autisti-dark-100">
                              {resolveAccessType(accessBundle.type).label}
                            </dd>
                          </div>
                        </dl>

                        {accessBundle.keys.length > 0 ? (
                          <div className="mt-4">
                            <p className="text-[0.68rem] uppercase tracking-wide text-autisti-muted dark:text-autisti-dark-300">
                              Chiavi
                            </p>
                            <ul className="mt-2 grid gap-2">
                              {accessBundle.keys.map((key, keyIndex) => (
                                <li
                                  key={`${key.name}-${keyIndex}`}
                                  className="rounded-lg border border-[color:var(--autisti-glass-border)] bg-[var(--autisti-glass-muted)] px-3 py-2"
                                >
                                  <p className="font-medium text-autisti-text dark:text-autisti-dark-100">{key.name}</p>
                                  {key.type ? (
                                    <p className="mt-0.5 text-xs uppercase tracking-wide text-autisti-muted dark:text-autisti-dark-300">
                                      {key.type}
                                    </p>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </DialogPanel>
                </div>
              </Dialog>

              {stop.customerNote && formatCustomerNote(stop.customerNote) ? (
                <div className="mt-2" onClick={(event) => event.stopPropagation()}>
                  <button
                    aria-expanded={notesOpen}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[color:var(--autisti-glass-border)] bg-[var(--autisti-glass-muted)] px-3 text-sm text-autisti-primary transition hover:border-autisti-primary/50 dark:text-autisti-dark-100 dark:hover:border-autisti-dark-300/50"
                    onClick={() => setNotesOpen((open) => !open)}
                    type="button"
                  >
                    <ChevronDown className={`size-3.5 transition ${notesOpen ? "rotate-180" : ""}`} />
                    {notesOpen ? "Nascondi note" : "Mostra note"}
                  </button>
                  {notesOpen ? (
                    <p className="mt-2 whitespace-pre-wrap rounded-lg border border-[color:var(--autisti-glass-border)] bg-[var(--autisti-glass-muted)] px-3 py-2 text-sm text-autisti-muted dark:text-autisti-dark-300">
                      {formatCustomerNote(stop.customerNote)}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                {stop.cleanerMobile ? (
                  <a
                    className={
                      stop.isFinished
                        ? "inline-flex min-h-10 items-center gap-2 rounded-full border border-emerald-300/70 bg-emerald-100/80 px-3 text-sm text-emerald-800 transition hover:border-emerald-400 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200"
                        : "inline-flex min-h-10 items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-500/25 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200"
                    }
                    href={`tel:${normalizePhoneHref(stop.cleanerMobile)}`}
                  >
                    <Phone className="size-3.5" />
                    Chiama cleaner
                  </a>
                ) : null}
                {mapsHref ? (
                  <a
                    className={
                      stop.isFinished
                        ? "inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-300/70 bg-slate-300/40 px-3 text-sm text-slate-600 transition hover:border-slate-400 dark:border-slate-600/50 dark:bg-slate-700/40 dark:text-slate-300 dark:hover:border-slate-500"
                        : "inline-flex min-h-10 items-center gap-2 rounded-full border border-[color:var(--autisti-glass-border)] bg-[var(--autisti-glass-muted)] px-3 text-sm text-autisti-primary transition hover:border-autisti-primary/50 dark:text-autisti-dark-100 dark:hover:border-autisti-dark-300/50"
                    }
                    href={mapsHref}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ExternalLink className="size-3.5" />
                    Apri maps
                  </a>
                ) : null}
              </div>

              {stop.premium || stop.straordinaria ? (
                <ul className="mt-3 grid gap-1 text-sm">
                  {stop.premium ? (
                    <li className="font-medium text-amber-700 dark:text-amber-300">
                      <span aria-hidden>*</span> Fare refill
                    </li>
                  ) : null}
                  {stop.straordinaria ? (
                    <li className="font-medium text-red-700 dark:text-red-300">
                      <span aria-hidden>*</span> Portare l&apos;attrezzatura
                    </li>
                  ) : null}
                </ul>
              ) : null}

              {!stop.isFinished ? (
                <div className="mt-3 grid gap-2">
                  {!stop.isStarted ? (
                    <button
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-emerald-300/70 bg-emerald-100 px-4 text-sm font-medium uppercase tracking-wide text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-200/80 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200 dark:hover:border-emerald-300/60 dark:hover:bg-emerald-500/30"
                      disabled={starting}
                      onClick={() => void handleStart()}
                      type="button"
                    >
                      {starting ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Play className="size-4 fill-current" />
                      )}
                      {starting ? "Avvio..." : "Avvia"}
                    </button>
                  ) : stop.isPaused ? (
                    <button
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-violet-300/70 bg-violet-100 px-4 text-sm font-medium uppercase tracking-wide text-violet-700 transition hover:border-violet-400 hover:bg-violet-200/80 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-400/40 dark:bg-violet-500/20 dark:text-violet-200 dark:hover:border-violet-300/60 dark:hover:bg-violet-500/30"
                      disabled={starting}
                      onClick={() => void handleStart()}
                      type="button"
                    >
                      {starting ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Pause className="size-4 fill-current" />
                      )}
                      {starting ? "Ripresa..." : "In Pausa"}
                    </button>
                  ) : (
                    <button
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-red-300/70 bg-red-100 px-4 text-sm font-medium uppercase tracking-wide text-red-700 transition hover:border-red-400 hover:bg-red-200/80 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-400/40 dark:bg-red-500/20 dark:text-red-200 dark:hover:border-red-300/60 dark:hover:bg-red-500/30"
                      disabled={finishing}
                      onClick={() => void handleFinish()}
                      type="button"
                    >
                      {finishing ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4 stroke-[2.5]" />
                      )}
                      {finishing ? "Salvataggio..." : "Completa"}
                    </button>
                  )}
                  {startError ? (
                    <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                      {stop.isPaused
                        ? "Non sono riuscito a riprendere la fermata. Riprova."
                        : "Non sono riuscito ad avviare la fermata. Riprova."}
                    </p>
                  ) : null}
                  {finishError ? (
                    <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                      Non sono riuscito a segnare la fermata come completata. Riprova.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 grid gap-2" onClick={(event) => event.stopPropagation()}>
                  <button
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-amber-300/70 bg-amber-100 px-4 text-sm font-medium uppercase tracking-wide text-amber-700 transition hover:border-amber-400 hover:bg-amber-200/80 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200 dark:hover:border-amber-300/60 dark:hover:bg-amber-500/30"
                    disabled={reopening}
                    onClick={() => void handleReopen()}
                    type="button"
                  >
                    {reopening ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Unlock className="size-4" />
                    )}
                    {reopening ? "Ripristino..." : "Riapri"}
                  </button>
                  {reopenError ? (
                    <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                      Non sono riuscito a riaprire la fermata. Riprova.
                    </p>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function InfoRow({
  label,
  value,
  strong = false,
  numeric = false,
}: {
  label: string;
  value: string | null | undefined;
  strong?: boolean;
  numeric?: boolean;
}) {
  if (!value) {
    return null;
  }

  return (
    <div className="grid gap-0.5">
      <dt className="text-[0.68rem] uppercase tracking-wide text-autisti-muted dark:text-autisti-dark-300">
        {label}
      </dt>
      <dd
        className={[
          strong ? "font-medium text-autisti-text dark:text-autisti-dark-100" : "text-autisti-text dark:text-autisti-dark-100",
          numeric ? "autisti-numeric font-light" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function TaskKindBadge({ kind }: { kind: string }) {
  const normalized = kind
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/\//g, "/");
  const compact = normalized.replace(/\//g, "");
  const isDeliveryPickupShortcut =
    compact === "3" ||
    compact === "d&p" ||
    compact === "dp" ||
    compact === "d+p" ||
    normalized === "d&p";
  const label = formatTaskKind(kind);

  const isDelivery = compact === "1" || compact === "delivery" || compact === "consegna" || compact === "d";
  const isPickup = compact === "2" || compact === "pickup" || compact === "ritiro" || compact === "p";
  const isBoth =
    isDeliveryPickupShortcut ||
    (compact.includes("delivery") && compact.includes("pickup")) ||
    (compact.includes("consegna") && compact.includes("ritiro")) ||
    normalized === "delivery/pickup" ||
    normalized === "pickup/delivery";

  if (isBoth) {
    const parts = label.split(/\s*\/\s*/);
    const deliveryFirst =
      isDeliveryPickupShortcut ||
      compact.indexOf("delivery") <= compact.indexOf("pickup") ||
      compact.indexOf("consegna") <= compact.indexOf("ritiro");

    const first = {
      text: parts[0]?.trim() || "Delivery",
      className: deliveryFirst
        ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200"
        : "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
    };
    const second = {
      text: parts[1]?.trim() || "Pickup",
      className: deliveryFirst
        ? "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200"
        : "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
    };

    return (
      <span className="inline-flex overflow-hidden rounded-full border border-violet-300/50 text-[0.68rem] uppercase tracking-wide dark:border-sky-400/30">
        <span className={`px-2 py-0.5 ${first.className}`}>{first.text}</span>
        <span className={`px-2 py-0.5 ${second.className}`}>{second.text}</span>
      </span>
    );
  }

  if (isDelivery) {
    return (
      <span className="rounded-full border border-violet-300/70 bg-violet-100 px-2 py-0.5 text-[0.68rem] uppercase tracking-wide text-violet-700 dark:border-violet-400/40 dark:bg-violet-500/20 dark:text-violet-200">
        {label === "D" ? "Delivery" : label}
      </span>
    );
  }

  if (isPickup) {
    return (
      <span className="rounded-full border border-sky-300/70 bg-sky-100 px-2 py-0.5 text-[0.68rem] uppercase tracking-wide text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/20 dark:text-sky-200">
        {label === "P" ? "Pickup" : label}
      </span>
    );
  }

  return <Badge label={label} />;
}

function Badge({ label, muted = false }: { label: string; muted?: boolean }) {
  return (
    <span
      className={
        muted
          ? "rounded-full border border-[color:var(--autisti-glass-border)] bg-[var(--autisti-glass-muted)] px-2 py-0.5 text-[0.68rem] uppercase tracking-wide text-autisti-muted dark:text-autisti-dark-300"
          : "rounded-full border border-autisti-primary/20 bg-autisti-primary/10 px-2 py-0.5 text-[0.68rem] uppercase tracking-wide text-autisti-primary dark:border-autisti-dark-300/30 dark:bg-autisti-dark-800 dark:text-autisti-dark-100"
      }
    >
      {label}
    </span>
  );
}

function getLocalYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function readStoredSelectedDate(fallback: string): string {
  try {
    const stored = window.localStorage.getItem(SELECTED_DATE_STORAGE_KEY)?.trim() ?? "";
    if (stored && isValidYmd(stored)) {
      return stored;
    }
  } catch {
    // ignore storage failures
  }
  return fallback;
}

function writeStoredSelectedDate(value: string): void {
  try {
    window.localStorage.setItem(SELECTED_DATE_STORAGE_KEY, value);
  } catch {
    // ignore storage failures
  }
}

function formatCustomerNote(note: string): string {
  return note
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*br\s*>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Google Maps allows origin + destination + up to 9 waypoints via the maps URL. */
const GOOGLE_MAPS_MAX_WAYPOINTS = 9;

function buildFullRouteMapsHref(stops: DriverTimelineStop[]): string | null {
  const points = stops
    .map((stop) => {
      if (stop.lat !== null && stop.lng !== null && Number.isFinite(stop.lat) && Number.isFinite(stop.lng)) {
        return `${stop.lat},${stop.lng}`;
      }

      const address = stop.address?.trim();
      return address ? address : null;
    })
    .filter((point): point is string => Boolean(point));

  if (points.length === 0) {
    return null;
  }

  const destination = points[points.length - 1];
  const intermediate = points.slice(0, -1).slice(0, GOOGLE_MAPS_MAX_WAYPOINTS);
  const params = new URLSearchParams({
    api: "1",
    destination,
    travelmode: "driving",
  });

  if (intermediate.length > 0) {
    params.set("waypoints", intermediate.join("|"));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function resolveAccessType(type: string | null | undefined): {
  label: string;
  Icon: typeof KeyRound;
  buttonClass: string;
} {
  const normalized = (type ?? "").trim().toLowerCase();

  if (normalized.includes("smart")) {
    return {
      label: "Smart",
      Icon: Keyboard,
      buttonClass:
        "border-red-300/70 bg-red-100 text-red-700 hover:border-red-400 dark:border-red-400/40 dark:bg-red-500/20 dark:text-red-200",
    };
  }

  if (normalized.includes("kbox") || normalized.includes("k-box") || normalized.includes("keybox")) {
    return {
      label: "KBox",
      Icon: Lock,
      buttonClass:
        "border-yellow-300/80 bg-yellow-100 text-yellow-700 hover:border-yellow-400 dark:border-yellow-400/40 dark:bg-yellow-500/20 dark:text-yellow-200",
    };
  }

  return {
    label: "Classico",
    Icon: KeyRound,
    buttonClass:
      "border-slate-300/80 bg-slate-200 text-slate-600 hover:border-slate-400 dark:border-slate-500/50 dark:bg-slate-700/50 dark:text-slate-200",
  };
}

function formatSofabedDetail(
  singleSofabeds: number | null | undefined,
  doubleSofabeds: number | null | undefined,
): string | null {
  const parts: string[] = [];
  if (typeof singleSofabeds === "number" && singleSofabeds > 0) {
    parts.push(
      singleSofabeds === 1
        ? "1 divano letto singolo"
        : `${singleSofabeds} divani letto singoli`,
    );
  }
  if (typeof doubleSofabeds === "number" && doubleSofabeds > 0) {
    parts.push(
      doubleSofabeds === 1
        ? "1 divano letto matrimoniale"
        : `${doubleSofabeds} divani letto matrimoniali`,
    );
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.join(" • ");
}

function normalizePhoneHref(mobile: string): string {
  const trimmed = mobile.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits;
}

function formatTimeWindow(start: string | null | undefined, end: string | null | undefined): string | null {
  if (start && end) {
    return `${start} – ${end}`;
  }
  if (start) {
    return `da ${start}`;
  }
  if (end) {
    return `fino a ${end}`;
  }
  return null;
}

function formatTaskKind(value: string): string {
  const compact = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/\//g, "");

  if (compact === "3" || compact === "d&p" || compact === "dp" || compact === "d+p") {
    return "Delivery / Pickup";
  }
  if (compact === "1" || compact === "d" || compact === "delivery" || compact === "consegna") {
    return "Delivery";
  }
  if (compact === "2" || compact === "p" || compact === "pickup" || compact === "ritiro") {
    return "Pickup";
  }

  return value.replaceAll("/", " / ");
}
