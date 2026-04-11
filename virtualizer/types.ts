export interface VirtualizerOptions {
  measureWidth: (text: string) => number;
  maxLines?: number;
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
