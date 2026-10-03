import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Wave } from "@/components/shell/Wave";
import { BRAND } from "@/design/brand";
import { getConfig } from "@/lib/config";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Harbour",
  applicationName: BRAND.name,
  description: "Home control centre",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: BRAND.theme };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const warm = getConfig().HARBOUR_PERSONALITY === "warm";
  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${inter.variable} ${newsreader.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-screen bg-bg text-ink">
        {/* The ocean background on every page, signed in or not; content sits above it. */}
        {warm && <Wave />}
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
