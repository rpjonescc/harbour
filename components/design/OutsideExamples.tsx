import { OutsideViewPanel } from "@/components/products/OutsideViewPanel";
import { OUTSIDE_STATES } from "./outside-example-data";

/** Every state of the "How the web sees you" section, labelled. Their buttons queue nothing. */
export function OutsideExamples({ locale }: { locale: string }) {
  return (
    <>
      {OUTSIDE_STATES.map(({ label, view }, index) => (
        <div key={label} className="flex flex-col gap-1">
          <p className="text-2xs uppercase tracking-widest text-ink-muted">
            How the web sees you · {label}
          </p>
          <OutsideViewPanel
            view={view}
            productId="acme-docs"
            locale={locale}
            idPrefix={`outside-example-${index}`}
            demo
          />
        </div>
      ))}
    </>
  );
}
