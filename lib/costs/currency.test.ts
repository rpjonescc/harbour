import { usdMicroToAudMicro } from "./currency";

describe("usdMicroToAudMicro", () => {
  it("converts at the rate and rounds to whole micro-AUD", () => {
    expect(usdMicroToAudMicro(2_500, 1.55)).toBe(3_875);
    expect(usdMicroToAudMicro(3_600, 1.55)).toBe(5_580);
    expect(usdMicroToAudMicro(1, 1.55)).toBe(2);
    expect(usdMicroToAudMicro(1, 1.4)).toBe(1);
    expect(usdMicroToAudMicro(0, 1.55)).toBe(0);
  });

  it("is the identity at a rate of 1", () => {
    expect(usdMicroToAudMicro(6_000, 1)).toBe(6_000);
  });
});
