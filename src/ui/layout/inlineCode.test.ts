import { describe, expect, it } from "vitest";
import { scenarios } from "../../scenarios";
import { splitInlineCode } from "./inlineCode";

describe("splitInlineCode", () => {
  it("splits text into normal and code parts", () => {
    expect(splitInlineCode("turned away with `401` before `next()` runs")).toEqual([
      { text: "turned away with ", code: false },
      { text: "401", code: true },
      { text: " before ", code: false },
      { text: "next()", code: true },
      { text: " runs", code: false },
    ]);
  });

  it("handles code at the start and the end, and text without code", () => {
    expect(splitInlineCode("`a` then `b`")).toEqual([
      { text: "a", code: true },
      { text: " then ", code: false },
      { text: "b", code: true },
    ]);
    expect(splitInlineCode("no code here")).toEqual([{ text: "no code here", code: false }]);
    expect(splitInlineCode("")).toEqual([]);
  });

  it("keeps a backtick without a partner as normal text", () => {
    expect(splitInlineCode("a lone ` stays")).toEqual([{ text: "a lone ` stays", code: false }]);
    expect(splitInlineCode("`x` and a lone ` here")).toEqual([
      { text: "x", code: true },
      { text: " and a lone ` here", code: false },
    ]);
  });

  it("never loses or changes characters", () => {
    for (const text of ["`a`b`c", "plain", "``", "x `y` z ` w"]) {
      const rebuilt = splitInlineCode(text)
        .map((part) => (part.code ? `\`${part.text}\`` : part.text))
        .join("");
      expect(rebuilt.replaceAll("`", "")).toBe(text.replaceAll("`", ""));
    }
  });
});

describe("scenario why text", () => {
  it.each(scenarios.map((s) => [s.id, s] as const))("%s has a short explanation", (_, scenario) => {
    const why = scenario.why ?? [];
    expect(why.length).toBeGreaterThanOrEqual(3);
    expect(why.length).toBeLessThanOrEqual(6);
    for (const paragraph of why) {
      expect(paragraph).not.toMatch(/[—–<>]/); // no dashes used as punctuation, no HTML
      expect((paragraph.match(/`/g) ?? []).length % 2).toBe(0);
    }
  });
});
