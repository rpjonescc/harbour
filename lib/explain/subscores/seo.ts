import { plural } from "@/lib/scan/scoring/sub-score";
import { numbersIn, type SubScoreExplanation } from "./entry";

function technical(evidence: string): string | null {
  const pages = numbersIn(evidence, /^(?<crawled>\d+) pages crawled, (?<ok>\d+) answered 2xx\./, [
    "crawled",
    "ok",
  ]);
  if (!pages) return null;
  const loaded = `${pages.ok} of ${pages.crawled} ${plural(pages.crawled, "page")} Harbour visited loaded properly`;
  const broken = numbersIn(
    evidence,
    /(?<linking>\d+) of \d+ pages links? to a broken internal page/,
    ["linking"],
  );
  if (!broken) return `${loaded}.`;
  if (broken.linking === 0) return `${loaded}, with no links to missing pages.`;
  return `${loaded}, and ${broken.linking} ${plural(broken.linking, "links", "link")} to a page that's missing.`;
}

function indexability(evidence: string): string | null {
  if (evidence.includes("robots.txt blocks Googlebot")) {
    return "Your robots.txt file tells Google to stay out of your site.";
  }
  const allowed = evidence.includes("Googlebot allowed");
  const sitemap = numbersIn(evidence, /Sitemap valid \((?:at least )?(?<urls>\d+) URLs?\)/, [
    "urls",
  ]);
  if (sitemap && allowed) {
    const listed = `Google is allowed in and your sitemap lists ${sitemap.urls} ${plural(sitemap.urls, "page")}`;
    const reach = numbersIn(
      evidence,
      /(?<ok>\d+) of (?<crawled>\d+) crawled sitemap URLs answered 2xx/,
      ["ok", "crawled"],
    );
    return reach
      ? `${listed}; ${reach.ok} of the ${reach.crawled} Harbour tried loaded properly.`
      : `${listed}.`;
  }
  if (/No sitemap found|Sitemap invalid|Sitemap listed but answers/.test(evidence)) {
    return allowed
      ? "Google is allowed in, but your sitemap is missing or broken."
      : "Your sitemap is missing or broken.";
  }
  return null;
}

function speed(evidence: string): string | null {
  const lab = numbersIn(evidence, /mobile performance (?<score>\d+)/, ["score"]);
  if (lab) return `Google's speed test gives your home page ${lab.score} out of 100 on a phone.`;
  const field = numbersIn(evidence, /field INP (?<ms>\d+) ms/, ["ms"]);
  return field
    ? `Real visitors wait about ${field.ms} milliseconds for the page to respond to a tap.`
    : null;
}

function searchTrend(evidence: string): string | null {
  if (evidence.startsWith("No impressions in the last 28 days")) {
    return "Google hasn't shown your pages in search for the last 28 days.";
  }
  // The scorer writes the change as "(+18.0%)" or, with a real minus sign, "(−20.0%)".
  const change = /\((?<sign>[+−])(?<percent>\d+(?:\.\d+)?)%\)/.exec(evidence)?.groups;
  if (!change?.sign || !change.percent) return null;
  const percent = Math.round(Number(change.percent));
  if (percent === 0) return "Google showed your pages about as often as in the 28 days before.";
  const way = change.sign === "+" ? "more" : "less";
  return `Google showed your pages ${percent}% ${way} often than in the 28 days before.`;
}

/** The SEO sub-scores of the current formula (lib/scan/scoring/seo.ts), in plain words. */
export const SEO_EXPLANATIONS: readonly SubScoreExplanation[] = [
  {
    key: "seo.technical",
    name: "Page health",
    parts: {
      what:
        "Whether your pages load properly and have the basics Google looks for: a clear title, a " +
        "short description, one main heading, a note naming the page's real address (a canonical " +
        "link) and no hidden “don't list me” tag. Links to missing pages count against it.",
      why:
        "Google reads these basics to understand each page and choose what to show in results. " +
        "Missing pieces make a page harder to rank, and links to missing pages waste visitors' time.",
      todo:
        "Work through the matching suggestions on the Actions board: add missing titles and " +
        "descriptions, fix or remove links to missing pages, and keep one main heading per page.",
      worth:
        "Each fix is usually a few minutes' work, and it helps every search that page could turn up in.",
    },
    summarise: technical,
  },
  {
    key: "seo.indexability",
    name: "Google can get in",
    parts: {
      what:
        "Whether Google is allowed to visit your site and can find a list of your pages. Harbour " +
        "checks your robots.txt file (the rules for visiting programs), your sitemap (the list of " +
        "your pages) and whether the pages on that list actually load.",
      why: "If Google is told to stay out, or can't find your pages, they won't show up in search at all.",
      todo:
        "Make sure robots.txt lets Google in, publish a sitemap at the usual address, and take " +
        "out addresses that no longer work.",
      worth: "It's the front door. Once it's right, everything else you do can be found.",
    },
    summarise: indexability,
  },
  {
    key: "seo.cwv",
    name: "Speed on phones",
    parts: {
      what:
        "How quickly your home page loads and responds on a mobile phone, from Google's own speed " +
        "test (PageSpeed) and, where Google has it, the experience of real visitors.",
      why:
        "Google prefers pages that feel quick, and people give up on slow pages before they " +
        "finish loading.",
      todo:
        "Shrink large images, remove scripts you don't need, and look at the slowest parts in the " +
        "PageSpeed report. Your web developer or Claude can help with most of these.",
      worth:
        "A faster site keeps more of the visitors you already get, as well as helping you rank.",
    },
    summarise: speed,
  },
  {
    key: "seo.searchTrend",
    name: "Showing up more often",
    parts: {
      what:
        "Whether Google showed your pages in search results more or less often in the last 28 " +
        "days than in the 28 days before, from Google Search Console.",
      why:
        "It's the clearest early sign of whether your work is paying off in search, before " +
        "clicks catch up.",
      todo:
        "If it's falling, check which pages and searches dropped in Search Console and freshen " +
        "those pages. If it's rising, keep doing what you're doing.",
      worth:
        "It tells you early whether you're heading the right way, so you can adjust before visits drop.",
    },
    summarise: searchTrend,
  },
];
