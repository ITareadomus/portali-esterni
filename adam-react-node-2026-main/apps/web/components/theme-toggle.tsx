"use client";

import { Switch } from "@headlessui/react";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { setThemeAction } from "@/lib/theme-actions";
import { THEME_BROWSER_COLORS, type ThemeName } from "@/lib/theme";

type ThemeToggleProps = {
  className?: string;
  initialTheme: ThemeName;
  shape?: "default" | "pillow";
};

export function ThemeToggle({ className = "", initialTheme, shape = "default" }: ThemeToggleProps) {
  const [theme, setTheme] = useState<ThemeName>(initialTheme);
  const [isPending, startTransition] = useTransition();
  const isDark = theme === "dark";
  const label = isDark ? "Passa al tema chiaro" : "Passa al tema scuro";
  const trackShapeClass = shape === "pillow" ? "rounded-full" : "rounded-lg";
  const knobShapeClass = shape === "pillow" ? "rounded-full" : "rounded-md";

  useEffect(() => {
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, [initialTheme]);

  function handleChange(checked: boolean) {
    const nextTheme: ThemeName = checked ? "dark" : "light";
    const previousTheme = theme;

    setTheme(nextTheme);
    applyTheme(nextTheme);

    startTransition(() => {
      void setThemeAction(nextTheme).catch(() => {
        setTheme(previousTheme);
        applyTheme(previousTheme);
      });
    });
  }

  return (
    <Switch
      aria-label={label}
      checked={isDark}
      className={[
        "clienti-glass-muted group relative inline-flex h-10 w-[76px] shrink-0 items-center border p-1 text-clienti-primary transition",
        trackShapeClass,
        "hover:border-clienti-primary/50 focus:outline-none focus:ring-4 focus:ring-clienti-primary/15 disabled:cursor-not-allowed disabled:opacity-60",
        "dark:text-clienti-dark-100 dark:hover:border-clienti-dark-300/50 dark:focus:ring-clienti-dark-300/20",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={isPending}
      onChange={handleChange}
    >
      <span className="pointer-events-none absolute left-3 text-clienti-primary transition group-data-checked:text-clienti-dark-300">
        <Sun className="size-4" aria-hidden="true" />
      </span>
      <span className="pointer-events-none absolute right-3 text-clienti-muted transition group-data-checked:text-clienti-dark-950">
        <Moon className="size-4" aria-hidden="true" />
      </span>
      <span className={`pointer-events-none relative z-10 inline-flex size-8 translate-x-0 items-center justify-center ${knobShapeClass} bg-clienti-primary text-clienti-on-primary shadow-sm transition group-data-checked:translate-x-9 group-data-checked:bg-clienti-dark-300 group-data-checked:text-clienti-dark-950`} />
    </Switch>
  );
}

function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;

  const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  themeColorMeta?.setAttribute("content", THEME_BROWSER_COLORS[theme]);
}
