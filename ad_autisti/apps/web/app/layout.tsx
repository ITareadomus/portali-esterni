import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from "next/font/google";
import { getRequestTheme } from "@/lib/theme-server";
import { THEME_BROWSER_COLORS } from "@/lib/theme";
import "./globals.css";

const clientiSans = IBM_Plex_Sans({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-clienti-sans",
  weight: ["300", "400", "500", "600"],
});

const clientiDisplay = IBM_Plex_Sans_Condensed({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-clienti-condensed",
  weight: ["200", "300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "WASS - Autisti",
  description: "WASS - Autisti",
};

export async function generateViewport(): Promise<Viewport> {
  const theme = await getRequestTheme();

  return {
    colorScheme: theme,
    themeColor: THEME_BROWSER_COLORS[theme],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getRequestTheme();

  return (
    <html lang="en" className={`${clientiSans.variable} ${clientiDisplay.variable}`} data-theme={theme} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
