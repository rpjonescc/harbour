import { flagsInText } from "./flag-words";

describe("flagsInText", () => {
  it.each([
    ["Plans start at $9 a month", ["pricing"]],
    ["Ask your doctor about symptoms", ["health"]],
    ["Covers the Year 3 curriculum", ["curriculum"]],
    ["Check GDPR compliance first", ["legal"]],
    ['One customer said "this saved our whole team a week of work".', ["testimonial"]],
    ["The fastest way, and the only one", ["comparative"]],
    ["A calm guide to publishing docs.", []],
  ])("flags %j as %j", (text, flags) => expect(flagsInText(text)).toEqual(flags));
});
