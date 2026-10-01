import { readFileSync } from "node:fs";
import { BRAND } from "./brand";

const tokens = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

function primitive(name: string): string | undefined {
  return new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(tokens)?.[1]?.toLowerCase();
}

describe("BRAND", () => {
  it.each([
    ["background", "paper-100"],
    ["theme", "tide-700"],
    ["ink", "paper-50"],
  ] as const)("%s matches the --%s primitive", (key, name) => {
    expect(primitive(name)).toBeDefined();
    expect(BRAND[key].toLowerCase()).toBe(primitive(name));
  });
});
