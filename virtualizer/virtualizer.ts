import { RingBuffer } from "./ring-buffer.ts";
import { computeDisplayWidth, computeWrapPoints } from "./wrap-walker.ts";
import type {
  ResolvedViewport,
  ViewportEntry,
  VirtualizerOptions,
} from "./types.ts";

export class Virtualizer {
  private _ringBuffer: RingBuffer;
  private _wrapCache: Map<number, number[]>;
  private _measureWidth: (text: string) => number;
  private _columns: number;
  private _rows: number;
  private _anchorLineIndex: number;
  private _anchorSubRow: number;
  private _isAtBottom: boolean;
  private _totalEstimatedVisualRows: number;
  private _currentEstimatedVisualRow: number;

  constructor(options: VirtualizerOptions) {
    let maxLines = options.maxLines ?? 10_000;
    this._ringBuffer = new RingBuffer(maxLines);
    this._wrapCache = new Map();
    this._measureWidth = options.measureWidth;
    this._columns = options.columns;
    this._rows = options.rows;
    this._anchorLineIndex = 0;
    this._anchorSubRow = 0;
    this._isAtBottom = true;
    this._totalEstimatedVisualRows = 0;
    this._currentEstimatedVisualRow = 0;
  }

  // Read-only observable state
  get lineCount(): number {
    return this._ringBuffer.lineCount;
  }

  get baseIndex(): number {
    return this._ringBuffer.baseIndex;
  }

  get columns(): number {
    return this._columns;
  }

  get rows(): number {
    return this._rows;
  }

  get totalEstimatedVisualRows(): number {
    return this._totalEstimatedVisualRows;
  }

  get currentEstimatedVisualRow(): number {
    return this._currentEstimatedVisualRow;
  }

  get isAtBottom(): boolean {
    return this._isAtBottom;
  }

  get anchorLineIndex(): number {
    return this._anchorLineIndex;
  }

  get anchorSubRow(): number {
    return this._anchorSubRow;
  }

  private _estimateVisualRows(displayWidth: number): number {
    return Math.max(1, Math.ceil(displayWidth / this._columns));
  }

  /**
   * appendLine(text) — §10.2, 6-step control flow:
   *
   * 1. Compute displayWidth (always)
   * 2. If at capacity: evict oldest line
   * 3. Store the line in ring buffer (always)
   * 4. Increment totalEstimatedVisualRows (always)
   * 5. If isAtBottom: advance anchor (always)
   * 6. Return lineIndex (always)
   */
  appendLine(text: string): number {
    // Step 1: Compute displayWidth
    let displayWidth = computeDisplayWidth(text, this._measureWidth);

    // Step 2: If at capacity, evict before insertion
    if (
      this._ringBuffer.lineCount === this._ringBuffer.capacity
    ) {
      let evictedLineIndex = this._ringBuffer.baseIndex;
      let evictedEntry = this._ringBuffer.get(evictedLineIndex)!;
      let evictedEstimate = this._estimateVisualRows(evictedEntry.displayWidth);

      // Remove evicted line's wrap cache entry (§11.3 step 4)
      this._wrapCache.delete(evictedLineIndex);

      // Decrement total by evicted line's estimate
      this._totalEstimatedVisualRows -= evictedEstimate;

      // Handle anchor per §11.4
      if (this._anchorLineIndex > evictedLineIndex) {
        this._currentEstimatedVisualRow -= evictedEstimate;
      } else if (this._anchorLineIndex === evictedLineIndex) {
        // Clamp anchor to the next surviving line. For maxLines=1 this
        // pre-targets the line about to be inserted in step 3, whose
        // lineIndex is always evictedLineIndex + 1 (monotonic counter).
        this._anchorLineIndex = evictedLineIndex + 1;
        this._anchorSubRow = 0;
        this._currentEstimatedVisualRow = 0;
      }
    }

    // Step 3: Store the line
    let result = this._ringBuffer.append(text, displayWidth);
    let newLineIndex = result.lineIndex;

    // Step 4: Increment totalEstimatedVisualRows
    let newEstimate = this._estimateVisualRows(displayWidth);
    this._totalEstimatedVisualRows += newEstimate;

    // Step 5: If isAtBottom, advance anchor
    if (this._isAtBottom) {
      this._anchorLineIndex = newLineIndex;
      this._anchorSubRow = 0;
      this._currentEstimatedVisualRow =
        this._totalEstimatedVisualRows - newEstimate;
    }

    // Step 6: Return lineIndex
    return newLineIndex;
  }

  /**
   * resize(columns, rows) — §10.3
   *
   * On column-width change: clear wrap cache, recompute estimation,
   * clamp anchor sub-row, recompute currentEstimatedVisualRow.
   * On row-only change: just update rows.
   */
  resize(columns: number, rows: number): void {
    if (columns !== this._columns) {
      // Column width changed — invalidate wrap cache (INV-5)
      this._wrapCache.clear();

      // Recompute totalEstimatedVisualRows with new column width
      let newTotal = 0;
      let baseIndex = this._ringBuffer.baseIndex;
      for (let i = baseIndex; i < baseIndex + this._ringBuffer.lineCount; i++) {
        let entry = this._ringBuffer.get(i);
        if (!entry) break;
        newTotal += Math.max(1, Math.ceil(entry.displayWidth / columns));
      }
      this._totalEstimatedVisualRows = newTotal;

      this._columns = columns;

      // Clamp anchor sub-row using exact wrap count at new width
      if (this._ringBuffer.lineCount > 0) {
        let anchorEntry = this._ringBuffer.get(this._anchorLineIndex);
        if (anchorEntry) {
          let wrapPoints = this._getWrapPoints(this._anchorLineIndex, anchorEntry.text);
          let exactSubRows = wrapPoints.length + 1;
          if (this._anchorSubRow >= exactSubRows) {
            this._anchorSubRow = exactSubRows - 1;
          }
        }
      }

      // Recompute currentEstimatedVisualRow
      this._recomputeCurrentEstimate();
    }

    this._rows = rows;
  }

  /**
   * scrollBy(deltaVisualRows) — §10.4
   *
   * Walk forward (positive) or backward (negative) from anchor through
   * exact sub-rows. Clamp at buffer boundaries. Update isAtBottom and
   * currentEstimatedVisualRow.
   */
  scrollBy(deltaVisualRows: number): void {
    if (this._ringBuffer.lineCount === 0) return;

    let remaining = deltaVisualRows;

    if (remaining > 0) {
      // Scroll down (forward)
      while (remaining > 0) {
        let entry = this._ringBuffer.get(this._anchorLineIndex);
        if (!entry) break;

        let wrapPoints = this._getWrapPoints(this._anchorLineIndex, entry.text);
        let totalSubRows = wrapPoints.length + 1;
        let availableInLine = totalSubRows - this._anchorSubRow - 1;

        if (remaining <= availableInLine) {
          this._anchorSubRow += remaining;
          remaining = 0;
        } else {
          // Move to next line
          let nextEntry = this._ringBuffer.get(this._anchorLineIndex + 1);
          if (!nextEntry) {
            // Clamp at bottom of current line
            this._anchorSubRow = totalSubRows - 1;
            remaining = 0;
          } else {
            remaining -= availableInLine + 1;
            this._anchorLineIndex++;
            this._anchorSubRow = 0;
          }
        }
      }

      // Check if we're at the very bottom
      let lastLineIndex = this._ringBuffer.baseIndex + this._ringBuffer.lineCount - 1;
      if (this._anchorLineIndex === lastLineIndex) {
        let lastEntry = this._ringBuffer.get(lastLineIndex)!;
        let lastWrap = this._getWrapPoints(lastLineIndex, lastEntry.text);
        let lastTotalSubRows = lastWrap.length + 1;
        if (this._anchorSubRow === lastTotalSubRows - 1) {
          this._isAtBottom = true;
        }
      }
    } else if (remaining < 0) {
      // Scroll up (backward)
      if (this._isAtBottom) {
        this._isAtBottom = false;
      }

      remaining = -remaining; // work with positive count

      while (remaining > 0) {
        if (this._anchorSubRow >= remaining) {
          this._anchorSubRow -= remaining;
          remaining = 0;
        } else {
          remaining -= this._anchorSubRow;
          // Move to previous line
          let prevEntry = this._ringBuffer.get(this._anchorLineIndex - 1);
          if (!prevEntry) {
            // Clamp at top
            this._anchorSubRow = 0;
            remaining = 0;
          } else {
            this._anchorLineIndex--;
            let prevWrap = this._getWrapPoints(this._anchorLineIndex, prevEntry.text);
            let prevTotalSubRows = prevWrap.length + 1;
            this._anchorSubRow = prevTotalSubRows - 1;
            remaining -= 1; // consumed one row entering this line's last sub-row
          }
        }
      }
    }

    // Update currentEstimatedVisualRow: sum estimates for all lines before anchor + anchorSubRow
    this._recomputeCurrentEstimate();
  }

  /**
   * scrollToFraction(fraction) — §10.5
   *
   * Map fraction to an estimated visual row, then walk from baseIndex
   * to find the corresponding anchor position.
   */
  scrollToFraction(fraction: number): void {
    if (this._ringBuffer.lineCount === 0) return;

    let target = Math.min(
      Math.floor(fraction * this._totalEstimatedVisualRows),
      Math.max(this._totalEstimatedVisualRows - 1, 0),
    );

    let accumulated = 0;
    let baseIndex = this._ringBuffer.baseIndex;
    let lastLineIndex = baseIndex + this._ringBuffer.lineCount - 1;

    for (let i = baseIndex; i <= lastLineIndex; i++) {
      let entry = this._ringBuffer.get(i)!;
      let estimate = this._estimateVisualRows(entry.displayWidth);

      if (accumulated + estimate > target) {
        this._anchorLineIndex = i;
        this._anchorSubRow = Math.min(target - accumulated, estimate - 1);
        break;
      }

      accumulated += estimate;

      if (i === lastLineIndex) {
        // fraction >= 1 or rounding landed past end
        this._anchorLineIndex = i;
        this._anchorSubRow = estimate - 1;
      }
    }

    // Determine isAtBottom
    let lastEntry = this._ringBuffer.get(lastLineIndex)!;
    let lastEstimate = this._estimateVisualRows(lastEntry.displayWidth);
    this._isAtBottom =
      this._anchorLineIndex === lastLineIndex &&
      this._anchorSubRow === lastEstimate - 1;

    this._recomputeCurrentEstimate();
  }

  private _recomputeCurrentEstimate(): void {
    let estimate = 0;
    let baseIndex = this._ringBuffer.baseIndex;
    for (let i = baseIndex; i < this._anchorLineIndex; i++) {
      let entry = this._ringBuffer.get(i);
      if (!entry) break;
      estimate += this._estimateVisualRows(entry.displayWidth);
    }
    estimate += this._anchorSubRow;
    this._currentEstimatedVisualRow = Math.min(
      estimate,
      Math.max(this._totalEstimatedVisualRows - 1, 0),
    );
  }

  getLineDisplayWidth(lineIndex: number): number | undefined {
    return this._ringBuffer.get(lineIndex)?.displayWidth;
  }

  private _getWrapPoints(lineIndex: number, text: string): number[] {
    let cached = this._wrapCache.get(lineIndex);
    if (cached !== undefined) return cached;
    let wp = computeWrapPoints(text, this._columns, this._measureWidth);
    this._wrapCache.set(lineIndex, wp);
    return wp;
  }

  resolveViewport(): ResolvedViewport {
    if (this._ringBuffer.lineCount === 0) {
      return {
        entries: [],
        totalEstimatedVisualRows: 0,
        currentEstimatedVisualRow: 0,
        isAtBottom: true,
      };
    }

    let forwardEntries: ViewportEntry[] = [];
    let rowsBudget = this._rows;
    let currentLineIndex = this._anchorLineIndex;
    let startSubRow = this._anchorSubRow;

    // Walk forward from anchor, filling viewport rows
    while (rowsBudget > 0) {
      let entry = this._ringBuffer.get(currentLineIndex);
      if (!entry) break;

      let wrapPoints = this._getWrapPoints(currentLineIndex, entry.text);
      let totalSubRows = wrapPoints.length + 1;

      let firstSubRow = startSubRow;
      let availableSubRows = totalSubRows - firstSubRow;
      let visibleSubRows = Math.min(availableSubRows, rowsBudget);

      forwardEntries.push({
        lineIndex: currentLineIndex,
        text: entry.text,
        wrapPoints,
        totalSubRows,
        firstSubRow,
        visibleSubRows,
      });

      rowsBudget -= visibleSubRows;
      currentLineIndex++;
      startSubRow = 0;
    }

    // Backfill: if forward walk didn't fill the viewport, walk backward
    let backEntries: ViewportEntry[] = [];
    if (rowsBudget > 0) {
      // First, expand anchor line's visible sub-rows upward if possible
      if (this._anchorSubRow > 0 && forwardEntries.length > 0) {
        let anchor = forwardEntries[0];
        let fillAbove = Math.min(this._anchorSubRow, rowsBudget);
        forwardEntries[0] = {
          ...anchor,
          firstSubRow: anchor.firstSubRow - fillAbove,
          visibleSubRows: anchor.visibleSubRows + fillAbove,
        };
        rowsBudget -= fillAbove;
      }

      // Walk backward through earlier lines
      let backLineIndex = this._anchorLineIndex - 1;
      while (rowsBudget > 0 && backLineIndex >= this._ringBuffer.baseIndex) {
        let entry = this._ringBuffer.get(backLineIndex);
        if (!entry) break;

        let wrapPoints = this._getWrapPoints(backLineIndex, entry.text);
        let totalSubRows = wrapPoints.length + 1;
        let visibleSubRows = Math.min(totalSubRows, rowsBudget);
        let firstSubRow = totalSubRows - visibleSubRows;

        backEntries.push({
          lineIndex: backLineIndex,
          text: entry.text,
          wrapPoints,
          totalSubRows,
          firstSubRow,
          visibleSubRows,
        });

        rowsBudget -= visibleSubRows;
        backLineIndex--;
      }
    }

    let entries = [...backEntries.reverse(), ...forwardEntries];

    return {
      entries,
      totalEstimatedVisualRows: this._totalEstimatedVisualRows,
      currentEstimatedVisualRow: this._currentEstimatedVisualRow,
      isAtBottom: this._isAtBottom,
    };
  }
}
