import { describeError } from "./settle-job";

/**
 * Wraps one of the worker's between-jobs duties so a throw never stops the worker or the other
 * duties. The failure is logged once, then again only after the duty has worked in between.
 */
export function guardTick<T>(name: string, duty: () => T): () => T | undefined {
  let failing = false;
  return () => {
    try {
      const result = duty();
      failing = false;
      return result;
    } catch (error) {
      if (!failing) console.warn(`${name} failed; will retry: ${describeError(error)}`);
      failing = true;
      return undefined;
    }
  };
}
