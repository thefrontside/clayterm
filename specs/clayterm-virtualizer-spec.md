# `@clayterm/virtualizer` Current-State Specification

**Status:** Current-state specification for the implementation on `feat/virtualizer-v1`.

This document was imported from the draft virtualizer spec in `~/Downloads` and updated to match the current implementation in this repository. It is intended to describe the implemented package surface and behavior as it exists in-tree today. Where the implementation is known to be more provisional or implementation-shaped than the original draft contract, that is called out explicitly.

## 1. Scope

`@clayterm/virtualizer` is a TypeScript package that provides viewport virtualization over large terminal text output. It owns:

- ring-buffer storage of logical lines
- per-line cached display width
- per-line wrap-point caching at the current column width
- anchor-based scrolling
- viewport resolution
- approximate scrollbar-estimation fields

It does not own:

- ANSI style parsing beyond CSI/OSC skipping for width and wrapping
- rendering, layout, or terminal output
- input normalization
- input parsing
- search, selection, filtering, or disk-backed scrollback

## 2. Package Boundary

The package lives in [`virtualizer/`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer) and exports:

- [`Virtualizer`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/virtualizer.ts)
- [`VirtualizerOptions`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/types.ts)
- [`ViewportEntry`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/types.ts)
- [`ResolvedViewport`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/types.ts)

The package has no runtime import of `@clayterm/clayterm`. Width measurement is injected by the caller.

The intended width provider from the renderer package is `createDisplayWidth()` from root [`width.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/width.ts), which is an async factory returning a synchronous `(text: string) => number` function.

## 3. Public API

The current implemented API is:

```ts
class Virtualizer {
  constructor(options: VirtualizerOptions);

  readonly lineCount: number;
  readonly baseIndex: number;
  readonly columns: number;
  readonly rows: number;
  readonly totalEstimatedVisualRows: number;
  readonly currentEstimatedVisualRow: number;
  readonly isAtBottom: boolean;
  readonly anchorLineIndex: number;
  readonly anchorSubRow: number;

  appendLine(text: string): number;
  resize(columns: number, rows: number): void;
  scrollBy(deltaVisualRows: number): void;
  scrollToFraction(fraction: number): void;
  resolveViewport(): ResolvedViewport;

  getLineDisplayWidth(lineIndex: number): number | undefined;
}

interface VirtualizerOptions {
  measureWidth: (text: string) => number;
  maxLines?: number;
  columns: number;
  rows: number;
}

interface ViewportEntry {
  lineIndex: number;
  text: string;
  wrapPoints: number[];
  totalSubRows: number;
  firstSubRow: number;
  visibleSubRows: number;
}

interface ResolvedViewport {
  entries: ViewportEntry[];
  totalEstimatedVisualRows: number;
  currentEstimatedVisualRow: number;
  isAtBottom: boolean;
}
```

Notes:

- `appendLine()` returns the assigned monotonic `lineIndex`.
- `resolveViewport()` reads `columns` and `rows` from internal state and takes no parameters.
- `getLineDisplayWidth()` is a current implemented API for exposing cached per-line display width. It returns `undefined` for evicted or never-assigned indices.

## 4. Width Model And ANSI Handling

The current implementation expects `measureWidth(text)` to be:

- synchronous
- ANSI-agnostic
- additive across concatenation
- based on per-codepoint `wcwidth` semantics

The virtualizer owns ANSI CSI/OSC skipping internally.

Recognized sequences:

- CSI: `ESC [` ... final byte in `0x40..0x7E`
- OSC: `ESC ]` ... terminated by BEL or `ESC \`

Current behavior:

- recognized CSI/OSC bytes are skipped for both cached display width and wrap computation
- `measureWidth` is called only on visible codepoints
- unrecognized escape families are not skipped
- no ANSI style state is carried between lines

Implementation note:

- unterminated CSI/OSC sequences are currently consumed to the end of the string by the scanner in [`virtualizer/ansi-scanner.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/ansi-scanner.ts)

## 5. Data Model

The virtualizer maintains:

- a ring buffer of `{ text, displayWidth, lineIndex }`
- `baseIndex`
- a monotonic next-line counter
- current `columns` and `rows`
- anchor state: `(anchorLineIndex, anchorSubRow, isAtBottom)`
- `totalEstimatedVisualRows`
- `currentEstimatedVisualRow`
- a wrap cache `Map<lineIndex, wrapPoints>`

Current storage implementation lives in [`virtualizer/ring-buffer.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/ring-buffer.ts).

Current empty-buffer behavior:

- `lineCount === 0`
- `totalEstimatedVisualRows === 0`
- `currentEstimatedVisualRow === 0`
- `isAtBottom === true`
- `resolveViewport().entries` is empty
- `scrollBy()` and `scrollToFraction()` are no-ops

## 6. Operations

### 6.1 `appendLine(text)`

Current implementation flow:

1. Compute `displayWidth` with ANSI skipping.
2. If the buffer is at capacity, evict the oldest line before insertion.
3. Delete the evicted line’s wrap-cache entry.
4. Decrement `totalEstimatedVisualRows` by the evicted line’s estimated rows.
5. Adjust anchor and current estimate if eviction occurred before the anchor.
6. Store the new line with the next monotonic `lineIndex`.
7. Increment `totalEstimatedVisualRows` by `max(1, ceil(displayWidth / columns))`.
8. If `isAtBottom`, advance anchor to the new line at sub-row 0.

### 6.2 `scrollBy(deltaVisualRows)`

Current implementation:

- walks exact sub-rows using cached or freshly computed wrap points
- clamps at top and bottom
- clears `isAtBottom` when scrolling up from bottom
- sets `isAtBottom` when clamped to the last exact sub-row of the last line
- recomputes `currentEstimatedVisualRow` from estimated line prefixes plus the anchor sub-row

### 6.3 `scrollToFraction(fraction)`

Current implementation:

- maps the fraction into an estimated target row
- walks from `baseIndex` using estimated rows per line
- lands on an estimated sub-row within the selected line
- recomputes `currentEstimatedVisualRow` after updating the anchor

### 6.4 `resize(columns, rows)`

Current implementation:

- clears the wrap cache on column change
- recomputes `totalEstimatedVisualRows` by summing `ceil(displayWidth / columns)`
- updates `columns`
- recomputes `currentEstimatedVisualRow`
- updates `rows`

Current implementation detail:

- anchor sub-row clamping is currently based on the estimated row count for the anchor line at the new width, not an exact re-wrap of that line

### 6.5 `resolveViewport()`

Current implementation:

1. Walks forward from the anchor, filling as many rows as possible.
2. If the forward walk does not fill the viewport, it backfills upward:
   - first by expanding the anchor line upward when `anchorSubRow > 0`
   - then by including preceding lines
3. Returns ordered `ViewportEntry` records plus estimation metadata.

Each `ViewportEntry` contains the original `text`, all wrap points for that line, and a visible sub-row window.

## 7. Output Invariants The Implementation Intends To Satisfy

The current test suite checks the following output invariants through public API behavior:

- `entries` ordered by ascending `lineIndex`
- `text` preserved exactly
- `wrapPoints` strictly increasing
- no wrap point inside surrogate pairs
- no wrap point inside recognized CSI/OSC
- `totalSubRows === wrapPoints.length + 1`
- `firstSubRow` and `visibleSubRows` stay within bounds
- total visible sub-rows do not exceed the viewport row budget
- every visible slice fits within `columns` (when `columns` ≥ the maximum single-glyph width returned by `measureWidth`; see §8)
- output can be reconstructed from `text + wrapPoints`

## 8. Current Implementation Notes And Known Gaps

### Columns ≥ max glyph width precondition

`columns` must be at least as wide as the widest single glyph that `measureWidth` can return. With a standard `wcwidth`-based provider, CJK ideographs are width 2, so `columns` must be ≥ 2. When this precondition is violated (e.g. `columns: 1` with CJK text), the wrapping algorithm cannot split a single glyph and it overflows its sub-row. The O-9 invariant ("every visible slice fits within `columns`") does not hold in that case. The wrap-golden test suite documents the overflow behavior for reference but the configuration is unsupported.

### Other notes

These notes document the current branch shape rather than defining desired future contract.

- The renderer-side width provider is exposed as `createDisplayWidth(): Promise<(text: string) => number>`, not a directly callable synchronous top-level export.
- `getLineDisplayWidth()` is currently public to support direct verification of cached display width.
- The wrap golden fixture for `abc文d` is currently exercised at `columns = 4` in [`virtualizer/test/wrap-golden.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/wrap-golden.test.ts), reflecting the corrected boundary case used by the branch’s tests rather than the older draft wording from Downloads.
- The implementation and tests should be treated as the source of truth for current behavior where they diverge from the older draft.

## 9. Source Alignment

This file replaces the earlier draft-only location in `~/Downloads` with an in-repo copy under [`specs/`](/Users/tarasmankovski/Repositories/frontside/clayterm/specs). It is intended to track the implemented branch and should be updated together with public API or behavioral changes in [`virtualizer/`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer).
