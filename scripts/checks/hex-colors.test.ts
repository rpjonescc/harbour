import { findHexColors } from "./hex-colors";

describe("findHexColors", () => {
  it("flags hex colours in components and app code", () => {
    const findings = findHexColors({
      path: "components/ui/Bad.tsx",
      content: 'export const x = <div style={{ color: "#1f6b5a" }} className="bg-[#fff]" />;',
    });
    expect(findings.map((f) => f.match)).toEqual(["#1f6b5a", "#fff"]);
    expect(findings[0]?.line).toBe(1);
  });

  it("ignores the design token layer and non-UI files", () => {
    expect(findHexColors({ path: "design/tokens.css", content: "--x: #fff;" })).toEqual([]);
    expect(findHexColors({ path: "lib/auth/sessions.ts", content: "const id = '#abc';" })).toEqual(
      [],
    );
  });

  it("does not flag anchors or ids that are not colours", () => {
    const findings = findHexColors({ path: "app/page.tsx", content: '<a href="#main">Skip</a>' });
    expect(findings).toEqual([]);
  });
});
