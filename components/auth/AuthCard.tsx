import type { ReactNode } from "react";
import { Panel } from "@/components/ui/Panel";

/** Centred card used by the login and setup pages. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <Panel className="w-full max-w-sm p-8">
        <p className="font-serif text-lg">Harbour</p>
        <h1 className="mt-6 font-serif text-2xl">{title}</h1>
        <div className="mt-6">{children}</div>
      </Panel>
    </main>
  );
}
