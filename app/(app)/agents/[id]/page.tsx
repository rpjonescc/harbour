import Link from "next/link";
import { notFound } from "next/navigation";
import { RunActivity } from "@/components/agents/RunActivity";
import { jobLabel } from "@/lib/agents/view";
import { requireSession } from "@/lib/auth/guard";
import { brainHref } from "@/lib/brain/wikilinks";
import { getDb } from "@/lib/db/client";
import { eventsSince, getAgentRun, getJob } from "@/lib/jobs/queue";
import { getNamedProducts } from "@/lib/products/catalog";

const iso = (date: Date | null) => (date ? date.toISOString() : null);

export default async function AgentRunPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const id = Number((await params).id);
  const db = getDb();
  const job = Number.isInteger(id) ? getJob(db, id) : undefined;
  if (!job) notFound();
  const label = jobLabel(job, getNamedProducts());
  const events = eventsSince(db, id, 0).map((event) => ({ ...event, at: event.at.toISOString() }));
  const run = getAgentRun(db, id);
  const files = run?.commitSha ? (run.filesChanged ?? []) : [];
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/agents" className="text-sm text-accent hover:underline">
          ← Back to agents
        </Link>
        <h1 className="font-serif text-3xl">{label}</h1>
      </header>
      <RunActivity
        job={{
          id,
          kind: job.kind,
          status: job.status,
          error: job.error,
          label,
          createdAt: job.createdAt.toISOString(),
          startedAt: iso(job.startedAt),
          finishedAt: iso(job.finishedAt),
        }}
        events={events}
      />
      {files.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-serif text-xl">Files changed</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {files.map((path) => (
              <li key={path}>
                <Link href={brainHref(path)} className="text-accent hover:underline">
                  {path}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
