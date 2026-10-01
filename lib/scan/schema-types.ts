const LOCAL_BUSINESS = [
  "LocalBusiness",
  "Store",
  "Restaurant",
  "FoodEstablishment",
  "ProfessionalService",
  "MedicalBusiness",
  "HomeAndConstructionBusiness",
] as const;

/**
 * The schema.org types the readiness checks report, each with the common subtypes that count
 * as it (a LocalBusiness is also an Organization; a Recipe is a HowTo).
 */
export const SCHEMA_FAMILIES = {
  Organization: ["Organization", "Corporation", "NGO", "OnlineBusiness", ...LOCAL_BUSINESS],
  WebSite: ["WebSite"],
  LocalBusiness: LOCAL_BUSINESS,
  FAQPage: ["FAQPage"],
  HowTo: ["HowTo", "Recipe"],
  Article: ["Article", "BlogPosting", "NewsArticle", "TechArticle", "ScholarlyArticle", "Report"],
} as const satisfies Record<string, readonly string[]>;

export type SchemaFamily = keyof typeof SCHEMA_FAMILIES;

/** Whether any of `types` is `family` or one of its subtypes. */
export function hasSchemaFamily(types: readonly string[], family: SchemaFamily): boolean {
  const members: readonly string[] = SCHEMA_FAMILIES[family];
  return types.some((type) => members.includes(type));
}
