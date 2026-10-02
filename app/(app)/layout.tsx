import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { Wave } from "@/components/shell/Wave";
import { requireSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const warm = getConfig().HARBOUR_PERSONALITY === "warm";
  return (
    <>
      {warm && <Wave />}
      <div className="relative z-10 flex min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <Sidebar theme={theme} />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-10 py-8">
          {children}
        </main>
      </div>
    </>
  );
}
