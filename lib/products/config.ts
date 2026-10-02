import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

export const HUES = ["amber", "violet", "blue", "green", "rose", "teal"] as const;
export type Hue = (typeof HUES)[number];

/** News sites keep Preferred Sources in their AEO score; every other site is a product site. */
export const PRODUCT_KINDS = ["news", "product"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

const SC_DOMAIN = "sc-domain:";

/** Search Console property: `sc-domain:example.com` or a URL prefix ending in "/". */
function isSearchConsoleProperty(value: string): boolean {
  if (value.startsWith(SC_DOMAIN)) return /^[a-z0-9.-]+$/i.test(value.slice(SC_DOMAIN.length));
  if (!URL.canParse(value)) return false;
  return /^https?:$/.test(new URL(value).protocol) && value.endsWith("/");
}

const productSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "id must be a lowercase slug (a-z, 0-9, -)"),
  name: z.string().trim().min(1, "name must not be empty"),
  url: z.url({ protocol: /^https?$/, message: "url must be an http(s) URL" }),
  hue: z.enum(HUES, { message: `hue must be one of: ${HUES.join(", ")}` }),
  kind: z
    .enum(PRODUCT_KINDS, { message: `kind must be one of: ${PRODUCT_KINDS.join(", ")}` })
    .default("product"),
  searchConsoleProperty: z
    .string()
    .refine(isSearchConsoleProperty, {
      message:
        'searchConsoleProperty must be "sc-domain:example.com" or an http(s) URL prefix ending in "/"',
    })
    .optional(),
});

// Sent to the agent as a first name only, so keep it to name characters. The messages never
// repeat the value: a name is personal data and must not reach a log.
const ownerNameSchema = z
  .string()
  .trim()
  .min(1, "ownerName must not be empty")
  .max(40, "ownerName must be at most 40 characters")
  .regex(
    /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u,
    "ownerName may only use letters, spaces, apostrophes, dots and hyphens",
  );

const configSchema = z.object({
  ownerName: ownerNameSchema.optional(),
  products: z
    .array(productSchema)
    .min(1, "list at least one product")
    .max(12, "list at most 12 products")
    .superRefine((products, ctx) => {
      const seen = new Set<string>();
      for (const [index, { id }] of products.entries()) {
        if (seen.has(id)) {
          ctx.addIssue({ code: "custom", message: `Duplicate product id "${id}"`, path: [index] });
        }
        seen.add(id);
      }
    }),
});

const DEFAULT_CONFIG_PATH = "./harbour.config.json";

export type ProductConfig = z.infer<typeof configSchema>;
export type LoadedProductConfig = ProductConfig & { demo: boolean };

/** Validates a parsed product config; throws a readable zod message when invalid. */
export function parseProductConfig(raw: unknown): ProductConfig {
  const result = configSchema.safeParse(raw);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
}

/** The owner's first name, for the daily note's greeting; null when no name is configured. */
export function ownerFirstName(ownerName: string | undefined): string | null {
  // The schema has already trimmed it.
  return ownerName?.split(/\s+/)[0] || null;
}

function readConfigFile(path: string): ProductConfig {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read product config ${path}: ${reason}`);
  }
  try {
    return parseProductConfig(JSON.parse(text));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid product config in ${path}:\n${reason}`);
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Reads `path`, or returns undefined only when the file does not exist. */
function readIfPresent(path: string): ProductConfig | undefined {
  try {
    readFileSync(path);
  } catch (error) {
    if (isNotFound(error)) return undefined;
  }
  return readConfigFile(path);
}

/**
 * Loads the owner's product config. An explicit `configuredPath` must be readable (no
 * fallback). Without one, `./harbour.config.json` is used, and only if it does not exist
 * does Harbour fall back to the committed example. `demo` is true iff the example is used.
 * Invalid files always throw so mistakes are never silently masked.
 */
export function loadProductConfig(
  configuredPath: string | undefined,
  examplePath: string,
  defaultPath: string = DEFAULT_CONFIG_PATH,
): LoadedProductConfig {
  const demoFor = (path: string) => resolve(path) === resolve(examplePath);
  if (configuredPath !== undefined) {
    return { demo: demoFor(configuredPath), ...readConfigFile(configuredPath) };
  }
  const local = readIfPresent(defaultPath);
  if (local) return { demo: false, ...local };
  return { demo: true, ...readConfigFile(examplePath) };
}
