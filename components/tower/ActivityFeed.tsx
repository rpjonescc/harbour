import Link from "next/link";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { type LightTone, SECTION_TITLES } from "@/lib/explain/tower";
import { FEED_TEXT } from "@/lib/explain/tower-tiles";
import { FEED_CAP, type ActivityFeed as Feed, type FeedItem } from "@/lib/tower/activity";
import type { TileResult } from "@/lib/tower/load-tile";
import { TILE_LINK } from "./link-styles";
import { LightMark } from "./StatusLight";
import { TileFailed } from "./TileFailed";
import { TowerSection } from "./TowerSection";

/** Calm marks: a failure is worth a look (a triangle), never an alarm. */
const MARK: Readonly<Record<FeedItem["kind"], LightTone>> = {
  running: "busy",
  win: "ok",
  finished: "ok",
  failed: "watch",
};

function FeedRow({ item }: { item: FeedItem }) {
  return (
    <li
      className={`flex items-start gap-2 rounded-sm px-1 py-1 text-sm text-ink${item.isNew ? " tower-new" : ""}`}
    >
      <span className="flex h-5 items-center">
        <LightMark tone={MARK[item.kind]} />
      </span>
      <span className="min-w-0 flex-1">
        {item.href ? (
          <Link href={item.href} className={TILE_LINK}>
            {item.sentence}
          </Link>
        ) : (
          item.sentence
        )}{" "}
        <span className="whitespace-nowrap text-xs text-ink-muted">{item.ago}</span>
        {item.kind === "win" && (
          <>
            {" "}
            <Tag tone="good">{FEED_TEXT.win}</Tag>
          </>
        )}
        {item.isNew && (
          <>
            {" "}
            <Tag>{FEED_TEXT.isNew}</Tag>
          </>
        )}
      </span>
    </li>
  );
}

function Group({ title, items, none }: { title: string; items: FeedItem[]; none: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-medium text-ink-muted">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">{none}</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => (
            <FeedRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** The jobs' names as the Agents page and the queue know them: codes stay out of the feed's face. */
function JobNames({ items }: { items: FeedItem[] }) {
  const named = items.filter((item) => item.technical !== null);
  if (named.length === 0) return null;
  return (
    <TechnicalDetails id="tower-activity" topic={FEED_TEXT.technicalTopic}>
      <ul className="flex flex-col gap-1 font-mono text-ink-muted">
        {named.map((item) => (
          <li key={item.id}>{item.technical}</li>
        ))}
      </ul>
    </TechnicalDetails>
  );
}

function FeedPanel({ feed }: { feed: Feed }) {
  if (feed.empty !== null) {
    return (
      <Panel className="p-4">
        <p className="text-sm text-ink">{feed.empty}</p>
      </Panel>
    );
  }
  const running = feed.running.slice(0, FEED_CAP);
  const more = feed.more + feed.running.length - running.length;
  return (
    <Panel className="flex flex-col gap-4 p-4">
      <Group title={FEED_TEXT.running} items={running} none={FEED_TEXT.nothingRunning} />
      <Group title={FEED_TEXT.finished} items={feed.finished} none={FEED_TEXT.nothingFinished} />
      {more > 0 && (
        <p className="text-sm">
          <Link href="/agents" className={TILE_LINK}>
            {FEED_TEXT.more(more)}
          </Link>
        </p>
      )}
      <JobNames items={[...running, ...feed.finished]} />
    </Panel>
  );
}

/** What are the agents and jobs doing, and what finished? Running now, then wins first. */
export function ActivityFeed({ result, anchor }: { result: TileResult<Feed>; anchor?: string }) {
  return (
    <TowerSection section="activity" anchor={anchor}>
      {result.ok ? (
        <FeedPanel feed={result.data} />
      ) : (
        <TileFailed tile={SECTION_TITLES.activity} detail={result.detail} />
      )}
    </TowerSection>
  );
}
