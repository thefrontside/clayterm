export interface VirtualizerOptions {
  measureWidth: (text: string) => number;
  maxLines?: number;
  /**
   * Viewport width in columns.  Must be ≥ the maximum width that
   * `measureWidth` returns for any single glyph.  When `columns` is
   * narrower than a glyph (e.g. `columns: 1` with CJK characters of
   * width 2), the glyph cannot be split and will overflow its sub-row.
   * The O-9 invariant ("every visible slice fits within columns") does
   * not hold in that case.
   */
  columns: number;
  rows: number;
}

export interface ViewportEntry {
  lineIndex: number;
  text: string;
  wrapPoints: number[];
  totalSubRows: number;
  firstSubRow: number;
  visibleSubRows: number;
}

export interface ResolvedViewport {
  entries: ViewportEntry[];
  totalEstimatedVisualRows: number;
  currentEstimatedVisualRow: number;
  isAtBottom: boolean;
}
