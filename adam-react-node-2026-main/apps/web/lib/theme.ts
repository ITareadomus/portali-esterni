export const THEME_COOKIE_NAME = "adam_theme";
export const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
export const DEFAULT_THEME = "light";

export const THEMES = ["light", "dark"] as const;

export type ThemeName = (typeof THEMES)[number];

export const THEME_BROWSER_COLORS: Record<ThemeName, string> = {
  light: "#e7efea",
  dark: "#0b2b26",
};

export function isThemeName(value: unknown): value is ThemeName {
  return value === "light" || value === "dark";
}

export function resolveThemeName(value: string | null | undefined): ThemeName {
  return isThemeName(value) ? value : DEFAULT_THEME;
}
