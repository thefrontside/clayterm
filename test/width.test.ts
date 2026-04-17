import { beforeEach, describe, expect, it } from "./suite.ts";
import { createDisplayWidth } from "../width.ts";

describe("createDisplayWidth", () => {
  let displayWidth: (text: string) => number;

  beforeEach(async () => {
    displayWidth = await createDisplayWidth();
  });

  it("R.WIDTH.ascii — ASCII characters each have width 1", () => {
    expect(displayWidth("hello")).toBe(5);
  });

  it("R.WIDTH.cjk — CJK characters each have width 2", () => {
    expect(displayWidth("文字")).toBe(4);
  });

  it("R.WIDTH.combining — combining marks have width 0", () => {
    expect(displayWidth("e\u0301")).toBe(1);
  });

  it("R.WIDTH.zwj-emoji — ZWJ emoji sequence uses per-codepoint wcwidth", () => {
    expect(displayWidth("👨‍👩‍👧‍👦")).toBe(8);
  });

  it("R.WIDTH.additivity — width of concatenation equals sum of widths", () => {
    let pairs: [string, string][] = [
      ["hello", "world"],
      ["文", "字"],
      ["abc", "文字"],
      ["e\u0301", "hello"],
    ];
    for (let [a, b] of pairs) {
      expect(displayWidth(a + b)).toBe(displayWidth(a) + displayWidth(b));
    }
  });

  it("R.WIDTH.empty-string — empty string has width 0", () => {
    expect(displayWidth("")).toBe(0);
  });

  it("R.WIDTH.zero-width — zero-width characters have width 0", () => {
    expect(displayWidth("\u200B")).toBe(0);
    expect(displayWidth("\u200D")).toBe(0);
  });
});
