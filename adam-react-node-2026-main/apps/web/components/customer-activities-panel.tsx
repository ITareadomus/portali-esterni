"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Dialog, DialogPanel, DialogTitle, Menu, MenuButton, MenuItem, MenuItems, Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bell,
  BrushCleaning,
  Bubbles,
  CalendarDays,
  CalendarClock,
  ChartColumnBig,
  ChevronRight,
  CircleCheck,
  Grip,
  House,
  LoaderCircle,
  LogOut,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import type {
  CustomerAuthUser,
  CustomerCalendarActivitiesResponse,
  CustomerTodayActivity,
  CustomerTodayActivitiesResponse,
} from "@adam/types";
import { getCustomerCalendarActivities, getCustomerTodayActivities, logoutCustomer } from "@/lib/api";
import type { ThemeName } from "@/lib/theme";
import { ThemeToggle } from "@/components/theme-toggle";

const POLL_INTERVAL_MS = 15_000;
const COUNTER_ANIMATION_DELAY_MS = 1320;
const COUNTER_ANIMATION_DURATION_MS = 700;
const PROGRESS_ANIMATION_DELAY_MS = 1450;
const PROGRESS_ANIMATION_DURATION_MS = 520;
const ACTIVITY_ANIMATION_START_MS = 2050;
const ACTIVITY_ANIMATION_STAGGER_MS = 110;
const ACTIVITY_ANIMATION_DURATION_MS = 350;
const CALENDAR_MONTHS_BACK = 3;
const CALENDAR_MONTHS_FORWARD = 2;
const DAILY_SPLASH_STORAGE_KEY = "adam:clienti:lastSplashDate";
const DAILY_SPLASH_VISIBLE_MS = 4200;
const DAILY_SPLASH_EXIT_MS = 620;
const DAILY_SPLASH_REDUCED_VISIBLE_MS = 1200;
const DAILY_SPLASH_REDUCED_EXIT_MS = 120;
const DESKTOP_TODAY_SORT_STORAGE_KEY = "adam:clienti:desktopTodaySort";
const DESKTOP_ACTIVITY_GRID_CLASS = "grid grid-cols-[2.75rem_minmax(0,1.58fr)_minmax(8rem,.46fr)_minmax(8rem,.46fr)_minmax(7rem,.36fr)_minmax(7rem,.34fr)] gap-4";

type CustomerActivitiesPanelProps = {
  activeService: CustomerPortalService;
  initialTheme: ThemeName;
  user: CustomerAuthUser;
};

type LoadMode = "initial" | "poll";
type StatusGroup = "assigned" | "progress" | "completed";
type DesktopTodayFilterKey = "all" | StatusGroup;
type SortDirection = "ascending" | "descending";
type DesktopTodaySortKey = "activity" | "checkout" | "checkin" | "guests" | "status";
type DesktopTodaySortSetting = {
  direction: SortDirection;
  key: DesktopTodaySortKey;
};
type DesktopSortValue = {
  missing: boolean;
  value: number | string;
};
export type CustomerPortalService = "today" | "calendar" | "report";
type DailySplashState = "checking" | "hidden" | "visible" | "closing";

type ActivitySummary = {
  assigned: number;
  inProgress: number;
  completed: number;
};

type CalendarDay = {
  activities: CustomerTodayActivity[];
  currentMonth: boolean;
  dayNumber: number;
  summary: ActivitySummary;
  ymd: string;
};

const CUSTOMER_PORTAL_SERVICES: CustomerPortalService[] = ["today", "calendar", "report"];
const DESKTOP_TODAY_FILTERS: Array<{ key: DesktopTodayFilterKey; label: string }> = [
  { key: "all", label: "Tutte" },
  { key: "assigned", label: "Assegnate" },
  { key: "progress", label: "In corso" },
  { key: "completed", label: "Completate" },
];
const DESKTOP_TODAY_SORT_COLUMNS: Array<{ key: DesktopTodaySortKey; label: string }> = [
  { key: "activity", label: "Attivita" },
  { key: "checkout", label: "Check-out" },
  { key: "checkin", label: "Check-in" },
  { key: "guests", label: "Ospiti" },
  { key: "status", label: "Stato" },
];
const DESKTOP_SORT_COLLATOR = new Intl.Collator("it", { numeric: true, sensitivity: "base" });

export function CustomerActivitiesPanel({ activeService, initialTheme, user }: CustomerActivitiesPanelProps) {
  const [data, setData] = useState<CustomerTodayActivitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [headerStuck, setHeaderStuck] = useState(false);
  const [dailySplashState, setDailySplashState] = useState<DailySplashState>("checking");
  const [calendarData, setCalendarData] = useState<CustomerCalendarActivitiesResponse | null>(null);
  const [calendarError, setCalendarError] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => getMonthKeyFromYmd(getLocalYmd(new Date())));
  const [calendarDayDialogOpen, setCalendarDayDialogOpen] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const calendarAbortRef = useRef<AbortController | null>(null);
  const dailySplashTimeoutsRef = useRef<{ closing: number; hidden: number } | null>(null);

  const loadActivities = useCallback(async (mode: LoadMode) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (mode === "initial") setLoading(true);

    try {
      const response = await getCustomerTodayActivities(controller.signal, {
        includeNoShow: false,
        languageId: 1,
        orderBy: "todayStatusNameFrontend",
        orderDirection: "asc",
      });
      setData(response);
      setUpdatedAt(new Date());
      setError(false);
    } catch {
      if (controller.signal.aborted) return;
      setError(true);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  const calendarRange = useMemo(() => getCalendarMonthRange(calendarMonth), [calendarMonth]);
  const calendarBounds = useMemo(() => getCalendarMonthBounds(), []);

  const loadCalendarActivities = useCallback(async (mode: LoadMode) => {
    calendarAbortRef.current?.abort();
    const controller = new AbortController();
    calendarAbortRef.current = controller;

    if (mode === "initial") {
      setCalendarData(null);
      setCalendarLoading(true);
    }

    try {
      const response = await getCustomerCalendarActivities(controller.signal, {
        endDate: calendarRange.endDate,
        includeNoShow: false,
        languageId: 1,
        orderBy: "checkout",
        orderDirection: "asc",
        startDate: calendarRange.startDate,
      });
      setCalendarData(response);
      setUpdatedAt(new Date());
      setCalendarError(false);
    } catch {
      if (controller.signal.aborted) return;
      setCalendarError(true);
    } finally {
      if (!controller.signal.aborted) {
        setCalendarLoading(false);
      }
    }
  }, [calendarRange.endDate, calendarRange.startDate]);

  useEffect(() => {
    void loadActivities("initial");

    return () => {
      abortRef.current?.abort();
      calendarAbortRef.current?.abort();
    };
  }, [loadActivities]);

  useEffect(() => {
    if (!canShowDailySplash()) {
      setDailySplashState("hidden");
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const visibleMs = reducedMotion ? DAILY_SPLASH_REDUCED_VISIBLE_MS : DAILY_SPLASH_VISIBLE_MS;
    const exitMs = reducedMotion ? DAILY_SPLASH_REDUCED_EXIT_MS : DAILY_SPLASH_EXIT_MS;

    setDailySplashState("visible");

    const closing = window.setTimeout(() => {
      setDailySplashState("closing");
    }, visibleMs);

    const hidden = window.setTimeout(() => {
      dailySplashTimeoutsRef.current = null;
      markDailySplashSeen();
      setDailySplashState("hidden");
    }, visibleMs + exitMs);

    dailySplashTimeoutsRef.current = { closing, hidden };

    return () => {
      window.clearTimeout(closing);
      window.clearTimeout(hidden);
      dailySplashTimeoutsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (activeService === "calendar") {
      void loadCalendarActivities("initial");
    }
  }, [activeService, loadCalendarActivities]);

  useEffect(() => {
    if (selectedCalendarDate && isYmdInRange(selectedCalendarDate, calendarRange.startDate, calendarRange.endDate)) {
      return;
    }

    setSelectedCalendarDate(getPreferredCalendarDate(calendarRange, data?.date.ymd));
  }, [calendarRange, data?.date.ymd, selectedCalendarDate]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        if (activeService === "calendar") {
          void loadCalendarActivities("poll");
          return;
        }

        void loadActivities("poll");
      }
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        if (activeService === "calendar") {
          void loadCalendarActivities("poll");
          return;
        }

        void loadActivities("poll");
      }
    }, POLL_INTERVAL_MS);

    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [activeService, loadActivities, loadCalendarActivities]);

  const activities = useMemo(() => {
    return (data?.activities ?? []).filter(isVisibleActivity);
  }, [data]);
  const calendarActivities = useMemo(() => {
    return (calendarData?.activities ?? []).filter(isVisibleActivity);
  }, [calendarData]);
  const calendarDays = useMemo(() => {
    return buildCalendarDays(calendarMonth, calendarActivities);
  }, [calendarActivities, calendarMonth]);
  const selectedCalendarActivities = useMemo(() => {
    return calendarActivities.filter((activity) => activity.checkout === selectedCalendarDate);
  }, [calendarActivities, selectedCalendarDate]);
  const canMoveCalendarBackward = compareMonthKeys(calendarMonth, calendarBounds.minMonth) > 0;
  const canMoveCalendarForward = compareMonthKeys(calendarMonth, calendarBounds.maxMonth) < 0;

  useEffect(() => {
    if (loading || introDone || dailySplashState !== "hidden") {
      return;
    }

    const lastActivityIndex = Math.max(activities.length - 1, 0);
    const introAnimationMs = ACTIVITY_ANIMATION_START_MS + lastActivityIndex * ACTIVITY_ANIMATION_STAGGER_MS + ACTIVITY_ANIMATION_DURATION_MS;
    const timeout = window.setTimeout(() => {
      setIntroDone(true);
    }, introAnimationMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activities.length, dailySplashState, introDone, loading]);

  useEffect(() => {
    const updateHeaderStuck = () => {
      setHeaderStuck(window.scrollY > 24);
    };

    updateHeaderStuck();
    window.addEventListener("scroll", updateHeaderStuck, { passive: true });

    return () => {
      window.removeEventListener("scroll", updateHeaderStuck);
    };
  }, []);

  const handleDailySplashClose = useCallback(() => {
    if (dailySplashTimeoutsRef.current) {
      window.clearTimeout(dailySplashTimeoutsRef.current.closing);
      window.clearTimeout(dailySplashTimeoutsRef.current.hidden);
      dailySplashTimeoutsRef.current = null;
    }

    markDailySplashSeen();
    setDailySplashState("hidden");
  }, []);

  const handleCalendarMonthChange = useCallback((direction: -1 | 1) => {
    setCalendarMonth((currentMonth) => {
      const nextMonth = addMonthsToMonthKey(currentMonth, direction);
      if (!isMonthKeyInRange(nextMonth, calendarBounds.minMonth, calendarBounds.maxMonth)) {
        return currentMonth;
      }

      const nextRange = getCalendarMonthRange(nextMonth);
      setSelectedCalendarDate(getPreferredCalendarDate(nextRange, data?.date.ymd));
      setCalendarDayDialogOpen(false);
      return nextMonth;
    });
    window.scrollTo({ top: 0 });
  }, [calendarBounds.maxMonth, calendarBounds.minMonth, data?.date.ymd]);

  const handleCalendarDateSelect = useCallback((ymd: string) => {
    setSelectedCalendarDate(ymd);
    setCalendarDayDialogOpen(true);
  }, []);

  const handleDesktopCalendarDateSelect = useCallback((ymd: string) => {
    setSelectedCalendarDate(ymd);
  }, []);

  const summary = useMemo(() => buildSummary(activities), [activities]);
  const completionPercent = activities.length > 0 ? Math.round((summary.completed / activities.length) * 100) : 0;
  const customerDisplayName = user.nameFrontend?.trim() || user.email;
  const dateLabel = data ? formatYmdIt(data.date.ymd) : "";
  const navTitle = getCustomerNavTitle(activeService);
  const splashActive = dailySplashState !== "hidden";
  const updatedLabel = useMemo(() => {
    if (!updatedAt) return "";
    return updatedAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  }, [updatedAt]);

  return (
    <main
      className={`clienti-page-shell relative isolate min-h-dvh text-clienti-text transition-colors dark:text-clienti-dark-100${introDone ? " clienti-anim-done" : ""}${splashActive ? " clienti-splash-active" : ""}`}
    >
      <CustomerDesktopExperience
        activeService={activeService}
        activities={activities}
        calendarDays={calendarDays}
        canMoveCalendarBackward={canMoveCalendarBackward}
        canMoveCalendarForward={canMoveCalendarForward}
        calendarError={calendarError}
        calendarLoading={calendarLoading && calendarActivities.length === 0}
        calendarMonth={calendarMonth}
        completionPercent={completionPercent}
        customerName={customerDisplayName}
        dateLabel={dateLabel}
        headerStuck={headerStuck}
        initialTheme={initialTheme}
        onCalendarMonthChange={handleCalendarMonthChange}
        onCalendarSelectDate={handleDesktopCalendarDateSelect}
        selectedCalendarActivities={selectedCalendarActivities}
        selectedCalendarDate={selectedCalendarDate}
        summary={summary}
        todayError={error}
        todayLoading={loading && activities.length === 0}
        updatedLabel={updatedLabel}
      />

      <div className="lg:hidden">
      <div className="mx-auto grid w-full max-w-[460px] gap-5 px-4 pb-32 pt-4 sm:px-5">
        <CustomerDesktopSidebar
          activeService={activeService}
          customerName={customerDisplayName}
          initialTheme={initialTheme}
        />

        <div className="grid min-w-0 gap-5 lg:gap-6">
          <CustomerMobileHeader headerStuck={headerStuck} navTitle={navTitle} />
          <CustomerDesktopTopbar activeService={activeService} dateLabel={dateLabel} />

          {error ? (
            <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-100">
              <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
              <span>Impossibile aggiornare le attività.</span>
            </div>
          ) : null}

          {activeService === "today" ? (
            <div className="clienti-today-card grid gap-5">
            <DailyBrief
              completionPercent={completionPercent}
              dateLabel={dateLabel}
              loading={loading && activities.length === 0}
            />

            <section className="grid gap-3" aria-label="Elenco attività di oggi">
              {loading && activities.length === 0 ? (
                <ActivitySkeleton />
              ) : activities.length > 0 ? (
                <ul className="grid gap-3 lg:grid-cols-2">
                  {activities.map((activity, index) => (
                    <ActivityItem activity={activity} index={index} key={activity.id} />
                  ))}
                </ul>
              ) : (
                <div className="clienti-glass rounded-lg border px-4 py-10 text-center">
                  <p className="text-base font-light text-clienti-text dark:text-clienti-dark-100">Nessuna attività per oggi</p>
                  <p className="mt-1 text-sm text-clienti-muted dark:text-clienti-dark-300/80">{dateLabel}</p>
                </div>
              )}
              </section>
            </div>
          ) : null}

          {activeService === "report" ? (
            <CustomerTodayReport
              completionPercent={completionPercent}
              summary={summary}
              totalAssigned={activities.length}
            />
          ) : null}

          {activeService === "calendar" ? (
            <CustomerCalendarView
              canMoveBackward={canMoveCalendarBackward}
              canMoveForward={canMoveCalendarForward}
              calendarDays={calendarDays}
              dayDialogOpen={calendarDayDialogOpen}
              error={calendarError}
              loading={calendarLoading && calendarActivities.length === 0}
              monthKey={calendarMonth}
              onCloseDayDialog={() => setCalendarDayDialogOpen(false)}
              onMonthChange={handleCalendarMonthChange}
              onSelectDate={handleCalendarDateSelect}
              selectedActivities={selectedCalendarActivities}
              selectedDate={selectedCalendarDate}
            />
          ) : null}
        </div>
      </div>

      {dailySplashState === "visible" || dailySplashState === "closing" ? (
        <CinematicDailySplash customerName={customerDisplayName} onClose={handleDailySplashClose} state={dailySplashState} />
      ) : null}

      <CustomerBottomNav
        activeService={activeService}
        dateLabel={dateLabel}
        initialTheme={initialTheme}
      />
      </div>
    </main>
  );
}

function CustomerMobileHeader({ headerStuck, navTitle }: { headerStuck: boolean; navTitle: string | null }) {
  return (
    <header
      className={[
        "clienti-hello-card sticky top-0 z-30 -mx-4 -mt-4 flex w-[calc(100%+2rem)] items-center justify-between gap-4 border-b px-4 pb-[7px] pt-4 backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-200 sm:-mx-5 sm:w-[calc(100%+2.5rem)] sm:px-5 lg:hidden",
        headerStuck
          ? "border-[color:var(--clienti-glass-border)] bg-[var(--clienti-glass-muted)] shadow-[var(--clienti-shadow-card)]"
          : "border-transparent bg-transparent shadow-none",
      ].join(" ")}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="clienti-hello-badge clienti-glass inline-flex size-14 shrink-0 items-center justify-center rounded-full border">
          <img className="size-12 object-contain dark:hidden" src="/img/ad-premium.png" alt="AD Premium" />
          <img className="hidden size-12 object-contain dark:block" src="/img/ad-premium-inv.png" alt="AD Premium" />
        </div>

        <div className="grid min-w-0 gap-1">
          <p className="clienti-hello-greeting block text-[0.68rem] font-light uppercase leading-none tracking-[0.14em] text-clienti-muted dark:text-clienti-dark-300/80">
            Assistente ADAM
          </p>
          {navTitle ? (
            <h1 className="clienti-hello-name font-display truncate text-[1.55rem] font-light leading-none tracking-normal text-clienti-text dark:text-clienti-dark-100">
              {navTitle}
            </h1>
          ) : null}
        </div>
      </div>

      <div
        aria-hidden="true"
        className="clienti-glass inline-flex size-14 shrink-0 items-center justify-center rounded-full border text-clienti-primary dark:text-clienti-dark-100"
      >
        <Bell className="size-6 stroke-[1.45]" aria-hidden="true" />
      </div>
    </header>
  );
}

function CustomerDesktopExperience({
  activeService,
  activities,
  calendarDays,
  canMoveCalendarBackward,
  canMoveCalendarForward,
  calendarError,
  calendarLoading,
  calendarMonth,
  completionPercent,
  customerName,
  dateLabel,
  headerStuck,
  initialTheme,
  onCalendarMonthChange,
  onCalendarSelectDate,
  selectedCalendarActivities,
  selectedCalendarDate,
  summary,
  todayError,
  todayLoading,
  updatedLabel,
}: {
  activeService: CustomerPortalService;
  activities: CustomerTodayActivity[];
  calendarDays: CalendarDay[];
  canMoveCalendarBackward: boolean;
  canMoveCalendarForward: boolean;
  calendarError: boolean;
  calendarLoading: boolean;
  calendarMonth: string;
  completionPercent: number;
  customerName: string;
  dateLabel: string;
  headerStuck: boolean;
  initialTheme: ThemeName;
  onCalendarMonthChange: (direction: -1 | 1) => void;
  onCalendarSelectDate: (ymd: string) => void;
  selectedCalendarActivities: CustomerTodayActivity[];
  selectedCalendarDate: string;
  summary: ActivitySummary;
  todayError: boolean;
  todayLoading: boolean;
  updatedLabel: string;
}) {
  return (
    <section className="hidden min-h-dvh bg-clienti-surface text-clienti-text dark:bg-clienti-dark-950 dark:text-clienti-dark-100 lg:block">
      <CustomerDesktopFixedSidebar activeService={activeService} customerName={customerName} summary={summary} />
      <CustomerDesktopFixedTopbar
        customerName={customerName}
        headerStuck={headerStuck}
        initialTheme={initialTheme}
        pageTitle={getCustomerPortalServiceLabel(activeService)}
        showTitleIcon={activeService === "today"}
      />

      <main className="min-h-dvh pl-[266px] pt-20">
        <div className="w-full px-6 pb-6 pt-4">
          {todayError ? <DesktopErrorMessage message="Impossibile aggiornare le attivita." /> : null}

          {activeService === "today" ? (
            <CustomerDesktopToday
              activities={activities}
              completionPercent={completionPercent}
              dateLabel={dateLabel}
              loading={todayLoading}
              updatedLabel={updatedLabel}
            />
          ) : null}

          {activeService === "calendar" ? (
            <CustomerDesktopCalendar
              calendarDays={calendarDays}
              canMoveBackward={canMoveCalendarBackward}
              canMoveForward={canMoveCalendarForward}
              error={calendarError}
              loading={calendarLoading}
              monthKey={calendarMonth}
              onMonthChange={onCalendarMonthChange}
              onSelectDate={onCalendarSelectDate}
              selectedActivities={selectedCalendarActivities}
              selectedDate={selectedCalendarDate}
            />
          ) : null}

          {activeService === "report" ? (
            <CustomerDesktopReport
              activities={activities}
              completionPercent={completionPercent}
              dateLabel={dateLabel}
              loading={todayLoading}
              summary={summary}
            />
          ) : null}
        </div>
      </main>
    </section>
  );
}

function CustomerDesktopFixedSidebar({ activeService, customerName, summary }: { activeService: CustomerPortalService; customerName: string; summary: ActivitySummary }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-[266px] flex-col bg-[linear-gradient(180deg,#062c2b_0%,#052524_100%)] px-4 py-5 text-clienti-dark-100 shadow-[18px_0_46px_rgba(5,31,32,0.18)]">
      <div className="flex min-h-12 items-center gap-3 px-1">
        <span className="inline-flex size-11 shrink-0 items-center justify-center">
          <img className="size-10 object-contain" src="/img/ad-premium-inv.png" alt="AD Premium" />
        </span>
        <div className="min-w-0">
          <p className="wrap-anywhere text-sm/5 font-light text-white">Assistente ADAM</p>
        </div>
      </div>

      <nav className="mt-9 grid gap-2" aria-label="Servizi clienti">
        {CUSTOMER_PORTAL_SERVICES.map((service) => (
          <CustomerDesktopServiceLink active={activeService === service} key={service} service={service} summary={service === "today" ? summary : undefined} />
        ))}
      </nav>

      <div className="mt-auto px-1">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-clienti-dark-100/14 text-xs font-light text-white">
            {getCustomerInitials(customerName)}
          </span>
          <div className="min-w-0">
            <p className="wrap-anywhere text-sm/5 font-light text-white">{customerName}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function CustomerDesktopServiceLink({ active, service, summary }: { active: boolean; service: CustomerPortalService; summary?: ActivitySummary }) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={[
        "grid min-h-11 grid-cols-[1.8rem_minmax(0,1fr)_auto] items-center gap-3 rounded-full px-3 text-sm/5 font-light transition focus:outline-none focus:ring-4 focus:ring-clienti-dark-300/20",
        active
          ? "bg-white/[0.105] text-white"
          : "text-clienti-dark-300 hover:bg-white/[0.055] hover:text-white",
      ].join(" ")}
      href={getCustomerPortalServiceHref(service)}
    >
      <span
        className={[
          "inline-flex size-7 items-center justify-center rounded-full transition",
          active ? "bg-clienti-dark-100 text-clienti-dark-950" : "bg-white/[0.06] text-clienti-dark-300",
        ].join(" ")}
      >
        <CustomerPortalServiceIcon className="size-4 stroke-[1.65]" service={service} />
      </span>
      <span className="min-w-0 wrap-anywhere">{getCustomerPortalServiceLabel(service)}</span>
      {summary ? (
        <span
          aria-label={`${summary.completed} completate su ${summary.assigned} totali`}
          className={[
            "clienti-numeric inline-flex min-w-12 items-center justify-center rounded-full px-2.5 py-1 text-xs/4 font-light transition",
            active ? "bg-white/[0.16] text-white" : "bg-white/[0.07] text-clienti-dark-300",
          ].join(" ")}
        >
          {summary.completed}/{summary.assigned}
        </span>
      ) : null}
    </Link>
  );
}

function CustomerDesktopFixedTopbar({
  customerName,
  headerStuck,
  initialTheme,
  pageTitle,
  showTitleIcon = false,
}: {
  customerName: string;
  headerStuck: boolean;
  initialTheme: ThemeName;
  pageTitle: string;
  showTitleIcon?: boolean;
}) {
  const [logoutPending, setLogoutPending] = useState(false);

  async function handleLogout() {
    if (logoutPending) return;
    setLogoutPending(true);

    try {
      await logoutCustomer();
      window.location.assign("/clienti/login");
    } finally {
      setLogoutPending(false);
    }
  }

  return (
    <header
      className={[
        "fixed left-[266px] right-0 top-0 z-30 flex h-20 items-center justify-between gap-4 border-b px-8 backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-200",
        headerStuck
          ? "border-[color:var(--clienti-glass-border)] bg-[var(--clienti-glass-muted)] shadow-[var(--clienti-shadow-card)]"
          : "border-transparent bg-transparent shadow-none",
      ].join(" ")}
    >
      <h1 className="font-display flex min-w-0 items-start gap-2 pb-1 text-[1.55rem]/[2rem] font-light tracking-normal text-clienti-text dark:text-clienti-dark-100">
        {showTitleIcon ? (
          <Sparkles className="mt-1 size-5 shrink-0 stroke-[1.35] text-clienti-primary dark:text-clienti-dark-300" aria-hidden="true" />
        ) : null}
        <span className="min-w-0 text-wrap">{pageTitle}</span>
      </h1>

      <div className="flex shrink-0 items-center gap-3">
        <ThemeToggle initialTheme={initialTheme} shape="pillow" />
        <Menu as="div" className="relative">
          <MenuButton className="clienti-glass-muted inline-flex h-10 items-center gap-2 rounded-full border px-2.5 text-clienti-primary transition hover:border-clienti-primary/50 focus:outline-none focus:ring-4 focus:ring-clienti-primary/15 data-active:border-clienti-primary/50 dark:text-clienti-dark-100 dark:hover:border-clienti-dark-300/50 dark:focus:ring-clienti-dark-300/20">
            <span className="sr-only">Menu account cliente</span>
            <span aria-hidden="true" className="inline-flex size-7 items-center justify-center rounded-full bg-clienti-primary text-[0.68rem] font-light text-clienti-on-primary shadow-sm dark:bg-clienti-dark-300 dark:text-clienti-dark-950">
              {getCustomerInitials(customerName)}
            </span>
            <ChevronRight className="size-4 rotate-90 text-clienti-muted dark:text-clienti-dark-300" aria-hidden="true" />
          </MenuButton>
          <MenuItems
            anchor="bottom end"
            className="z-50 mt-3 w-64 rounded-lg border border-[#d4ded7] bg-white p-2 shadow-[0_20px_48px_rgba(5,31,32,0.16)] focus:outline-none [--anchor-gap:0.75rem] dark:border-clienti-dark-300/15 dark:bg-clienti-dark-900"
          >
            <div className="px-3 py-2">
              <p className="wrap-anywhere text-sm/5 font-light text-clienti-text dark:text-clienti-dark-100">{customerName}</p>
            </div>
            <MenuItem disabled={logoutPending}>
              <button
                className="mt-1 flex min-h-10 w-full items-center justify-between rounded-full px-3 text-left text-sm/5 font-light text-clienti-primary transition data-focus:bg-clienti-surface-muted disabled:cursor-not-allowed disabled:opacity-60 dark:text-clienti-dark-100 dark:data-focus:bg-clienti-dark-800"
                disabled={logoutPending}
                onClick={() => void handleLogout()}
                type="button"
              >
                <span>{logoutPending ? "Uscita in corso" : "Esci"}</span>
                <LogOut className="size-4" aria-hidden="true" />
              </button>
            </MenuItem>
          </MenuItems>
        </Menu>
      </div>
    </header>
  );
}

function DesktopErrorMessage({ message }: { message: string }) {
  return (
    <div className="mb-5 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-light text-red-800 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-100">
      <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function CustomerDesktopToday({
  activities,
  completionPercent,
  dateLabel,
  loading,
  updatedLabel,
}: {
  activities: CustomerTodayActivity[];
  completionPercent: number;
  dateLabel: string;
  loading: boolean;
  updatedLabel: string;
}) {
  return (
    <div>
      <DesktopTodayBrief completionPercent={completionPercent} dateLabel={dateLabel} loading={loading} />

      <DesktopWorkspace>
        {loading ? <DesktopRowsSkeleton /> : <DesktopTodayFilterNav activities={activities} />}
      </DesktopWorkspace>

      {updatedLabel ? (
        <p className="clienti-numeric mt-4 text-center text-xs/4 font-light text-clienti-muted dark:text-clienti-dark-300">Aggiornato {updatedLabel}</p>
      ) : null}
    </div>
  );
}

function DesktopTodayBrief({
  completionPercent,
  dateLabel,
  loading,
}: {
  completionPercent: number;
  dateLabel: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <section className="mb-5" aria-label="Caricamento attivita di oggi">
        <div className="h-16 animate-pulse rounded-full border border-[#d5e0d9] bg-[#eef5f0] motion-reduce:animate-none dark:border-clienti-dark-300/15 dark:bg-clienti-dark-800" />
      </section>
    );
  }

  return (
    <section className="mb-5" aria-label={getCustomerPortalServiceLabel("today")}>
      <div className="grid min-h-16 grid-cols-[auto_minmax(18rem,1fr)_auto] items-center gap-5">
        <div className="inline-flex min-w-[9.5rem] items-center gap-2 text-lg/6 font-light text-clienti-muted dark:text-clienti-dark-300">
          <CalendarDays className="size-5 shrink-0 stroke-[1.45]" aria-hidden="true" />
          <span className="clienti-numeric whitespace-nowrap">{dateLabel || "Data non disponibile"}</span>
        </div>

        <div className="grid min-w-0 gap-1.5" aria-label="Avanzamento attivita">
          <div className="flex items-center justify-between gap-4 text-[0.68rem]/3 font-light uppercase text-clienti-muted dark:text-clienti-dark-300/80">
            <span>Avanzamento</span>
            <span className="clienti-numeric">100%</span>
          </div>
          <div className="h-2 rounded-full bg-clienti-track dark:bg-clienti-dark-800" aria-hidden="true">
            <div
              className="h-full rounded-full bg-clienti-primary transition-[width] motion-reduce:transition-none dark:bg-clienti-dark-300"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>

        <div className="flex min-w-[6.5rem] items-end justify-end gap-1 text-right">
          <div className="grid gap-1">
            <span className="text-[0.68rem]/3 font-light text-clienti-muted dark:text-clienti-dark-300/80">Completate</span>
            <span className="clienti-numeric font-display text-[2.4rem]/none font-extralight tracking-normal text-clienti-text dark:text-clienti-dark-100">{completionPercent}</span>
          </div>
          <span className="text-sm font-extralight leading-none text-clienti-text dark:text-clienti-dark-100">%</span>
        </div>
      </div>
    </section>
  );
}

function DesktopTodayFilterNav({ activities }: { activities: CustomerTodayActivity[] }) {
  const [sortSettings, setSortSettings] = useState<DesktopTodaySortSetting[]>([]);
  const skipInitialSortPersistRef = useRef(true);

  useEffect(() => {
    const savedSortSettings = readDesktopTodaySortSettings();
    if (savedSortSettings.length > 0) setSortSettings(savedSortSettings);
  }, []);

  useEffect(() => {
    if (skipInitialSortPersistRef.current) {
      skipInitialSortPersistRef.current = false;
      return;
    }

    persistDesktopTodaySortSettings(sortSettings);
  }, [sortSettings]);

  const handleSort = useCallback((key: DesktopTodaySortKey) => {
    setSortSettings((current) => {
      const currentIndex = current.findIndex((setting) => setting.key === key);

      if (currentIndex === -1) return [...current, { direction: "ascending", key }];

      return current.map((setting, index) =>
        index === currentIndex ? { ...setting, direction: setting.direction === "ascending" ? "descending" : "ascending" } : setting,
      );
    });
  }, []);

  const handleRemoveSort = useCallback((key: DesktopTodaySortKey) => {
    setSortSettings((current) => current.filter((setting) => setting.key !== key));
  }, []);

  const handleResetSort = useCallback(() => {
    setSortSettings([]);
  }, []);

  return (
    <TabGroup>
      <div className="flex min-h-[4.5rem] flex-wrap items-center justify-between gap-3 border-b border-[#d5e0d9] py-3 pl-[5rem] pr-5 dark:border-clienti-dark-300/15">
        <TabList as="nav" aria-label="Filtri attivita" className="flex flex-wrap gap-2">
          {DESKTOP_TODAY_FILTERS.map((filter) => {
            const count = getDesktopTodayFilterCount(activities, filter.key);

            return (
              <Tab
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-transparent px-3 text-sm/5 font-light text-clienti-muted transition hover:bg-clienti-surface-muted hover:text-clienti-primary focus:outline-none focus:ring-4 focus:ring-clienti-primary/15 data-selected:border-clienti-primary/20 data-selected:bg-clienti-primary data-selected:text-clienti-on-primary dark:text-clienti-dark-300 dark:hover:bg-clienti-dark-800 dark:hover:text-clienti-dark-100 dark:data-selected:border-clienti-dark-100/20 dark:data-selected:bg-clienti-dark-100 dark:data-selected:text-clienti-dark-950 dark:focus:ring-clienti-dark-300/20"
                key={filter.key}
              >
                <span>{filter.label}</span>
                <span className="clienti-numeric rounded-full bg-white/18 px-1.5 text-xs/4 dark:bg-clienti-dark-950/12">{count}</span>
              </Tab>
            );
          })}
        </TabList>

      </div>

      <TabPanels>
        {DESKTOP_TODAY_FILTERS.map((filter) => (
          <TabPanel key={filter.key}>
            <DesktopActivityRows
              activities={filterDesktopTodayActivities(activities, filter.key)}
              emptyLabel={getDesktopTodayEmptyLabel(filter.key)}
              onRemoveSort={handleRemoveSort}
              onResetSort={handleResetSort}
              onSort={handleSort}
              sortSettings={sortSettings}
            />
          </TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  );
}

function CustomerDesktopCalendar({
  calendarDays,
  canMoveBackward,
  canMoveForward,
  error,
  loading,
  monthKey,
  onMonthChange,
  onSelectDate,
  selectedActivities,
  selectedDate,
}: {
  calendarDays: CalendarDay[];
  canMoveBackward: boolean;
  canMoveForward: boolean;
  error: boolean;
  loading: boolean;
  monthKey: string;
  onMonthChange: (direction: -1 | 1) => void;
  onSelectDate: (ymd: string) => void;
  selectedActivities: CustomerTodayActivity[];
  selectedDate: string;
}) {
  const selectedSummary = buildSummary(selectedActivities);

  return (
    <div>
      <DesktopPageHead description="Attivita assegnate per giorno e riepilogo del giorno selezionato." />

      <DesktopWorkspace>
        <div className="grid lg:grid-cols-[minmax(0,1.38fr)_minmax(320px,.62fr)]">
          <section className="min-w-0 border-r border-[#d5e0d9] p-5 dark:border-clienti-dark-300/15" aria-labelledby="desktop-calendar-title">
            <div className="flex items-center justify-between gap-4">
              <h2 className="wrap-anywhere text-lg/7 font-light text-clienti-text dark:text-clienti-dark-100" id="desktop-calendar-title">{formatMonthLabelIt(monthKey)}</h2>
              <div className="flex gap-2">
                <DesktopMonthButton direction="previous" disabled={!canMoveBackward} onClick={() => onMonthChange(-1)} />
                <DesktopMonthButton direction="next" disabled={!canMoveForward} onClick={() => onMonthChange(1)} />
              </div>
            </div>

            {error ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-light text-red-800 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-100">
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                <span>Impossibile aggiornare il calendario.</span>
              </div>
            ) : null}

            {loading ? (
              <div className="mt-5 h-[35rem] animate-pulse rounded-lg border border-[#d5e0d9] bg-[#eef5f0] motion-reduce:animate-none dark:border-clienti-dark-300/15 dark:bg-clienti-dark-800" />
            ) : (
              <DesktopCalendarGrid calendarDays={calendarDays} onSelectDate={onSelectDate} selectedDate={selectedDate} />
            )}
          </section>

          <aside className="divide-y divide-[#d5e0d9] dark:divide-clienti-dark-300/15">
            <DesktopSelectedDaySummary selectedDate={selectedDate} summary={selectedSummary} />
            <DesktopSelectedDayActivities activities={selectedActivities} />
          </aside>
        </div>
      </DesktopWorkspace>
    </div>
  );
}

function CustomerDesktopReport({
  activities,
  completionPercent,
  dateLabel,
  loading,
  summary,
}: {
  activities: CustomerTodayActivity[];
  completionPercent: number;
  dateLabel: string;
  loading: boolean;
  summary: ActivitySummary;
}) {
  const inProgress = activities.filter(isActivityInProgress);
  const completed = activities.filter(isActivityCompleted);
  const assigned = activities.filter((activity) => !isActivityInProgress(activity) && !isActivityCompleted(activity));
  const pendingCount = getPendingActivityCount(summary);

  return (
    <div>
      <DesktopPageHead description={dateLabel ? `Sintesi delle attivita del ${dateLabel}.` : "Sintesi delle attivita della giornata."} />

      <DesktopWorkspace>
        <DesktopKpiStrip
          items={[
            { label: "Totali", value: summary.assigned, variant: "assigned" },
            { label: "Assegnate", value: pendingCount, variant: "assigned" },
            { label: "In corso", value: summary.inProgress, variant: "progress" },
            { label: "Completate", value: summary.completed, variant: "completed" },
          ]}
        />

        <div className="grid lg:grid-cols-[minmax(0,1.38fr)_minmax(320px,.62fr)]">
          <section className="min-w-0 border-r border-[#d5e0d9] p-5 dark:border-clienti-dark-300/15">
            <div className="h-2 rounded-full bg-[#d7e2db] dark:bg-clienti-dark-800">
              <div className="h-full rounded-full bg-clienti-primary transition-[width] motion-reduce:transition-none dark:bg-clienti-dark-100" style={{ width: `${completionPercent}%` }} />
            </div>

            {loading ? (
              <DesktopRowsSkeleton />
            ) : (
              <div className="mt-6 grid gap-5">
                <DesktopReportGroup activities={inProgress} title="In corso" />
                <DesktopReportGroup activities={assigned} title="Assegnate" />
                <DesktopReportGroup activities={completed} title="Completate" />
              </div>
            )}
          </section>

          <aside className="divide-y divide-[#d5e0d9] dark:divide-clienti-dark-300/15">
            <DesktopCompletionPanel completionPercent={completionPercent} summary={summary} />
          </aside>
        </div>
      </DesktopWorkspace>
    </div>
  );
}

function DesktopPageHead({ description }: { description: string }) {
  if (!description) return null;

  return (
    <div className="mb-5 min-h-5">
      <p className="wrap-anywhere text-sm/5 font-light text-clienti-muted dark:text-clienti-dark-300">{description}</p>
    </div>
  );
}

function DesktopWorkspace({ children }: { children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#c9d8cf] bg-[#fbfdfb] shadow-[0_16px_42px_rgba(5,31,32,0.08)] dark:border-clienti-dark-300/15 dark:bg-clienti-dark-900">
      {children}
    </section>
  );
}

function DesktopSectionHeader({ id, meta, title }: { id: string; meta?: string; title: string }) {
  return (
    <div className="flex min-h-[4.5rem] items-center justify-between gap-4 border-b border-[#d5e0d9] px-5 dark:border-clienti-dark-300/15">
      <div className="min-w-0">
        <h2 className="wrap-anywhere text-base/6 font-light text-clienti-text dark:text-clienti-dark-100" id={id}>{title}</h2>
        {meta ? <p className="mt-0.5 text-xs/4 font-light text-clienti-muted dark:text-clienti-dark-300">{meta}</p> : null}
      </div>
    </div>
  );
}

function DesktopKpiStrip({ items }: { items: Array<{ label: string; value: number; variant: StatusGroup }> }) {
  return (
    <section className="grid min-h-[6.25rem] grid-cols-4 divide-x divide-[#d5e0d9] border-b border-[#d5e0d9] dark:divide-clienti-dark-300/15 dark:border-clienti-dark-300/15" aria-label="Riepilogo operativo">
      {items.map((item) => (
        <DesktopKpiCell item={item} key={item.label} />
      ))}
    </section>
  );
}

function DesktopKpiCell({ item }: { item: { label: string; value: number; variant: StatusGroup } }) {
  const accentClass =
    item.variant === "completed"
      ? "bg-clienti-status-completed"
      : item.variant === "progress"
        ? "bg-clienti-status-progress"
        : "bg-clienti-status-assigned";

  return (
    <div className="flex min-w-0 items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="wrap-anywhere text-xs/4 font-light text-clienti-muted dark:text-clienti-dark-300">{item.label}</p>
        <p className="clienti-numeric mt-2 text-3xl/9 font-light text-clienti-text dark:text-clienti-dark-100">{item.value}</p>
      </div>
      <span className={`mt-1 size-2.5 shrink-0 rounded-full ${accentClass}`} aria-hidden="true" />
    </div>
  );
}

function DesktopCompletionPanel({ completionPercent, summary }: { completionPercent: number; summary: ActivitySummary }) {
  return (
    <section className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base/6 font-light text-clienti-text dark:text-clienti-dark-100">Avanzamento</h2>
          <p className="mt-1 text-sm/5 font-light text-clienti-muted dark:text-clienti-dark-300">{summary.completed} completate su {summary.assigned}</p>
        </div>
        <p className="clienti-numeric font-display text-[2.85rem]/[3rem] font-extralight">{completionPercent}%</p>
      </div>
      <div className="mt-4 h-2 rounded-full bg-[#d7e2db] dark:bg-clienti-dark-800">
        <div className="h-full rounded-full bg-clienti-primary transition-[width] motion-reduce:transition-none dark:bg-clienti-dark-100" style={{ width: `${completionPercent}%` }} />
      </div>
    </section>
  );
}

function DesktopMiniMetric({ label, value, variant }: { label: string; value: number; variant: StatusGroup }) {
  return (
    <div className={`rounded-lg p-3 text-center ${getReportMetricClasses(variant)}`}>
      <p className="clienti-numeric text-2xl/8 font-light">{value}</p>
      <p className="mt-0.5 wrap-anywhere text-[0.65rem]/3 font-light uppercase tracking-[0.08em]">{label}</p>
    </div>
  );
}

function DesktopActivityRows({
  activities,
  emptyLabel = "Nessuna attivita per oggi",
  onRemoveSort,
  onResetSort,
  onSort,
  sortSettings,
}: {
  activities: CustomerTodayActivity[];
  emptyLabel?: string;
  onRemoveSort: (key: DesktopTodaySortKey) => void;
  onResetSort: () => void;
  onSort: (key: DesktopTodaySortKey) => void;
  sortSettings: DesktopTodaySortSetting[];
}) {
  const sortedActivities = useMemo(() => sortDesktopTodayActivities(activities, sortSettings), [activities, sortSettings]);

  return (
    <div aria-label="Elenco operativo" role="table">
      <div
        className={`${DESKTOP_ACTIVITY_GRID_CLASS} border-b border-[#d5e0d9] px-5 py-2 text-[0.65rem]/3 font-light uppercase tracking-[0.08em] text-clienti-muted dark:border-clienti-dark-300/15 dark:text-clienti-dark-300`}
        role="row"
      >
        <span className="flex items-center justify-center" role="columnheader">
          <button
            aria-label="Ripristina ordine originale"
            className="inline-flex size-7 items-center justify-center rounded-full text-clienti-muted transition hover:bg-clienti-surface-muted hover:text-clienti-primary focus:outline-none focus:ring-4 focus:ring-clienti-primary/15 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-clienti-muted dark:text-clienti-dark-300 dark:hover:bg-clienti-dark-800 dark:hover:text-clienti-dark-100 dark:focus:ring-clienti-dark-300/20"
            disabled={sortSettings.length === 0}
            onClick={onResetSort}
            title="Ripristina ordine originale"
            type="button"
          >
            <RotateCcw className="size-3.5 stroke-[1.65]" aria-hidden="true" />
          </button>
        </span>
        {DESKTOP_TODAY_SORT_COLUMNS.map((column) => (
          <DesktopSortColumnHeader column={column} key={column.key} onRemoveSort={onRemoveSort} onSort={onSort} sortSettings={sortSettings} />
        ))}
      </div>
      {sortedActivities.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-base/6 font-light text-clienti-text dark:text-clienti-dark-100">{emptyLabel}</p>
        </div>
      ) : (
        <ul className="divide-y divide-[#d5e0d9] dark:divide-clienti-dark-300/15" role="rowgroup">
          {sortedActivities.map((activity) => (
            <li key={activity.id} role="presentation">
              <DesktopActivityRow activity={activity} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DesktopSortColumnHeader({
  column,
  onRemoveSort,
  onSort,
  sortSettings,
}: {
  column: { key: DesktopTodaySortKey; label: string };
  onRemoveSort: (key: DesktopTodaySortKey) => void;
  onSort: (key: DesktopTodaySortKey) => void;
  sortSettings: DesktopTodaySortSetting[];
}) {
  const sortIndex = sortSettings.findIndex((setting) => setting.key === column.key);
  const active = sortIndex !== -1;
  const direction = active ? sortSettings[sortIndex]?.direction : undefined;
  const ariaSort = getDesktopColumnAriaSort(column.key, sortSettings);

  return (
    <span aria-sort={ariaSort} className="flex min-w-0 items-center" role="columnheader">
      <button
        aria-label={getDesktopSortButtonLabel(column.label, direction, active ? sortIndex + 1 : null)}
        aria-pressed={active}
        className={[
          "inline-flex min-h-7 min-w-0 flex-1 items-center gap-1.5 rounded-full px-2 text-left transition hover:bg-clienti-surface-muted hover:text-clienti-primary focus:outline-none focus:ring-4 focus:ring-clienti-primary/15 dark:hover:bg-clienti-dark-800 dark:hover:text-clienti-dark-100 dark:focus:ring-clienti-dark-300/20",
          active ? "bg-clienti-primary/8 text-clienti-primary dark:bg-clienti-dark-800 dark:text-clienti-dark-100" : "",
        ].join(" ")}
        onClick={() => onSort(column.key)}
        type="button"
      >
        <span className="min-w-0 truncate">{column.label}</span>
        {active && sortSettings.length > 1 ? (
          <span className="clienti-numeric inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-clienti-primary/12 text-[0.62rem]/none text-clienti-primary dark:bg-clienti-dark-100/12 dark:text-clienti-dark-100">
            {sortIndex + 1}
          </span>
        ) : null}
        {direction === "ascending" ? (
          <ArrowUp className="size-3.5 shrink-0 stroke-[1.65]" aria-hidden="true" />
        ) : direction === "descending" ? (
          <ArrowDown className="size-3.5 shrink-0 stroke-[1.65]" aria-hidden="true" />
        ) : (
          <ArrowUpDown className="size-3.5 shrink-0 stroke-[1.65] opacity-55" aria-hidden="true" />
        )}
      </button>
      {active ? (
        <button
          aria-label={`Rimuovi ordinamento ${column.label}`}
          className="ml-1 inline-flex size-7 items-center justify-center rounded-full text-clienti-muted transition hover:bg-clienti-surface-muted hover:text-clienti-primary focus:outline-none focus:ring-4 focus:ring-clienti-primary/15 dark:text-clienti-dark-300 dark:hover:bg-clienti-dark-800 dark:hover:text-clienti-dark-100 dark:focus:ring-clienti-dark-300/20"
          onClick={() => onRemoveSort(column.key)}
          title={`Rimuovi ordinamento ${column.label}`}
          type="button"
        >
          <X className="size-3.5 stroke-[1.65]" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}

function DesktopActivityRow({ activity }: { activity: CustomerTodayActivity }) {
  const statusGroup = resolveStatusGroup(activity);
  const statusClasses = getStatusClasses(statusGroup);

  return (
    <div className={`${DESKTOP_ACTIVITY_GRID_CLASS} min-h-[4.9rem] items-center px-5 py-3 transition hover:bg-[#f4f8f5] dark:hover:bg-clienti-dark-800/45`} role="row">
      <span className={`inline-flex size-10 items-center justify-center rounded-lg ${statusClasses.icon}`} role="cell">
        {statusGroup === "completed" ? <CircleCheck className="size-5 stroke-[1.55]" /> : statusGroup === "progress" ? <LoaderCircle className="size-5 stroke-[1.55]" /> : <CalendarClock className="size-5 stroke-[1.55]" />}
      </span>
      <div className="min-w-0" role="cell">
        <p className="wrap-anywhere text-sm/5 font-light text-clienti-text dark:text-clienti-dark-100">{getDesktopActivityTitle(activity)}</p>
        <p className="mt-1 wrap-anywhere text-xs/4 font-light text-clienti-muted dark:text-clienti-dark-300">{getDesktopActivitySubtitle(activity)}</p>
        <p className="mt-1 wrap-anywhere text-[0.7rem]/4 font-light text-clienti-muted/80 dark:text-clienti-dark-300/75">{getDesktopAddress(activity)}</p>
      </div>
      <p className="clienti-numeric wrap-anywhere text-xs/4 font-light text-clienti-text dark:text-clienti-dark-100" role="cell">{formatDesktopDateTime(activity.checkout, activity.checkoutTime)}</p>
      <p className="clienti-numeric wrap-anywhere text-xs/4 font-light text-clienti-text dark:text-clienti-dark-100" role="cell">{formatDesktopDateTime(activity.checkin, activity.checkinTime)}</p>
      <p className="clienti-numeric wrap-anywhere text-xs/4 font-light text-clienti-text dark:text-clienti-dark-100" role="cell">{getDesktopGuests(activity)}</p>
      <span className={`justify-self-start rounded-lg px-2.5 py-1 text-xs/4 font-light ${statusClasses.badge}`} role="cell">{statusLabel(statusGroup)}</span>
    </div>
  );
}

function DesktopRowsSkeleton() {
  return (
    <div className="grid gap-3 p-5">
      <div className="h-20 animate-pulse rounded-lg border border-[#d5e0d9] bg-[#eef5f0] motion-reduce:animate-none dark:border-clienti-dark-300/15 dark:bg-clienti-dark-800" />
      <div className="h-20 animate-pulse rounded-lg border border-[#d5e0d9] bg-[#eef5f0] motion-reduce:animate-none dark:border-clienti-dark-300/15 dark:bg-clienti-dark-800" />
      <div className="h-20 animate-pulse rounded-lg border border-[#d5e0d9] bg-[#eef5f0] motion-reduce:animate-none dark:border-clienti-dark-300/15 dark:bg-clienti-dark-800" />
    </div>
  );
}

function DesktopMonthButton({ direction, disabled, onClick }: { direction: "next" | "previous"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      aria-label={direction === "previous" ? "Mese precedente" : "Mese successivo"}
      className="inline-flex size-9 items-center justify-center rounded-lg border border-[#c9d8cf] bg-[#f7faf8] text-clienti-primary focus:outline-none focus:ring-4 focus:ring-clienti-primary/15 disabled:cursor-not-allowed disabled:opacity-40 dark:border-clienti-dark-300/15 dark:bg-clienti-dark-800 dark:text-clienti-dark-100 dark:focus:ring-clienti-dark-300/20"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <ChevronRight className={`size-4${direction === "previous" ? " rotate-180" : ""}`} aria-hidden="true" />
    </button>
  );
}

function DesktopCalendarGrid({
  calendarDays,
  onSelectDate,
  selectedDate,
}: {
  calendarDays: CalendarDay[];
  onSelectDate: (ymd: string) => void;
  selectedDate: string;
}) {
  return (
    <div className="mt-5 grid grid-cols-7 gap-1.5">
      {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((weekday) => (
        <div className="py-1 text-center text-[0.65rem]/4 font-light uppercase tracking-[0.08em] text-clienti-muted dark:text-clienti-dark-300" key={weekday}>
          {weekday}
        </div>
      ))}
      {calendarDays.map((day) => (
        <DesktopCalendarDay day={day} key={day.ymd} onSelectDate={onSelectDate} selected={day.ymd === selectedDate} />
      ))}
    </div>
  );
}

function DesktopCalendarDay({ day, onSelectDate, selected }: { day: CalendarDay; onSelectDate: (ymd: string) => void; selected: boolean }) {
  return (
    <button
      aria-label={`${formatYmdIt(day.ymd)}: ${day.activities.length} attivita`}
      className={[
        "grid min-h-[6rem] content-between rounded-lg border p-2 text-left transition focus:outline-none focus:ring-4 focus:ring-clienti-primary/15 dark:focus:ring-clienti-dark-300/20",
        selected
          ? "border-clienti-primary bg-clienti-primary text-clienti-on-primary dark:border-clienti-dark-100 dark:bg-clienti-dark-100 dark:text-clienti-dark-950"
          : "border-[#d5e0d9] bg-[#f7faf8] text-clienti-text hover:border-clienti-primary/35 hover:bg-[#eef5f0] dark:border-clienti-dark-300/15 dark:bg-clienti-dark-800 dark:text-clienti-dark-100 dark:hover:bg-clienti-dark-700",
        day.currentMonth ? "" : "opacity-45",
      ].join(" ")}
      onClick={() => onSelectDate(day.ymd)}
      type="button"
    >
      <span className="clienti-numeric text-xs/4 font-light">{day.dayNumber}</span>
      {day.activities.length > 0 ? (
        <span className="grid gap-1">
          <span className="flex flex-wrap gap-1">
            {day.summary.assigned > 0 ? <CalendarCount value={day.summary.assigned} variant="assigned" /> : null}
            {day.summary.inProgress > 0 ? <CalendarCount value={day.summary.inProgress} variant="progress" /> : null}
            {day.summary.completed > 0 ? <CalendarCount value={day.summary.completed} variant="completed" /> : null}
          </span>
          <span className="grid gap-0.5">
            {day.activities.slice(0, 2).map((activity) => (
              <span className="wrap-anywhere text-[0.62rem]/3 font-light" key={activity.id}>
                {getDesktopActivityTitle(activity)}
              </span>
            ))}
          </span>
        </span>
      ) : (
        <span className="size-1" aria-hidden="true" />
      )}
    </button>
  );
}

function DesktopSelectedDaySummary({ selectedDate, summary }: { selectedDate: string; summary: ActivitySummary }) {
  return (
    <section className="p-5">
      <h2 className="text-base/6 font-light text-clienti-text dark:text-clienti-dark-100">{selectedDate ? formatYmdIt(selectedDate) : "Giorno selezionato"}</h2>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <DesktopMiniMetric label="Totali" value={summary.assigned} variant="assigned" />
        <DesktopMiniMetric label="In corso" value={summary.inProgress} variant="progress" />
        <DesktopMiniMetric label="Completate" value={summary.completed} variant="completed" />
      </div>
    </section>
  );
}

function DesktopSelectedDayActivities({ activities }: { activities: CustomerTodayActivity[] }) {
  return (
    <section className="p-5">
      <h2 className="text-base/6 font-light text-clienti-text dark:text-clienti-dark-100">Attivita</h2>
      {activities.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {activities.map((activity) => (
            <li className="rounded-lg border border-[#d5e0d9] bg-[#f7faf8] p-3 dark:border-clienti-dark-300/15 dark:bg-clienti-dark-800" key={activity.id}>
              <p className="wrap-anywhere text-sm/5 font-light text-clienti-text dark:text-clienti-dark-100">{getDesktopActivityTitle(activity)}</p>
              <p className="mt-1 text-xs/4 font-light text-clienti-muted dark:text-clienti-dark-300">{getDesktopActivitySubtitle(activity)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm/6 font-light text-clienti-muted dark:text-clienti-dark-300">Nessuna attivita visibile.</p>
      )}
    </section>
  );
}

function DesktopReportGroup({ activities, title }: { activities: CustomerTodayActivity[]; title: string }) {
  return (
    <section>
      <h2 className="text-sm/5 font-light text-clienti-muted dark:text-clienti-dark-300">{title}</h2>
      {activities.length > 0 ? (
        <ul className="mt-2 grid gap-2">
          {activities.map((activity) => (
            <li className="rounded-lg border border-[#d5e0d9] bg-[#f7faf8] p-3 dark:border-clienti-dark-300/15 dark:bg-clienti-dark-800" key={activity.id}>
              <p className="wrap-anywhere text-sm/5 font-light text-clienti-text dark:text-clienti-dark-100">{getDesktopActivityTitle(activity)}</p>
              <p className="mt-1 text-xs/4 font-light text-clienti-muted dark:text-clienti-dark-300">{getDesktopActivitySubtitle(activity)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm/5 font-light text-clienti-muted dark:text-clienti-dark-300">Nessuna attivita.</p>
      )}
    </section>
  );
}

function CustomerDesktopTopbar({ activeService, dateLabel }: { activeService: CustomerPortalService; dateLabel: string }) {
  return (
    <header className="clienti-glass hidden items-center justify-between gap-4 rounded-lg border px-5 py-4 lg:flex">
      <div className="min-w-0">
        <p className="text-[0.72rem] font-light uppercase tracking-[0.14em] text-clienti-muted dark:text-clienti-dark-300/80">
          Assistente ADAM
        </p>
        <h1 className="font-display mt-2 truncate text-[2rem] font-light leading-none text-clienti-text dark:text-clienti-dark-100">
          {getCustomerPortalServiceLabel(activeService)}
        </h1>
        {dateLabel ? (
          <p className="mt-2 text-sm font-light text-clienti-muted dark:text-clienti-dark-300">{dateLabel}</p>
        ) : null}
      </div>

      <div
        aria-hidden="true"
        className="clienti-glass-muted inline-flex size-12 shrink-0 items-center justify-center rounded-lg border text-clienti-primary dark:text-clienti-dark-100"
      >
        <Bell className="size-5 stroke-[1.45]" aria-hidden="true" />
      </div>
    </header>
  );
}

function CustomerDesktopSidebar({
  activeService,
  customerName,
  initialTheme,
}: {
  activeService: CustomerPortalService;
  customerName: string;
  initialTheme: ThemeName;
}) {
  const [logoutPending, setLogoutPending] = useState(false);
  const linkBase =
    "flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm font-light transition focus:outline-none focus:ring-4 focus:ring-clienti-primary/15 dark:focus:ring-clienti-dark-300/20";
  const activeLinkClass = `${linkBase} border-clienti-primary bg-clienti-primary text-clienti-on-primary dark:border-clienti-dark-100 dark:bg-clienti-dark-100 dark:text-clienti-dark-950`;
  const inactiveLinkClass = `${linkBase} border-[color:var(--clienti-glass-border)] bg-[var(--clienti-glass-muted)] text-clienti-primary hover:bg-clienti-surface-muted dark:text-clienti-dark-100 dark:hover:bg-clienti-dark-800`;

  async function handleLogout() {
    if (logoutPending) return;
    setLogoutPending(true);

    try {
      await logoutCustomer();
      window.location.assign("/clienti/login");
    } finally {
      setLogoutPending(false);
    }
  }

  return (
    <aside className="clienti-glass sticky top-6 hidden min-h-[calc(100dvh-3rem)] flex-col rounded-lg border p-4 lg:flex">
      <div className="flex items-center gap-3">
        <div className="clienti-glass-muted inline-flex size-12 shrink-0 items-center justify-center rounded-lg border">
          <img className="size-10 object-contain dark:hidden" src="/img/ad-premium.png" alt="AD Premium" />
          <img className="hidden size-10 object-contain dark:block" src="/img/ad-premium-inv.png" alt="AD Premium" />
        </div>
        <div className="min-w-0">
          <p className="text-[0.68rem] font-light uppercase tracking-[0.14em] text-clienti-muted dark:text-clienti-dark-300/80">
            AD Premium
          </p>
          <p className="mt-1 break-words text-sm font-light text-clienti-text dark:text-clienti-dark-100">{customerName}</p>
        </div>
      </div>

      <nav className="mt-6 grid gap-2" aria-label="Servizi clienti">
        {CUSTOMER_PORTAL_SERVICES.map((service) => (
          <Link
            aria-current={activeService === service ? "page" : undefined}
            className={activeService === service ? activeLinkClass : inactiveLinkClass}
            href={getCustomerPortalServiceHref(service)}
            key={service}
          >
            <CustomerPortalServiceIcon className="size-4 stroke-[1.55]" service={service} />
            <span>{getCustomerPortalServiceLabel(service)}</span>
          </Link>
        ))}
      </nav>

      <div className="clienti-glass-muted mt-6 grid gap-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-clienti-muted dark:text-clienti-dark-300">Tema</span>
          <ThemeToggle className="h-9 w-[70px]" initialTheme={initialTheme} />
        </div>
      </div>

      <button
        className="clienti-glass-muted mt-auto flex min-h-11 items-center justify-between rounded-lg border px-3 text-left text-sm font-light text-clienti-primary transition hover:bg-clienti-surface-muted focus:outline-none focus:ring-4 focus:ring-clienti-primary/15 disabled:cursor-not-allowed disabled:opacity-60 dark:text-clienti-dark-100 dark:hover:bg-clienti-dark-800 dark:focus:ring-clienti-dark-300/20"
        disabled={logoutPending}
        onClick={() => void handleLogout()}
        type="button"
      >
        <span>{logoutPending ? "Uscita in corso" : "Logout"}</span>
        <LogOut className="size-4" aria-hidden="true" />
      </button>
    </aside>
  );
}

function CinematicDailySplash({
  customerName,
  onClose,
  state,
}: {
  customerName: string;
  onClose: () => void;
  state: "visible" | "closing";
}) {
  const dateLabel = useMemo(() => {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "long",
      weekday: "long",
    }).format(new Date());
  }, []);

  return (
    <Dialog open={true} onClose={onClose}>
      <DialogPanel className={`clienti-splash-screen${state === "closing" ? " is-closing" : ""}`}>
        <button className="sr-only" data-autofocus onClick={onClose} type="button">
          Salta intro
        </button>
        <div className="clienti-splash-grid" aria-hidden="true" />
        <div className="clienti-splash-glow clienti-splash-glow-left" aria-hidden="true" />
        <div className="clienti-splash-glow clienti-splash-glow-right" aria-hidden="true" />
        <div className="clienti-splash-content">
          <div className="clienti-splash-logo-shell">
            <span className="clienti-splash-logo-pulse" aria-hidden="true" />
            <img className="clienti-splash-logo dark:hidden" src="/img/ad-premium.png" alt="AD Premium" />
            <img className="clienti-splash-logo hidden dark:block" src="/img/ad-premium-inv.png" alt="AD Premium" />
          </div>
          <p className="clienti-splash-kicker">Assistente ADAM</p>
          <DialogTitle className="clienti-splash-title">
            <span className="clienti-splash-title-line">Buongiorno</span>
            <span className="clienti-splash-title-line clienti-splash-name">{customerName}</span>
          </DialogTitle>
          <div className="clienti-splash-rule" aria-hidden="true" />
          <p className="clienti-splash-date">{dateLabel}</p>
        </div>
      </DialogPanel>
    </Dialog>
  );
}

function CustomerBottomNav({
  activeService,
  dateLabel,
  initialTheme,
}: {
  activeService: CustomerPortalService;
  dateLabel: string;
  initialTheme: ThemeName;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const navButtonBase =
    "inline-flex items-center justify-center rounded-full border transition-[transform,background-color,border-color,color,box-shadow] duration-200 focus:outline-none focus:ring-4 focus:ring-clienti-primary/15 dark:focus:ring-clienti-dark-300/20";
  const inactiveNavButtonClass = `${navButtonBase} size-9 translate-y-0 border-[color:var(--clienti-glass-border)] bg-[var(--clienti-glass-muted)] text-clienti-muted dark:text-clienti-dark-300/65`;
  const activeNavButtonClass = `${navButtonBase} size-9 -translate-y-4 scale-[1.28] border-clienti-primary bg-clienti-primary text-clienti-on-primary shadow-[0_10px_24px_rgba(5,31,32,0.16)] dark:border-clienti-dark-100 dark:bg-clienti-dark-100 dark:text-clienti-dark-950 dark:shadow-[0_12px_28px_rgba(0,0,0,0.30)]`;
  const utilityButtonClass = `${inactiveNavButtonClass} disabled:cursor-default disabled:opacity-65`;
  const serviceLinkClass = (service: CustomerPortalService) =>
    activeService === service
      ? activeNavButtonClass
      : inactiveNavButtonClass;

  async function handleLogout() {
    if (logoutPending) return;
    setLogoutPending(true);

    try {
      await logoutCustomer();
      window.location.assign("/clienti/login");
    } finally {
      setLogoutPending(false);
    }
  }

  return (
    <>
      <nav
        aria-label="Navigazione clienti"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[460px] px-4 lg:hidden"
        style={{ paddingBottom: "max(0.85rem, env(safe-area-inset-bottom))" }}
      >
        <div className="clienti-glass-nav pointer-events-auto grid grid-cols-5 items-center justify-items-center rounded-lg border px-3 py-2">
          <Link
            aria-current={activeService === "report" ? "page" : undefined}
            aria-label={getCustomerPortalServiceLabel("report")}
            className={serviceLinkClass("report")}
            href={getCustomerPortalServiceHref("report")}
          >
            <CustomerPortalServiceIcon className="size-[1.15rem] stroke-[1.55]" service="report" />
          </Link>

          <Link
            aria-current={activeService === "calendar" ? "page" : undefined}
            aria-label={getCustomerPortalServiceLabel("calendar")}
            className={serviceLinkClass("calendar")}
            href={getCustomerPortalServiceHref("calendar")}
          >
            <CustomerPortalServiceIcon className="size-[1.15rem] stroke-[1.55]" service="calendar" />
          </Link>

          <Link
            aria-current={activeService === "today" ? "page" : undefined}
            aria-label={getCustomerPortalServiceLabel("today")}
            className={serviceLinkClass("today")}
            href={getCustomerPortalServiceHref("today")}
          >
            <CustomerPortalServiceIcon className="size-5 stroke-[1.55]" service="today" />
          </Link>

          <button
            aria-label="Avvisi sicurezza"
            className={utilityButtonClass}
            disabled
            type="button"
          >
            <ShieldAlert className="size-[1.15rem] stroke-[1.55]" aria-hidden="true" />
          </button>

          <button
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            aria-label="Apri menu clienti"
            className={utilityButtonClass}
            onClick={() => setMenuOpen(true)}
            type="button"
          >
            <Grip className="size-[1.15rem] stroke-[1.55]" aria-hidden="true" />
          </button>
        </div>
      </nav>

      <Dialog open={menuOpen} onClose={setMenuOpen}>
        <div className="fixed inset-0 z-50 bg-clienti-950/35 backdrop-blur-sm dark:bg-clienti-dark-950/60" />
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <DialogPanel className="clienti-page-shell flex min-h-dvh flex-col px-4 pb-8 pt-4 text-clienti-text dark:text-clienti-dark-100">
            <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-[460px] flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <DialogTitle className="font-display text-[1.85rem] font-light leading-tight">Assistente ADAM</DialogTitle>
                  <p className="mt-1 text-sm font-light text-clienti-muted dark:text-clienti-dark-300">
                    {dateLabel || "Attività di oggi"}
                  </p>
                </div>

                <button
                  aria-label="Chiudi menu clienti"
                  className="clienti-glass inline-flex size-11 items-center justify-center rounded-full border text-clienti-primary focus:outline-none focus:ring-4 focus:ring-clienti-primary/15 dark:text-clienti-dark-100 dark:focus:ring-clienti-dark-300/20"
                  data-autofocus
                  onClick={() => setMenuOpen(false)}
                  type="button"
                >
                  <X className="size-5 stroke-[1.55]" aria-hidden="true" />
                </button>
              </div>

              <div className="clienti-glass grid gap-3 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-clienti-muted dark:text-clienti-dark-300">Tema</span>
                  <ThemeToggle className="h-9 w-[70px]" initialTheme={initialTheme} />
                </div>
              </div>

              <button
                className="clienti-glass-muted mt-auto flex min-h-11 items-center justify-between rounded-lg border px-3 text-left text-sm font-light text-clienti-primary transition hover:bg-clienti-surface-muted focus:outline-none focus:ring-4 focus:ring-clienti-primary/15 disabled:cursor-not-allowed disabled:opacity-60 dark:text-clienti-dark-100 dark:hover:bg-clienti-dark-800 dark:focus:ring-clienti-dark-300/20"
                disabled={logoutPending}
                onClick={() => void handleLogout()}
                type="button"
              >
                <span>{logoutPending ? "Uscita in corso" : "Logout"}</span>
                <LogOut className="size-4" aria-hidden="true" />
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}

function CustomerPortalServiceIcon({ className, service }: { className: string; service: CustomerPortalService }) {
  if (service === "report") {
    return <ChartColumnBig className={className} aria-hidden="true" />;
  }

  if (service === "calendar") {
    return <CalendarDays className={className} aria-hidden="true" />;
  }

  return <House className={className} aria-hidden="true" />;
}

function getCustomerPortalServiceLabel(service: CustomerPortalService): string {
  if (service === "report") return "Report della giornata";
  if (service === "calendar") return "Calendario";
  return "Attività di oggi";
}

function getDesktopActivityTitle(activity: CustomerTodayActivity): string {
  return activity.structure.nameFrontend?.trim() || activity.structure.name?.trim() || `Struttura ${activity.structureId}`;
}

function filterDesktopTodayActivities(activities: CustomerTodayActivity[], filter: DesktopTodayFilterKey): CustomerTodayActivity[] {
  if (filter === "all") return activities;
  return activities.filter((activity) => resolveStatusGroup(activity) === filter);
}

function getDesktopTodayFilterCount(activities: CustomerTodayActivity[], filter: DesktopTodayFilterKey): number {
  return filterDesktopTodayActivities(activities, filter).length;
}

function getDesktopTodayEmptyLabel(filter: DesktopTodayFilterKey): string {
  if (filter === "completed") return "Nessuna attivita completata";
  if (filter === "progress") return "Nessuna attivita in corso";
  if (filter === "assigned") return "Nessuna attivita assegnata";
  return "Nessuna attivita per oggi";
}

function readDesktopTodaySortSettings(): DesktopTodaySortSetting[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(DESKTOP_TODAY_SORT_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    const settings = Array.isArray(parsed)
      ? parsed.map(toDesktopTodaySortSetting).filter((setting): setting is DesktopTodaySortSetting => setting !== null)
      : [toDesktopTodaySortSetting(parsed)].filter((setting): setting is DesktopTodaySortSetting => setting !== null);
    const seen = new Set<DesktopTodaySortKey>();

    return settings.filter((setting) => {
      if (seen.has(setting.key)) return false;
      seen.add(setting.key);
      return true;
    });
  } catch {
    return [];
  }
}

function persistDesktopTodaySortSettings(sortSettings: DesktopTodaySortSetting[]): void {
  if (typeof window === "undefined") return;

  try {
    if (sortSettings.length === 0) {
      window.localStorage.removeItem(DESKTOP_TODAY_SORT_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(DESKTOP_TODAY_SORT_STORAGE_KEY, JSON.stringify(sortSettings));
  } catch {
    // Il browser puo negare la persistenza locale; la tabella resta comunque ordinabile nella sessione corrente.
  }
}

function toDesktopTodaySortSetting(value: unknown): DesktopTodaySortSetting | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<DesktopTodaySortSetting>;
  if (!isDesktopTodaySortKey(candidate.key) || !isSortDirection(candidate.direction)) return null;
  return { direction: candidate.direction, key: candidate.key };
}

function isDesktopTodaySortKey(value: unknown): value is DesktopTodaySortKey {
  return DESKTOP_TODAY_SORT_COLUMNS.some((column) => column.key === value);
}

function isSortDirection(value: unknown): value is SortDirection {
  return value === "ascending" || value === "descending";
}

function sortDesktopTodayActivities(activities: CustomerTodayActivity[], sortSettings: DesktopTodaySortSetting[]): CustomerTodayActivity[] {
  if (sortSettings.length === 0) return activities;

  return activities
    .map((activity, index) => ({ activity, index }))
    .sort((left, right) => {
      for (const sortSetting of sortSettings) {
        const compared = compareDesktopSortValues(
          getDesktopSortValue(left.activity, sortSetting.key),
          getDesktopSortValue(right.activity, sortSetting.key),
          sortSetting.direction,
        );

        if (compared !== 0) return compared;
      }

      return left.index - right.index;
    })
    .map(({ activity }) => activity);
}

function compareDesktopSortValues(left: DesktopSortValue, right: DesktopSortValue, direction: SortDirection): number {
  if (left.missing && right.missing) return 0;
  if (left.missing) return 1;
  if (right.missing) return -1;

  const compared =
    typeof left.value === "number" && typeof right.value === "number"
      ? left.value - right.value
      : DESKTOP_SORT_COLLATOR.compare(String(left.value), String(right.value));

  return direction === "ascending" ? compared : -compared;
}

function getDesktopSortValue(activity: CustomerTodayActivity, key: DesktopTodaySortKey): DesktopSortValue {
  if (key === "activity") {
    return {
      missing: false,
      value: [getDesktopActivityTitle(activity), getDesktopActivitySubtitle(activity), getDesktopAddress(activity)].join(" "),
    };
  }

  if (key === "checkout") return getDesktopDateSortValue(activity.checkout, activity.checkoutTime);
  if (key === "checkin") return getDesktopDateSortValue(activity.checkin, activity.checkinTime);

  if (key === "guests") {
    const totalGuests = activity.checkoutPax + activity.checkinPax;
    return { missing: totalGuests <= 0, value: totalGuests };
  }

  return { missing: false, value: statusLabel(resolveStatusGroup(activity)) };
}

function getDesktopDateSortValue(ymd: string | null, time: string | null): DesktopSortValue {
  const cleanDate = ymd?.trim() ?? "";
  const cleanTime = time ? time.slice(0, 5) : "";

  return {
    missing: !cleanDate && !cleanTime,
    value: `${cleanDate} ${cleanTime}`,
  };
}

function getDesktopColumnAriaSort(key: DesktopTodaySortKey, sortSettings: DesktopTodaySortSetting[]): SortDirection | "other" | undefined {
  if (sortSettings[0]?.key !== key) return undefined;
  if (sortSettings.length > 1) return "other";
  return sortSettings[0].direction;
}

function getDesktopSortButtonLabel(label: string, direction: SortDirection | undefined, priority: number | null): string {
  const priorityLabel = priority ? ` Ordinamento attivo ${priority}.` : "";
  if (direction === "ascending") return `${priorityLabel} Ordina ${label} in modo decrescente`.trim();
  if (direction === "descending") return `${priorityLabel} Ordina ${label} in modo crescente`.trim();
  return `Ordina ${label}`;
}

function getDesktopActivitySubtitle(activity: CustomerTodayActivity): string {
  const operation = activity.operation.name?.trim();
  const activityName = activity.activity.name?.trim();

  if (operation && activityName) return `${operation} - ${activityName}`;
  return operation || activityName || "Attivita operativa";
}

function getDesktopAddress(activity: CustomerTodayActivity): string {
  const parts = [activity.structure.address1, activity.structure.city, activity.structure.postcode].map((part) => part?.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Indirizzo non disponibile";
}

function getDesktopGuests(activity: CustomerTodayActivity): string {
  const checkoutPax = activity.checkoutPax;
  const checkinPax = activity.checkinPax;

  if (checkoutPax > 0 && checkinPax > 0) return `${checkoutPax} out / ${checkinPax} in`;
  if (checkoutPax > 0) return `${checkoutPax} out`;
  if (checkinPax > 0) return `${checkinPax} in`;
  return "Non indicati";
}

function getCustomerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("");

  return initials || "AD";
}

function formatDesktopDateTime(ymd: string | null, time: string | null): string {
  const date = formatYmdIt(ymd);
  const cleanTime = time ? time.slice(0, 5) : "";

  if (date && cleanTime) return `${date} ${cleanTime}`;
  return date || cleanTime || "Non indicato";
}

function getCustomerPortalServiceHref(service: CustomerPortalService): string {
  if (service === "report") return "/clienti/report";
  if (service === "calendar") return "/clienti/calendario";
  return "/clienti/attivita";
}

function getCustomerNavTitle(service: CustomerPortalService): string | null {
  if (service === "today") {
    return null;
  }

  return getCustomerPortalServiceLabel(service);
}

function CustomerTodayReport({
  completionPercent,
  summary,
  totalAssigned,
}: {
  completionPercent: number;
  summary: ActivitySummary;
  totalAssigned: number;
}) {
  return (
    <section className="grid gap-4" aria-label="Report della giornata">
      <div className="clienti-glass-strong relative overflow-hidden rounded-lg border p-4 text-clienti-text dark:text-clienti-dark-100">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/80 dark:bg-clienti-dark-100/20" />
        <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-3">
          <div className="min-w-0 py-1">
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-clienti-muted dark:text-clienti-dark-300">
              Oggi
            </p>
            <p className="clienti-numeric font-display mt-2 text-[3.8rem] font-extralight leading-none tracking-normal">
              {totalAssigned}
            </p>
            <p className="mt-1 text-[1.02rem] font-light leading-tight">
              Attività assegnate
            </p>

            <div className="mt-5 grid gap-2">
              <div className="flex items-center justify-between gap-3 text-[0.72rem] font-medium">
                <span>Completamento</span>
                <span>{completionPercent}%</span>
              </div>
              <div className="h-2 rounded-full bg-clienti-track dark:bg-clienti-dark-950/35">
                <div
                  className="h-full rounded-full bg-clienti-primary transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-clienti-dark-100"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="relative flex h-32 items-center justify-center">
            <Bubbles className="absolute right-2 top-[-0.65rem] z-0 size-32 rotate-[17deg] stroke-[0.9] text-clienti-primary/30 drop-shadow-[0_18px_18px_rgba(8,56,34,0.12)] dark:text-clienti-dark-300/30 dark:drop-shadow-[0_18px_24px_rgba(0,0,0,0.25)]" aria-hidden="true" />
            <BrushCleaning className="absolute right-0 top-1 z-10 size-28 rotate-[-12deg] stroke-[1.05] text-clienti-text/75 drop-shadow-[0_18px_18px_rgba(8,56,34,0.18)] dark:text-clienti-dark-100/80 dark:drop-shadow-[0_18px_24px_rgba(0,0,0,0.35)]" aria-hidden="true" />
              <div className="clienti-glass clienti-numeric absolute bottom-2 right-2 z-20 rounded-lg border px-2 py-1 text-[0.68rem] font-light text-clienti-text dark:text-clienti-dark-100">
              {completionPercent}%
            </div>
          </div>
        </div>
      </div>

      <ReportStatusMoon summary={summary} totalAssigned={totalAssigned} />
    </section>
  );
}

function ReportStatusMoon({
  summary,
  totalAssigned,
}: {
  summary: ActivitySummary;
  totalAssigned: number;
}) {
  const progressPercent = getReportPercent(summary.inProgress, totalAssigned);
  const completedPercent = getReportPercent(summary.completed, totalAssigned);
  const activePercent = Math.min(completedPercent + progressPercent, 100);

  return (
    <div className="clienti-glass rounded-lg border p-4">
      <div className="grid gap-3">
        <div className="relative mx-auto h-36 w-full max-w-[18rem]">
          <svg className="h-36 w-full" viewBox="0 0 220 140" aria-hidden="true">
            <path
              className="stroke-clienti-track dark:stroke-clienti-status-assigned-dark"
              d="M 24 116 A 86 86 0 0 1 196 116"
              fill="none"
              pathLength="100"
              strokeLinecap="round"
              strokeWidth="18"
            />
            <path
              d="M 24 116 A 86 86 0 0 1 196 116"
              fill="none"
              pathLength="100"
              className="stroke-clienti-status-progress dark:stroke-clienti-status-progress-dark"
              strokeDasharray={`${activePercent} 100`}
              strokeLinecap="round"
              strokeWidth="18"
            />
            <path
              d="M 24 116 A 86 86 0 0 1 196 116"
              fill="none"
              pathLength="100"
              className="stroke-clienti-status-completed dark:stroke-clienti-status-completed-dark"
              strokeDasharray={`${completedPercent} 100`}
              strokeLinecap="round"
              strokeWidth="18"
            />
          </svg>

          <div className="absolute inset-x-0 bottom-3 flex flex-col items-center text-center">
            <p className="clienti-numeric font-display text-[2.65rem] font-extralight leading-none text-clienti-text dark:text-clienti-dark-100">
              {completedPercent}%
            </p>
            <p className="mt-1 text-[0.72rem] font-medium uppercase tracking-[0.14em] text-clienti-muted dark:text-clienti-dark-300/80">
              Completate
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <ReportMoonMetric label="Assegnate" value={summary.assigned} variant="assigned" />
          <ReportMoonMetric label="In corso" value={summary.inProgress} variant="progress" />
          <ReportMoonMetric label="Completate" value={summary.completed} variant="completed" />
        </div>
      </div>
    </div>
  );
}

function ReportMoonMetric({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: StatusGroup;
}) {
  const classes = getReportMetricClasses(variant);

  return (
    <div className={`rounded-lg px-2.5 py-2.5 text-center shadow-[0_10px_22px_rgba(5,31,32,0.08)] ${classes}`}>
      <p className="clienti-numeric font-display text-[1.8rem] font-extralight leading-none">{value}</p>
      <p className="mt-1 text-[0.66rem] font-medium leading-tight">{label}</p>
    </div>
  );
}

function CustomerCalendarView({
  canMoveBackward,
  canMoveForward,
  calendarDays,
  dayDialogOpen,
  error,
  loading,
  monthKey,
  onCloseDayDialog,
  onMonthChange,
  onSelectDate,
  selectedActivities,
  selectedDate,
}: {
  canMoveBackward: boolean;
  canMoveForward: boolean;
  calendarDays: CalendarDay[];
  dayDialogOpen: boolean;
  error: boolean;
  loading: boolean;
  monthKey: string;
  onCloseDayDialog: () => void;
  onMonthChange: (direction: -1 | 1) => void;
  onSelectDate: (ymd: string) => void;
  selectedActivities: CustomerTodayActivity[];
  selectedDate: string;
}) {
  const selectedSummary = buildSummary(selectedActivities);

  return (
    <section className="grid gap-4" aria-label="Calendario attività">
      <div className="clienti-glass grid gap-4 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[1.8rem] font-light leading-none text-clienti-text dark:text-clienti-dark-100">
            {formatMonthLabelIt(monthKey)}
          </h2>

          <div className="flex items-center gap-2">
            <button
              aria-label="Mese precedente"
              className="clienti-glass-muted inline-flex size-10 items-center justify-center rounded-lg border text-clienti-primary focus:outline-none focus:ring-4 focus:ring-clienti-primary/15 disabled:cursor-not-allowed disabled:opacity-35 dark:text-clienti-dark-100"
              disabled={!canMoveBackward}
              onClick={() => onMonthChange(-1)}
              type="button"
            >
              <ChevronRight className="size-4 rotate-180 stroke-[1.65]" aria-hidden="true" />
            </button>
            <button
              aria-label="Mese successivo"
              className="clienti-glass-muted inline-flex size-10 items-center justify-center rounded-lg border text-clienti-primary focus:outline-none focus:ring-4 focus:ring-clienti-primary/15 disabled:cursor-not-allowed disabled:opacity-35 dark:text-clienti-dark-100"
              disabled={!canMoveForward}
              onClick={() => onMonthChange(1)}
              type="button"
            >
              <ChevronRight className="size-4 stroke-[1.65]" aria-hidden="true" />
            </button>
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-100">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>Impossibile aggiornare il calendario.</span>
          </div>
        ) : null}

        {loading ? (
          <div className="clienti-glass-muted h-80 animate-pulse rounded-lg border" />
        ) : (
          <div className="grid gap-2">
            <div className="grid grid-cols-7 gap-1.5">
              {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((weekday) => (
                <div
                  className="py-1 text-center text-[0.58rem] font-light uppercase tracking-[0.08em] text-clienti-muted dark:text-clienti-dark-300/80"
                  key={weekday}
                >
                  {weekday}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((day) => (
                <CalendarDayButton
                  day={day}
                  key={day.ymd}
                  onSelectDate={onSelectDate}
                  selected={day.ymd === selectedDate}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <CalendarDayDialog
        activities={selectedActivities}
        date={selectedDate}
        onClose={onCloseDayDialog}
        open={dayDialogOpen}
        summary={selectedSummary}
      />
    </section>
  );
}

function CalendarDayButton({
  day,
  onSelectDate,
  selected,
}: {
  day: CalendarDay;
  onSelectDate: (ymd: string) => void;
  selected: boolean;
}) {
  const hasActivities = day.activities.length > 0;

  return (
    <button
      aria-label={`${formatYmdIt(day.ymd)}: ${day.activities.length} attività`}
      className={[
        "grid min-h-[3.55rem] content-between rounded-lg border px-1 py-1 text-left transition focus:outline-none focus:ring-4 focus:ring-clienti-primary/15 dark:focus:ring-clienti-dark-300/20",
        selected
          ? "border-clienti-primary bg-clienti-primary text-clienti-on-primary shadow-[0_10px_24px_rgba(8,56,34,0.18)] dark:border-clienti-dark-100 dark:bg-clienti-dark-100 dark:text-clienti-dark-950"
          : "border-[color:var(--clienti-glass-border)] bg-[var(--clienti-glass-muted)] text-clienti-text shadow-[0_6px_16px_rgba(5,31,32,0.06)] dark:text-clienti-dark-100",
        day.currentMonth ? "" : "opacity-45",
      ].join(" ")}
      onClick={() => onSelectDate(day.ymd)}
      type="button"
    >
      <span className="text-[0.82rem] font-light leading-none">{day.dayNumber}</span>
      {hasActivities ? (
        <span className="grid grid-cols-2 items-center gap-0.5">
          {day.summary.assigned > 0 ? <CalendarCount value={day.summary.assigned} variant="assigned" /> : null}
          {day.summary.inProgress > 0 ? <CalendarCount value={day.summary.inProgress} variant="progress" /> : null}
          {day.summary.completed > 0 ? <CalendarCount value={day.summary.completed} variant="completed" /> : null}
        </span>
      ) : (
        <span className="size-1 rounded-full bg-transparent" aria-hidden="true" />
      )}
    </button>
  );
}

function CalendarCount({ value, variant }: { value: number; variant: StatusGroup }) {
  const className =
    variant === "completed"
      ? "bg-clienti-status-completed-bg text-clienti-status-completed dark:bg-clienti-status-completed-dark-bg dark:text-clienti-status-completed-dark"
      : variant === "progress"
        ? "bg-clienti-status-progress-bg text-clienti-status-progress dark:bg-clienti-status-progress-dark-bg dark:text-clienti-status-progress-dark"
        : "bg-clienti-status-assigned-bg text-clienti-status-assigned dark:bg-clienti-status-assigned-dark-bg dark:text-clienti-status-assigned-dark";

  return <span className={`clienti-numeric inline-flex min-w-4 justify-center rounded-[0.22rem] px-1 text-[0.58rem] font-light leading-4 ${className}`}>{value}</span>;
}

function CalendarDayDialog({
  activities,
  date,
  onClose,
  open,
  summary,
}: {
  activities: CustomerTodayActivity[];
  date: string;
  onClose: () => void;
  open: boolean;
  summary: ActivitySummary;
}) {
  return (
    <Dialog open={open} onClose={onClose}>
      <div className="fixed inset-0 z-50 bg-clienti-950/35 backdrop-blur-sm dark:bg-clienti-dark-950/60" />
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <DialogPanel className="clienti-page-shell min-h-dvh px-4 pb-28 pt-4 text-clienti-text dark:text-clienti-dark-100">
          <div className="mx-auto grid w-full max-w-[460px] gap-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[0.72rem] font-light text-clienti-muted dark:text-clienti-dark-300">
                  {formatYmdIt(date)}
                </p>
                <DialogTitle className="font-display mt-1 text-[2rem] font-light leading-none">
                  Attività assegnate
                </DialogTitle>
              </div>

              <button
                aria-label="Chiudi attivitÃ  del giorno"
                className="clienti-glass inline-flex size-11 items-center justify-center rounded-full border text-clienti-primary focus:outline-none focus:ring-4 focus:ring-clienti-primary/15 dark:text-clienti-dark-100 dark:focus:ring-clienti-dark-300/20"
                data-autofocus
                onClick={onClose}
                type="button"
              >
                <X className="size-5 stroke-[1.55]" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <ReportMoonMetric label="Assegnate" value={summary.assigned} variant="assigned" />
              <ReportMoonMetric label="In corso" value={summary.inProgress} variant="progress" />
              <ReportMoonMetric label="Completate" value={summary.completed} variant="completed" />
            </div>

            {activities.length > 0 ? (
              <ul className="grid gap-3">
                {activities.map((activity) => (
                  <CalendarActivityItem activity={activity} key={activity.id} />
                ))}
              </ul>
            ) : (
              <div className="clienti-glass rounded-lg border px-4 py-10 text-center">
                <p className="text-base font-light text-clienti-text dark:text-clienti-dark-100">Nessuna attivitÃ  assegnata</p>
                <p className="mt-1 text-sm text-clienti-muted dark:text-clienti-dark-300/80">{formatYmdIt(date)}</p>
              </div>
            )}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

function CalendarActivityItem({ activity }: { activity: CustomerTodayActivity }) {
  const statusGroup = resolveStatusGroup(activity);
  const statusClasses = getStatusClasses(statusGroup);
  const title = activity.structure.nameFrontend?.trim() ?? "";

  return (
    <li className={`clienti-glass rounded-lg border p-3 ${statusClasses.card}`}>
      <div className="grid min-h-14 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3">
        <span className={`inline-flex size-10 items-center justify-center rounded-lg ${statusClasses.icon}`} aria-hidden="true">
          {statusGroup === "completed" ? (
            <CircleCheck className="size-5 stroke-[1.55]" />
          ) : statusGroup === "progress" ? (
            <LoaderCircle className="size-5 stroke-[1.55]" />
          ) : (
            <CalendarClock className="size-5 stroke-[1.55]" />
          )}
        </span>

        <h4 className="min-w-0 break-words text-[1rem] font-light leading-tight text-clienti-text dark:text-clienti-dark-100">
          {title}
        </h4>

        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[0.68rem] font-light ${statusClasses.badge}`}>
          {statusLabel(statusGroup)}
          <ChevronRight className="size-3.5 stroke-[1.65]" aria-hidden="true" />
        </span>
      </div>
    </li>
  );
}

function DailyBrief({
  completionPercent,
  dateLabel,
  loading,
}: {
  completionPercent: number;
  dateLabel: string;
  loading: boolean;
}) {
  const [counterPercent, setCounterPercent] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => {
    if (loading) {
      setCounterPercent(0);
      setProgressPercent(0);
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCounterPercent(completionPercent);
      setProgressPercent(completionPercent);
      return;
    }

    setCounterPercent(0);
    setProgressPercent(0);

    let animationFrame = 0;
    let startedAt = 0;

    const counterTimeout = window.setTimeout(() => {
      const animateCounter = (timestamp: number) => {
        if (startedAt === 0) {
          startedAt = timestamp;
        }

        const elapsed = timestamp - startedAt;
        const progress = Math.min(elapsed / COUNTER_ANIMATION_DURATION_MS, 1);
        const eased = 1 - (1 - progress) ** 3;
        setCounterPercent(Math.round(completionPercent * eased));

        if (progress < 1) {
          animationFrame = window.requestAnimationFrame(animateCounter);
        }
      };

      animationFrame = window.requestAnimationFrame(animateCounter);
    }, COUNTER_ANIMATION_DELAY_MS);

    const progressTimeout = window.setTimeout(() => {
      setProgressPercent(completionPercent);
    }, PROGRESS_ANIMATION_DELAY_MS);

    return () => {
      window.clearTimeout(counterTimeout);
      window.clearTimeout(progressTimeout);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [completionPercent, loading]);

  if (loading) {
    return (
      <section className="grid gap-4 pt-1" aria-label="Caricamento attività di oggi">
        <div className="clienti-glass-muted h-32 animate-pulse rounded-lg border" />
      </section>
    );
  }

  return (
    <section className="grid gap-4 pt-1" aria-labelledby="clienti-daily-title">
      <div className="grid gap-4 pb-1">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            {dateLabel ? (
              <p className="text-[0.78rem] font-light leading-4 text-clienti-muted dark:text-clienti-dark-300">
                {dateLabel}
              </p>
            ) : null}
            <h2
              className="clienti-today-title font-display mt-3 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-[2.35rem] font-light leading-none tracking-normal text-clienti-text dark:text-clienti-dark-100"
              id="clienti-daily-title"
            >
              <Sparkles className="size-5 shrink-0 stroke-[1.35] text-clienti-primary dark:text-clienti-dark-300" aria-hidden="true" />
              <span className="clienti-today-title-text">Attività di oggi</span>
            </h2>
          </div>

          <div className="clienti-progress-metric min-w-[5.25rem] shrink-0 pt-8 text-right">
            <p className="text-[0.62rem] font-light leading-3 text-clienti-muted dark:text-clienti-dark-300/80">Completate</p>
            <p className="mt-1 whitespace-nowrap text-clienti-text dark:text-clienti-dark-100">
              <span className="clienti-numeric font-display text-[3.65rem] font-extralight leading-none tracking-normal">{counterPercent}</span>
              <span className="ml-0.5 align-[0.6em] text-[1rem] font-extralight leading-none">%</span>
            </p>
          </div>
        </div>

        <div className="h-2 rounded-full bg-clienti-track dark:bg-clienti-dark-800">
          <div
            className="clienti-progress-fill h-full rounded-full bg-clienti-primary transition-[width] ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-clienti-dark-300"
            style={{ transitionDuration: `${PROGRESS_ANIMATION_DURATION_MS}ms`, width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </section>
  );
}

function ActivitySkeleton() {
  return (
    <div className="grid gap-3">
      <div className="clienti-glass-muted h-36 animate-pulse rounded-lg border" />
      <div className="clienti-glass-muted h-36 animate-pulse rounded-lg border" />
      <div className="clienti-glass-muted h-36 animate-pulse rounded-lg border" />
    </div>
  );
}

function ActivityItem({ activity, index }: { activity: CustomerTodayActivity; index: number }) {
  const statusGroup = resolveStatusGroup(activity);
  const statusClasses = getStatusClasses(statusGroup);
  const title = activity.structure.nameFrontend?.trim() ?? "";

  return (
    <li
      className={`clienti-activity-item clienti-glass rounded-lg border p-3 ${statusClasses.card}`}
      style={{ animationDelay: `${ACTIVITY_ANIMATION_START_MS + index * ACTIVITY_ANIMATION_STAGGER_MS}ms` }}
    >
      <div className="grid min-h-14 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3">
        <span className={`inline-flex size-10 items-center justify-center rounded-lg ${statusClasses.icon}`} aria-hidden="true">
          {statusGroup === "completed" ? (
            <CircleCheck className="size-5 stroke-[1.55]" />
          ) : statusGroup === "progress" ? (
            <LoaderCircle className="size-5 stroke-[1.55]" />
          ) : (
            <CalendarClock className="size-5 stroke-[1.55]" />
          )}
        </span>

        <h3 className="min-w-0 break-words text-[1rem] font-light leading-tight text-clienti-text dark:text-clienti-dark-100">
          {title}
        </h3>

        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[0.68rem] font-light ${statusClasses.badge}`}>
          {statusLabel(statusGroup)}
          <ChevronRight className="size-3.5 stroke-[1.65]" aria-hidden="true" />
        </span>
      </div>
    </li>
  );
}

function buildSummary(activities: CustomerTodayActivity[]): ActivitySummary {
  const summary: ActivitySummary = {
    assigned: 0,
    inProgress: 0,
    completed: 0,
  };

  for (const activity of activities) {
    summary.assigned += 1;
    if (isActivityInProgress(activity)) summary.inProgress += 1;
    if (isActivityCompleted(activity)) summary.completed += 1;
  }

  return summary;
}

function getPendingActivityCount(summary: ActivitySummary): number {
  return Math.max(summary.assigned - summary.inProgress - summary.completed, 0);
}

function isVisibleActivity(activity: CustomerTodayActivity): boolean {
  return (activity.cleanedByUs ?? 0) > 0;
}

function isActivityInProgress(activity: CustomerTodayActivity): boolean {
  return (
    activity.startwork === 1 &&
    activity.startworkAt !== null &&
    activity.startreport === 0 &&
    activity.startreportAt === null
  );
}

function isActivityCompleted(activity: CustomerTodayActivity): boolean {
  return (
    activity.startwork === 1 &&
    activity.startworkAt !== null &&
    activity.startreport === 1 &&
    activity.startreportAt !== null
  );
}

function resolveStatusGroup(activity: CustomerTodayActivity): StatusGroup {
  if (isActivityCompleted(activity)) return "completed";
  if (isActivityInProgress(activity)) return "progress";
  return "assigned";
}

function statusLabel(statusGroup: StatusGroup): string {
  if (statusGroup === "completed") return "Completata";
  if (statusGroup === "progress") return "In corso";
  return "Assegnata";
}

function getStatusAccentClass(statusGroup: StatusGroup): string {
  if (statusGroup === "completed") return "bg-clienti-status-completed";
  if (statusGroup === "progress") return "bg-clienti-status-progress";
  return "bg-clienti-status-assigned";
}

function getReportPercent(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function getReportMetricClasses(statusGroup: StatusGroup): string {
  if (statusGroup === "completed") {
    return "bg-clienti-status-completed-bg text-clienti-status-completed dark:bg-clienti-status-completed-dark-bg dark:text-clienti-status-completed-dark";
  }

  if (statusGroup === "progress") {
    return "bg-clienti-status-progress-bg text-clienti-status-progress dark:bg-clienti-status-progress-dark-bg dark:text-clienti-status-progress-dark";
  }

  return "bg-clienti-status-assigned-bg text-clienti-status-assigned dark:bg-clienti-status-assigned-dark-bg dark:text-clienti-status-assigned-dark";
}

function getStatusClasses(statusGroup: StatusGroup): { badge: string; card: string; icon: string } {
  if (statusGroup === "completed") {
    return {
      badge: "bg-clienti-status-completed-bg text-clienti-status-completed dark:bg-clienti-status-completed-dark-bg dark:text-clienti-status-completed-dark",
      card: "border-clienti-status-completed/55 dark:border-clienti-status-completed-dark/45",
      icon: "bg-clienti-status-completed-bg text-clienti-status-completed dark:bg-clienti-status-completed-dark-bg dark:text-clienti-status-completed-dark",
    };
  }

  if (statusGroup === "progress") {
    return {
      badge: "bg-clienti-status-progress-bg text-clienti-status-progress dark:bg-clienti-status-progress-dark-bg dark:text-clienti-status-progress-dark",
      card: "border-clienti-status-progress/55 dark:border-clienti-status-progress-dark/45",
      icon: "bg-clienti-status-progress-bg text-clienti-status-progress dark:bg-clienti-status-progress-dark-bg dark:text-clienti-status-progress-dark",
    };
  }

  return {
    badge: "bg-clienti-status-assigned-bg text-clienti-status-assigned dark:bg-clienti-status-assigned-dark-bg dark:text-clienti-status-assigned-dark",
    card: "border-clienti-status-assigned/55 dark:border-clienti-status-assigned-dark/45",
    icon: "bg-clienti-status-assigned-bg text-clienti-status-assigned dark:bg-clienti-status-assigned-dark-bg dark:text-clienti-status-assigned-dark",
  };
}

function buildCalendarDays(monthKey: string, activities: CustomerTodayActivity[]): CalendarDay[] {
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10));
  const firstOfMonth = new Date(year, month - 1, 1);
  const calendarStart = new Date(firstOfMonth);
  const mondayBasedDay = (firstOfMonth.getDay() + 6) % 7;
  calendarStart.setDate(firstOfMonth.getDate() - mondayBasedDay);

  const activityMap = new Map<string, CustomerTodayActivity[]>();
  for (const activity of activities) {
    if (!activity.checkout) continue;
    const dayActivities = activityMap.get(activity.checkout) ?? [];
    dayActivities.push(activity);
    activityMap.set(activity.checkout, dayActivities);
  }

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    const ymd = getLocalYmd(date);
    const dayActivities = activityMap.get(ymd) ?? [];

    return {
      activities: dayActivities,
      currentMonth: getMonthKeyFromYmd(ymd) === monthKey,
      dayNumber: date.getDate(),
      summary: buildSummary(dayActivities),
      ymd,
    };
  });
}

function getCalendarMonthRange(monthKey: string): { startDate: string; endDate: string } {
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10));
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);

  return {
    startDate: getLocalYmd(start),
    endDate: getLocalYmd(end),
  };
}

function addMonthsToMonthKey(monthKey: string, months: number): string {
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(year, month - 1 + months, 1);

  return getMonthKeyFromYmd(getLocalYmd(date));
}

function getCalendarMonthBounds(): { minMonth: string; maxMonth: string } {
  const currentMonth = getMonthKeyFromYmd(getLocalYmd(new Date()));

  return {
    minMonth: addMonthsToMonthKey(currentMonth, -CALENDAR_MONTHS_BACK),
    maxMonth: addMonthsToMonthKey(currentMonth, CALENDAR_MONTHS_FORWARD),
  };
}

function compareMonthKeys(first: string, second: string): number {
  return first.localeCompare(second);
}

function isMonthKeyInRange(monthKey: string, minMonth: string, maxMonth: string): boolean {
  return compareMonthKeys(monthKey, minMonth) >= 0 && compareMonthKeys(monthKey, maxMonth) <= 0;
}

function getPreferredCalendarDate(range: { startDate: string; endDate: string }, todayYmd: string | undefined): string {
  return todayYmd && isYmdInRange(todayYmd, range.startDate, range.endDate) ? todayYmd : range.startDate;
}

function isYmdInRange(ymd: string, startDate: string, endDate: string): boolean {
  return ymd >= startDate && ymd <= endDate;
}

function canShowDailySplash(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const today = getLocalYmd(new Date());
    const lastSplashDate = window.localStorage.getItem(DAILY_SPLASH_STORAGE_KEY);

    return lastSplashDate !== today;
  } catch {
    return true;
  }
}

function markDailySplashSeen(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(DAILY_SPLASH_STORAGE_KEY, getLocalYmd(new Date()));
  } catch {
  }
}

function getLocalYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getMonthKeyFromYmd(ymd: string): string {
  return ymd.slice(0, 7);
}

function formatMonthLabelIt(monthKey: string): string {
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10));
  const value = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatYmdIt(ymd: string | null): string {
  if (!ymd) return "";
  const [year, month, day] = ymd.split("-");
  return year && month && day ? `${day}/${month}/${year}` : "";
}
