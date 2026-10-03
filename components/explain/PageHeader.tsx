import type { ReactNode } from "react";
import { LightMark } from "@/components/tower/StatusLight";
import type { PageId } from "@/lib/explain/page-help";
import type { PageVerdict } from "@/lib/explain/page-verdict";
import { PageHelp } from "./PageHelp";

type Props = {
  title: ReactNode;
  /** One plain line (or a few short blocks) under the title. */
  intro?: ReactNode;
  page: PageId;
  /** The page's one-line verdict from real data: is it OK, what needs you, what is happening. */
  verdict?: PageVerdict;
  /** Controls shown at the right, before "What's this page?" (Check now, search). */
  children?: ReactNode;
  /** Gives the h1 an id and makes it focusable, for pages that move focus back to it. */
  titleId?: string;
  /** 2 when the header is an example inside another page, such as /design. */
  titleLevel?: 1 | 2;
};

/**
 * Every page's header: the h1, the page's verdict, an optional intro, and "What's this page?" at
 * the right.
 */
export function PageHeader({
  title,
  intro,
  page,
  verdict,
  children,
  titleId,
  titleLevel = 1,
}: Props) {
  const Title = titleLevel === 1 ? "h1" : "h2";
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-64">
        <Title id={titleId} tabIndex={titleId ? -1 : undefined} className="font-serif text-3xl">
          {title}
        </Title>
        {verdict && (
          <p data-page-verdict className="mt-2 flex items-start gap-2 text-lg text-ink">
            <span className="flex h-7 items-center">
              <LightMark tone={verdict.tone} />
            </span>
            <span>{verdict.text}</span>
          </p>
        )}
        {intro && (
          <div data-page-intro className="mt-1 flex flex-col gap-1 text-sm text-ink-muted">
            {intro}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <PageHelp page={page} />
      </div>
    </header>
  );
}
