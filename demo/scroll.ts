import { each, ensure, main, until } from "effection";
import {
  close,
  createDisplayWidth,
  createTerm,
  fixed,
  grow,
  type InputEvent,
  type Op,
  open,
  rgba,
  text,
} from "../mod.ts";
import {
  alternateBuffer,
  cursor,
  mouseTracking,
  settings,
} from "../settings.ts";
import { Virtualizer, type ViewportEntry } from "../virtualizer/mod.ts";
import { skipAnsiSequence } from "../virtualizer/ansi-scanner.ts";
import { useInput } from "./use-input.ts";
import { useStdin } from "./use-stdin.ts";

const FG = rgba(204, 204, 204);
const DIM = rgba(100, 100, 110);
const GUTTER_FG = rgba(100, 120, 160);
const GUTTER_SEP = rgba(60, 60, 70);
const STATUS_BG = rgba(30, 30, 40);
const STATUS_FG = rgba(180, 180, 190);
const ACCENT = rgba(80, 180, 255);
const THUMB = rgba(120, 120, 140);
const TRACK = rgba(40, 40, 50);

function stripAnsi(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    let skip = skipAnsiSequence(s, i);
    if (skip > 0) { i += skip; continue; }
    out += s[i];
    i++;
  }
  return out;
}

function sliceSubRows(entry: ViewportEntry): string[] {
  let { text: t, wrapPoints, firstSubRow, visibleSubRows } = entry;
  let breaks = [0, ...wrapPoints, t.length];
  let result: string[] = [];
  for (let i = firstSubRow; i < firstSubRow + visibleSubRows; i++) {
    result.push(t.slice(breaks[i], breaks[i + 1]));
  }
  return result;
}

function gutterWidth(v: Virtualizer): number {
  let maxLine = v.baseIndex + v.lineCount;
  let digits = Math.max(1, Math.floor(Math.log10(maxLine)) + 1);
  return Math.max(4, digits + 2); // " N │"
}

function gutterText(lineNum: number | null, width: number): string {
  if (lineNum === null) {
    return " ".repeat(width - 2) + " │";
  }
  let num = String(lineNum);
  let pad = width - 2 - num.length; // -2 for " │"
  return " ".repeat(Math.max(0, pad)) + num + " │";
}

function thumbGeometry(
  v: Virtualizer,
  viewportHeight: number,
): { thumbPos: number; thumbSize: number } {
  let vp = v.resolveViewport();
  let total = vp.totalEstimatedVisualRows;
  let current = vp.currentEstimatedVisualRow;
  let thumbSize = total > viewportHeight
    ? Math.max(1, Math.round(viewportHeight * viewportHeight / total))
    : viewportHeight;
  let thumbPos = total > 1
    ? Math.round(current / Math.max(total - 1, 1) * (viewportHeight - thumbSize))
    : 0;
  return { thumbPos, thumbSize };
}

function buildOps(
  v: Virtualizer,
  columns: number,
  rows: number,
): Op[] {
  let ops: Op[] = [];
  let vp = v.resolveViewport();
  let gw = gutterWidth(v);
  let viewportHeight = rows - 1;

  let { thumbPos, thumbSize } = thumbGeometry(v, viewportHeight);

  // Root
  ops.push(open("root", {
    layout: { width: grow(), height: grow(), direction: "ttb" },
  }));

  // Viewport area
  ops.push(open("viewport", {
    layout: { width: grow(), height: grow(), direction: "ttb" },
  }));

  let rowIndex = 0;
  for (let entry of vp.entries) {
    let subRows = sliceSubRows(entry);
    for (let si = 0; si < subRows.length; si++) {
      let isFirstSubRow = entry.firstSubRow + si === 0;
      let lineNum = isFirstSubRow ? entry.lineIndex + 1 : null;
      let content = stripAnsi(subRows[si]);

      // Scrollbar character
      let scrollChar = rowIndex >= thumbPos && rowIndex < thumbPos + thumbSize
        ? "█" : "│";
      let scrollColor = rowIndex >= thumbPos && rowIndex < thumbPos + thumbSize
        ? THUMB : TRACK;

      ops.push(
        open(`r${rowIndex}`, {
          layout: { direction: "ltr", height: fixed(1), width: grow() },
        }),
        // Gutter
        open("", { layout: { width: fixed(gw), height: fixed(1) } }),
        text(gutterText(lineNum, gw), {
          color: lineNum !== null ? GUTTER_FG : GUTTER_SEP,
        }),
        close(),
        // Content
        open("", { layout: { width: grow(), height: fixed(1) } }),
        text(content || " ", { color: FG }),
        close(),
        // Scrollbar
        open("", { layout: { width: fixed(1), height: fixed(1) } }),
        text(scrollChar, { color: scrollColor }),
        close(),
        close(),
      );
      rowIndex++;
    }
  }

  // Fill remaining rows if viewport not full
  while (rowIndex < viewportHeight) {
    let scrollChar = rowIndex >= thumbPos && rowIndex < thumbPos + thumbSize
      ? "█" : " ";
    let scrollColor = rowIndex >= thumbPos && rowIndex < thumbPos + thumbSize
      ? THUMB : TRACK;

    ops.push(
      open(`r${rowIndex}`, {
        layout: { direction: "ltr", height: fixed(1), width: grow() },
      }),
      open("", { layout: { width: fixed(gw), height: fixed(1) } }),
      text("~", { color: DIM }),
      close(),
      open("", { layout: { width: grow(), height: fixed(1) } }),
      close(),
      open("", { layout: { width: fixed(1), height: fixed(1) } }),
      text(scrollChar, { color: scrollColor }),
      close(),
      close(),
    );
    rowIndex++;
  }

  ops.push(close()); // viewport

  // Status bar
  let bottomLabel = vp.isAtBottom ? "  BOTTOM" : "";
  let status =
    ` lines: ${v.lineCount}  row ${vp.currentEstimatedVisualRow}/${vp.totalEstimatedVisualRows}${bottomLabel}  j/k:scroll  g/G:top/bottom  q:quit`;
  ops.push(
    open("status", {
      layout: {
        width: grow(),
        height: fixed(1),
        direction: "ltr",
        padding: { left: 1 },
      },
      bg: STATUS_BG,
    }),
    text(status, { color: STATUS_FG }),
    close(),
  );

  ops.push(close()); // root

  return ops;
}

function generateContent(): string[] {
  let lines: string[] = [];
  lines.push("Welcome to the Clayterm Virtualizer scroll demo");
  lines.push("═".repeat(48));
  lines.push("");

  for (let i = 1; i <= 50; i++) {
    lines.push(`Line ${i}: The quick brown fox jumps over the lazy dog`);
  }

  lines.push("");
  lines.push("--- Long lines that will wrap ---");
  for (let i = 0; i < 10; i++) {
    lines.push(
      `[wrap-${i}] ` +
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
    );
  }

  lines.push("");
  lines.push("--- Short lines ---");
  for (let i = 0; i < 20; i++) {
    lines.push(`  ${i}`);
  }

  lines.push("");
  lines.push("--- Mixed content ---");
  for (let i = 0; i < 50; i++) {
    if (i % 5 === 0) lines.push("");
    else if (i % 7 === 0) lines.push("─".repeat(60));
    else if (i % 3 === 0) {
      lines.push(
        `  Item ${i}: ${"abcdefghij".repeat(Math.floor(i / 3 + 1))}`,
      );
    } else lines.push(`  Entry #${i}`);
  }

  lines.push("");
  lines.push("--- Numbered block ---");
  for (let i = 1; i <= 60; i++) {
    lines.push(`${String(i).padStart(4, " ")}  ${"█".repeat(i % 40 + 1)}`);
  }

  lines.push("");
  lines.push("═".repeat(48));
  lines.push("End of generated content");

  return lines;
}

function handleEvent(
  event: InputEvent,
  v: Virtualizer,
  viewportRows: number,
  columns: number,
  drag: { active: boolean; offset: number },
): boolean {
  if (event.type === "keydown" && event.ctrl && event.key === "c") return true;
  if (event.type === "keydown" && event.key === "q") return true;

  if (event.type === "keydown") {
    switch (event.code) {
      case "j":
      case "ArrowDown":
      case "Enter":
        v.scrollBy(1);
        break;
      case "k":
      case "ArrowUp":
        v.scrollBy(-1);
        break;
      case "d":
      case "PageDown":
        v.scrollBy(Math.max(1, Math.floor(viewportRows / 2)));
        break;
      case "u":
      case "PageUp":
        v.scrollBy(-Math.max(1, Math.floor(viewportRows / 2)));
        break;
      case "g":
      case "Home":
        v.scrollToFraction(0);
        break;
      case "End":
        v.scrollToFraction(1);
        break;
    }
    // G (shift+g) — check key, not code
    if (event.key === "G") {
      v.scrollToFraction(1);
    }
  }

  if (event.type === "wheel") {
    v.scrollBy(event.direction === "down" ? 3 : -3);
  }

  if (
    event.type === "mousedown" &&
    event.button === "left" &&
    event.x === columns - 1 &&
    event.y < viewportRows
  ) {
    let { thumbPos, thumbSize } = thumbGeometry(v, viewportRows);
    if (event.y >= thumbPos && event.y < thumbPos + thumbSize) {
      drag.active = true;
      drag.offset = event.y - thumbPos;
    } else {
      let fraction = event.y / Math.max(viewportRows - thumbSize, 1);
      v.scrollToFraction(Math.min(Math.max(fraction, 0), 1));
    }
  }

  if (event.type === "mousemove" && drag.active) {
    let { thumbSize } = thumbGeometry(v, viewportRows);
    let fraction = (event.y - drag.offset) / Math.max(viewportRows - thumbSize, 1);
    v.scrollToFraction(Math.min(Math.max(fraction, 0), 1));
  }

  if (event.type === "mouseup") {
    drag.active = false;
  }

  return false;
}

await main(function* () {
  let { columns, rows } = Deno.stdout.isTerminal()
    ? Deno.consoleSize()
    : { columns: 80, rows: 24 };
  Deno.stdin.setRaw(true);

  let stdin = yield* useStdin();
  let input = useInput(stdin);

  let measureWidth = yield* until(createDisplayWidth());

  // Load content
  let lines: string[];
  if (Deno.args.length > 0) {
    lines = [];
    for (let path of Deno.args) {
      let content = Deno.readTextFileSync(path);
      for (let line of content.split("\n")) lines.push(line);
    }
  } else {
    lines = generateContent();
  }

  // Compute initial gutter width from line count
  let maxDigits = Math.max(1, Math.floor(Math.log10(lines.length)) + 1);
  let gw = Math.max(4, maxDigits + 2);
  let viewportRows = rows - 1;
  let textColumns = columns - gw - 1;

  let v = new Virtualizer({
    measureWidth,
    columns: textColumns,
    rows: viewportRows,
  });

  for (let line of lines) {
    v.appendLine(line);
  }

  let term = yield* until(createTerm({ width: columns, height: rows }));

  let tty = settings(alternateBuffer(), cursor(false), mouseTracking());
  Deno.stdout.writeSync(tty.apply);

  yield* ensure(() => {
    Deno.stdout.writeSync(tty.revert);
  });

  let drag = { active: false, offset: 0 };

  // Initial render
  Deno.stdout.writeSync(term.render(buildOps(v, columns, rows)).output);

  for (let event of yield* each(input)) {
    let quit = handleEvent(event, v, viewportRows, columns, drag);
    if (quit) break;

    if (event.type === "resize") {
      drag.active = false;
      columns = event.width;
      rows = event.height;
      viewportRows = rows - 1;
      gw = gutterWidth(v);
      textColumns = columns - gw - 1;
      v.resize(textColumns, viewportRows);
      term = yield* until(createTerm({ width: columns, height: rows }));
    }

    Deno.stdout.writeSync(term.render(buildOps(v, columns, rows)).output);

    yield* each.next();
  }
});
