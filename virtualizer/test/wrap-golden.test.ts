import { describe, expect, it } from "./suite.ts";
import { Virtualizer } from "../mod.ts";

function charMeasure(text: string): number {
  let cp = text.codePointAt(0)!;
  if (cp >= 0x4e00 && cp <= 0x9fff) return 2;
  if (cp < 0x20) return 0;
  return 1;
}

describe("G.WRAP — wrapping golden fixtures", () => {
  function resolve(text: string, columns: number) {
    let v = new Virtualizer({ measureWidth: charMeasure, columns, rows: 24 });
    v.appendLine(text);
    let vp = v.resolveViewport();
    return vp.entries[0];
  }

  it("G.WRAP.ascii-exact-fit — 10 ASCII chars at columns 10", () => {
    let entry = resolve("abcdefghij", 10);
    expect(entry.wrapPoints).toEqual([]);
    expect(entry.totalSubRows).toBe(1);
  });

  it("G.WRAP.ascii-one-over — 11 ASCII chars at columns 10", () => {
    let entry = resolve("abcdefghijk", 10);
    expect(entry.wrapPoints).toEqual([10]);
    expect(entry.totalSubRows).toBe(2);
  });

  it("G.WRAP.cjk-boundary — wide char forced to next row when only 1 column left", () => {
    // "abc文d" — widths 1,1,1,2,1 = 6 total
    // At columns 5: abc fills 3, 文 needs 2, 3+2=5 fits. So no wrap.
    // Wait — re-read plan: wrap before 文 at index 3 → [3]
    // Let me check: columns=5, "abc" = 3 cols, "文" = 2 cols, 3+2=5 ≤ 5, so it fits.
    // Plan says wrapPoint at [3]. But 3+2=5 is exact fit. Let me re-check the plan...
    // Plan says: "abc文d" (widths 1,1,1,2,1=6) columns 5, wrap before 文 at string index 3 → [3]
    // But with columns=5, "abc" uses 3, then "文" needs 2, and 3+2=5 ≤ 5. It fits!
    // The total is 6 (including 'd'), so 'd' at width 6 > 5 causes wrap.
    // So: "abc文" = 5 cols in row 1, "d" = 1 col in row 2
    // The wrap happens before 'd'. 文 is at string index 3 (1 char), d is at index 4.
    // So wrapPoint = [4], not [3].
    //
    // But the plan explicitly states [3]. Let me re-read:
    // "abc文d" (widths 1,1,1,2,1=6), columns 5
    // Plan says: "wrap before 文 at string index 3 → [3]"
    // This would mean: row 1 = "abc" (3 cols), row 2 = "文d" (3 cols)
    // But 3 + 2 = 5 ≤ 5 — 文 fits on row 1!
    // Unless the plan intended columns=4?
    //
    // The test fixture is from the plan, so I'll test what the algorithm actually does
    // and verify it's correct behavior. With columns=5, "abc文" fits (width 5).
    // The wrap happens before "d" wouldn't happen either since 5+1=6 > 5, wrap before d at index 4.
    //
    // Actually wait: the wrap point is where we'd exceed columns.
    // a(1) b(2) c(3) 文(5) — fits exactly. d would be col 6 > 5 → wrap before d.
    // d is at string index 4 (文 is one char at index 3). So wrapPoint = [4].
    //
    // The plan example seems wrong about columns=5 producing [3].
    // With columns=4: a(1) b(2) c(3) 文 needs 2, 3+2=5>4 → wrap before 文 at index 3. [3]. ✓
    // I'll test with columns=4 to match the plan's expected output.
    let entry = resolve("abc文d", 4);
    expect(entry.wrapPoints).toEqual([3]);
    expect(entry.totalSubRows).toBe(2);
  });

  it("G.WRAP.cjk-exact-fit — CJK chars fit exactly", () => {
    let entry = resolve("文字", 4); // width 4
    expect(entry.wrapPoints).toEqual([]);
    expect(entry.totalSubRows).toBe(1);
  });

  it("G.WRAP.cjk-exact-fit-at-boundary — mixed content exactly fills columns", () => {
    let entry = resolve("abc文", 5); // widths 1+1+1+2=5
    expect(entry.wrapPoints).toEqual([]);
    expect(entry.totalSubRows).toBe(1);
  });

  it("G.WRAP.empty-line — empty string produces no wrap", () => {
    let entry = resolve("", 80);
    expect(entry.wrapPoints).toEqual([]);
    expect(entry.totalSubRows).toBe(1);
  });

  // The following two tests document behavior when columns < max glyph
  // width, which is an unsupported configuration.  Individual glyphs may
  // overflow their sub-row; the O-9 invariant does not apply.  See the
  // JSDoc on VirtualizerOptions.columns.

  it("G.WRAP.wide-char-wider-than-columns — unsupported: glyph overflows, no wrap at 0", () => {
    let entry = resolve("文", 1);
    expect(entry.wrapPoints).toEqual([]);
    expect(entry.totalSubRows).toBe(1);
  });

  it("G.WRAP.multiple-wide-chars-at-columns-one — unsupported: each glyph gets own row", () => {
    let entry = resolve("文字", 1);
    expect(entry.wrapPoints).toEqual([1]);
    expect(entry.totalSubRows).toBe(2);
  });
});
