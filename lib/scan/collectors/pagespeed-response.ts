import { z } from "zod";
import { parseJson } from "./google-api";

/** The `cwv` observation: Lighthouse lab metrics (mobile) plus field INP when Google has it. */
export type CoreWebVitals = {
  /** Lighthouse performance score, 0–100; null when Lighthouse gave none. */
  performanceScore: number | null;
  lcpMs: number | null;
  /** Field (Chrome UX Report) p75 INP for the URL, or its origin; null without field data. */
  inpMs: number | null;
  cls: number | null;
  fcpMs: number | null;
  tbtMs: number | null;
  fieldDataAvailable: boolean;
};

const audit = z.object({ numericValue: z.number().optional() }).optional();

const fieldData = z
  .object({ metrics: z.record(z.string(), z.object({ percentile: z.number() })).optional() })
  .optional();

// Only the parts of a PSI v5 runPagespeed response we read; everything else is ignored.
const psiResult = z.object({
  loadingExperience: fieldData,
  lighthouseResult: z.object({
    runtimeError: z.object({ code: z.string(), message: z.string() }).optional(),
    categories: z.object({
      performance: z.object({ score: z.number().min(0).max(1).nullable() }),
    }),
    audits: z
      .object({
        "largest-contentful-paint": audit,
        "cumulative-layout-shift": audit,
        "first-contentful-paint": audit,
        "total-blocking-time": audit,
      })
      .default({}),
  }),
});

const roundedMs = (value: number | undefined) => (value === undefined ? null : Math.round(value));

/** Core Web Vitals from a runPagespeed response body; throws a readable Error otherwise. */
export function readCoreWebVitals(body: string): CoreWebVitals {
  const parsed = psiResult.safeParse(parseJson(body));
  if (!parsed.success) throw new Error("PageSpeed Insights returned an unexpected response");
  const { lighthouseResult: lighthouse, loadingExperience } = parsed.data;
  const { runtimeError } = lighthouse;
  if (runtimeError) {
    throw new Error(
      `Lighthouse could not analyse the page (${runtimeError.code}): ${runtimeError.message}`,
    );
  }
  const metrics = loadingExperience?.metrics ?? {};
  const score = lighthouse.categories.performance.score;
  const audits = lighthouse.audits;
  return {
    performanceScore: score === null ? null : Math.round(score * 100),
    lcpMs: roundedMs(audits["largest-contentful-paint"]?.numericValue),
    inpMs: roundedMs(metrics.INTERACTION_TO_NEXT_PAINT?.percentile),
    cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
    fcpMs: roundedMs(audits["first-contentful-paint"]?.numericValue),
    tbtMs: roundedMs(audits["total-blocking-time"]?.numericValue),
    fieldDataAvailable: Object.keys(metrics).length > 0,
  };
}
