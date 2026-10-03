import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { requireSession } from "@/lib/auth/guard";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <div className="min-h-screen md:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <Sidebar theme={theme} />
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
        {children}
      </main>
    </div>
  );
}
