import {
  EXIT_TRANSITION_SIBLING_ORDERING,
  TRANSITION_ENTER_TRIGGER,
  TRANSITION_EXIT_TRIGGER,
  TRANSITION_HANDLER,
  TRANSITION_INTERACTION_HANDLING,
  TRANSITION_PRESET,
  TRANSITION_PROPERTY,
  close,
  createInput,
  createTerm,
  fixed,
  grow,
  open,
  rgba,
  text,
  type Input,
  type InputEvent,
  type KeyEvent,
  type MouseDownEvent,
  type MouseMoveEvent,
  type MouseUpEvent,
  type Op,
} from "../mod.ts";
import {
  alternateBuffer,
  cursor,
  mouseTracking,
  progressiveInput,
  settings,
} from "../settings.ts";

const PROGRESSIVE_INPUT_FLAGS = 31;
const SMOKE_TEST = Deno.env.get("CLAYTERM_SMOKE_TEST") === "1";
const TICK_MS = 16;
const TRANSITION_DURATION = 0.42;
const CONTROL_GAP = 2;
const GRID_COLUMNS = 6;
const GRID_ROWS = 5;
const CELL_COUNT = GRID_COLUMNS * GRID_ROWS;

const palette = {
  appBg: rgba(11, 14, 20),
  panelBg: rgba(20, 26, 36),
  panelBorder: rgba(85, 109, 136),
  titleText: rgba(233, 239, 244),
  bodyText: rgba(153, 171, 189),
  buttonBg: rgba(37, 50, 68),
  buttonHover: rgba(58, 78, 102),
  buttonPressed: rgba(125, 90, 43),
  buttonText: rgba(245, 247, 250),
  gridBg: rgba(14, 18, 24),
  cellText: rgba(251, 244, 235),
  cellTextAlt: rgba(43, 50, 63),
};

interface TerminalSize {
  width: number;
  height: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutMetrics {
  panelWidth: number;
  panelHeight: number;
  buttonWidth: number;
  visibleRows: number;
}

interface PointerState {
  x: number;
  y: number;
  down: boolean;
}

interface CellData {
  id: number;
  label: string;
  color: number;
  textColor: number;
}

interface AppState {
  size: TerminalSize;
  pointer: PointerState;
  pressedButton: string | null;
  cells: CellData[];
  expanded: boolean;
  animating: boolean;
}

type QueueEvent = InputEvent | { type: "sigwinch" } | { type: "tick" };

class AsyncQueue<T> {
  #values: T[] = [];
  #resolvers: ((value: T) => void)[] = [];

  push(value: T): void {
    let resolver = this.#resolvers.shift();
    if (resolver) resolver(value);
    else this.#values.push(value);
  }

  next(): Promise<T> {
    let value = this.#values.shift();
    if (value !== undefined) return Promise.resolve(value);
    return new Promise((resolve) => this.#resolvers.push(resolve));
  }
}

if (!Deno.stdout.isTerminal()) {
  throw new Error("This demo must be run in a terminal.");
}

let size = getTerminalSize();
let input = await createInput({ escLatency: 25 });
let term = await createTerm(size);
let tty = settings(
  alternateBuffer(),
  cursor(false),
  progressiveInput(PROGRESSIVE_INPUT_FLAGS),
  mouseTracking(),
);

let state: AppState = {
  size,
  pointer: { x: -1, y: -1, down: false },
  pressedButton: null,
  cells: createCells("cool"),
  expanded: false,
  animating: false,
};

let queue = new AsyncQueue<QueueEvent>();
let tickTimer: ReturnType<typeof setTimeout> | undefined;

Deno.stdin.setRaw(true);
Deno.stdout.writeSync(tty.apply);

let onResize = () => queue.push({ type: "sigwinch" });
Deno.addSignalListener("SIGWINCH", onResize);

try {
  render(0);

  if (SMOKE_TEST) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  } else {
    pumpInput(queue, input);

    while (true) {
      let event = await queue.next();
      if (event.type === "sigwinch") {
        let nextSize = getTerminalSize();
        if (nextSize.width !== state.size.width || nextSize.height !== state.size.height) {
          state.size = nextSize;
          term = await createTerm(nextSize);
          render(0);
        }
        continue;
      }

      if (event.type === "tick") {
        if (state.animating) {
          render(TICK_MS / 1000);
        }
        continue;
      }

      if (handleEvent(event)) break;
    }
  }
} finally {
  if (tickTimer) clearTimeout(tickTimer);
  Deno.removeSignalListener("SIGWINCH", onResize);
  Deno.stdout.writeSync(tty.revert);
  Deno.stdin.setRaw(false);
}

function getTerminalSize(): TerminalSize {
  let { columns, rows } = Deno.consoleSize();
  return { width: columns, height: rows };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function layoutMetrics(size: TerminalSize): LayoutMetrics {
  let visibleRows = state.expanded ? GRID_ROWS + 1 : GRID_ROWS;
  let panelWidth = Math.max(58, Math.min(size.width - 4, 84));
  let panelHeight = Math.max(18, Math.min(size.height - 2, 8 + visibleRows + 5));
  let buttonWidth = Math.max(8, Math.floor((panelWidth - CONTROL_GAP * 3 - 2) / 4));
  return {
    panelWidth,
    panelHeight,
    buttonWidth,
    visibleRows,
  };
}

function createCells(theme: "cool" | "warm"): CellData[] {
  return Array.from({ length: CELL_COUNT }, (_, index) => ({
    id: index,
    label: String(index).padStart(2, "0"),
    color: theme === "cool" ? coolColor(index) : warmColor(index),
    textColor: index > 15 ? palette.cellText : palette.cellTextAlt,
  }));
}

function coolColor(index: number): number {
  return rgba(70 + index * 3, 110 + index * 2, 160 + index, 255);
}

function warmColor(index: number): number {
  return rgba(210 - index * 2, 120 + index * 2, 65 + index, 255);
}

function shuffleCells(): void {
  let cells = [...state.cells];
  for (let i = cells.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  state.cells = cells;
  markAnimating();
}

function recolor(theme: "cool" | "warm"): void {
  state.cells = state.cells.map((cell) => ({
    ...cell,
    color: theme === "cool" ? coolColor(cell.id) : warmColor(cell.id),
  }));
  markAnimating();
}

function toggleExpanded(): void {
  state.expanded = !state.expanded;
  markAnimating();
}

function markAnimating(): void {
  state.animating = true;
  scheduleTick();
}

function scheduleTick(): void {
  if (tickTimer || !state.animating) return;
  tickTimer = setTimeout(() => {
    tickTimer = undefined;
    if (state.animating) queue.push({ type: "tick" });
  }, TICK_MS);
}

function handleEvent(event: InputEvent): boolean {
  let changed = false;
  switch (event.type) {
    case "keydown":
      return handleKeyDown(event);
    case "mousedown":
      changed = handleMouseDown(event);
      break;
    case "mousemove":
      changed = handleMouseMove(event);
      break;
    case "mouseup":
      changed = handleMouseUp(event);
      break;
    default:
      return false;
  }
  if (changed) render(0);
  return false;
}

function handleKeyDown(event: KeyEvent): boolean {
  if (event.ctrl && event.key === "c") return true;
  switch (event.key.toLowerCase()) {
    case "q":
      return true;
    case "s":
      shuffleCells();
      render(0);
      return false;
    case "w":
      recolor("warm");
      render(0);
      return false;
    case "c":
      recolor("cool");
      render(0);
      return false;
    case "e":
      toggleExpanded();
      render(0);
      return false;
    default:
      return false;
  }
}

function updatePointer(event: MouseDownEvent | MouseMoveEvent | MouseUpEvent): void {
  state.pointer.x = event.x;
  state.pointer.y = event.y;
}

function handleMouseDown(event: MouseDownEvent): boolean {
  updatePointer(event);
  if (event.button !== "left") return false;
  state.pointer.down = true;
  state.pressedButton = buttonAtPointer();
  return true;
}

function handleMouseMove(event: MouseMoveEvent): boolean {
  updatePointer(event);
  return true;
}

function handleMouseUp(event: MouseUpEvent): boolean {
  updatePointer(event);
  let pressed = state.pressedButton;
  let hovered = buttonAtPointer();
  state.pointer.down = false;
  state.pressedButton = null;
  if ((event.button === "left" || event.button === "release") && pressed && hovered === pressed) {
    triggerAction(pressed);
  }
  return true;
}

function buttonAtPointer(): string | null {
  for (let button of buttonRects()) {
    if (inRect(state.pointer, button.rect)) return button.id;
  }
  return null;
}

function inRect(pointer: PointerState, rect: Rect): boolean {
  return pointer.x >= rect.x && pointer.x < rect.x + rect.width &&
    pointer.y >= rect.y && pointer.y < rect.y + rect.height;
}

function triggerAction(id: string): void {
  switch (id) {
    case "shuffle":
      shuffleCells();
      break;
    case "warm":
      recolor("warm");
      break;
    case "cool":
      recolor("cool");
      break;
    case "expand":
      toggleExpanded();
      break;
  }
  render(0);
}

function render(deltaTime: number): void {
  let { output, hasActiveTransitions } = term.render(buildOps(), { deltaTime });
  Deno.stdout.writeSync(output);
  if (state.animating && !hasActiveTransitions) {
    state.animating = false;
    return;
  }
  if (state.animating && hasActiveTransitions) {
    scheduleTick();
  }
}

function buildOps(): Op[] {
  let metrics = layoutMetrics(state.size);
  let hovered = buttonAtPointer();
  let ops: Op[] = [];

  ops.push(
    open("root", {
      layout: {
        width: grow(),
        height: grow(),
        direction: "ttb",
        padding: { left: 2, right: 2, top: 1, bottom: 1 },
      },
      bg: palette.appBg,
    }),
    open("", { layout: { width: grow(), height: grow() } }), close(),
    open("panel-row", { layout: { width: grow(), height: fixed(metrics.panelHeight), direction: "ltr" }, bg: palette.appBg }),
    open("", { layout: { width: grow(), height: grow() } }), close(),
    open("panel", {
      layout: {
        width: fixed(metrics.panelWidth),
        height: fixed(metrics.panelHeight),
        direction: "ttb",
        padding: { left: 1, right: 1, top: 1, bottom: 1 },
        gap: 1,
      },
      bg: palette.panelBg,
      border: { color: palette.panelBorder, left: 1, right: 1, top: 1, bottom: 1 },
      cornerRadius: { tl: 1, tr: 1, bl: 1, br: 1 },
    }),
    open("title", { layout: { width: grow(), height: fixed(1) }, bg: palette.panelBg }),
    text("Native Clay transitions  grid reflow demo", { color: palette.titleText }),
    close(),
    open("subtitle", { layout: { width: grow(), height: fixed(1) }, bg: palette.panelBg }),
    text("Shuffle, recolor, and expand the layout to watch boxes rearrange", { color: palette.bodyText }),
    close(),
    open("controls", { layout: { width: grow(), height: fixed(1), direction: "ltr", gap: CONTROL_GAP }, bg: palette.panelBg }),
  );

  for (let button of buttonRects(metrics)) {
    let isHovered = hovered === button.id;
    let isPressed = state.pressedButton === button.id;
    ops.push(
      open(button.id, {
        layout: { width: fixed(button.rect.width), height: fixed(1) },
        bg: isPressed ? palette.buttonPressed : isHovered ? palette.buttonHover : palette.buttonBg,
      }),
      text(centerText(button.label, button.rect.width), { color: palette.buttonText }),
      close(),
    );
  }

  ops.push(close());

  for (let row = 0; row < metrics.visibleRows; row++) {
    ops.push(open(`row-${row}`, { layout: { width: grow(), height: grow(), direction: "ltr", gap: 1 }, bg: palette.gridBg }));
    for (let col = 0; col < GRID_COLUMNS; col++) {
      let index = row * GRID_COLUMNS + col;
      if (index >= state.cells.length) break;
      let cell = state.cells[index];
      ops.push(
        open(`box-${cell.id}`, {
          layout: {
            width: grow(),
            height: grow(),
            direction: "ttb",
            padding: { left: 1, top: 1 },
          },
          bg: cell.color,
          border: { color: rgba(10, 14, 18, 255), left: 1, right: 1, top: 1, bottom: 1 },
          cornerRadius: { tl: 1, tr: 1, bl: 1, br: 1 },
          transition: {
            duration: TRANSITION_DURATION,
            handler: TRANSITION_HANDLER.EASE_OUT,
            properties: TRANSITION_PROPERTY.POSITION |
              TRANSITION_PROPERTY.WIDTH |
              TRANSITION_PROPERTY.HEIGHT |
              TRANSITION_PROPERTY.BACKGROUND_COLOR,
            interactionHandling:
              TRANSITION_INTERACTION_HANDLING.DISABLE_WHILE_POSITIONING,
            enter: {
              preset: TRANSITION_PRESET.ENTER_FROM_LEFT,
              trigger: TRANSITION_ENTER_TRIGGER.TRIGGER_ON_FIRST_PARENT_FRAME,
            },
            exit: {
              preset: TRANSITION_PRESET.EXIT_TO_RIGHT,
              trigger: TRANSITION_EXIT_TRIGGER.TRIGGER_WHEN_PARENT_EXITS,
              siblingOrdering:
                EXIT_TRANSITION_SIBLING_ORDERING.NATURAL_ORDER,
            },
          },
        }),
        text(cell.label, { color: cell.textColor }),
        close(),
      );
    }
    ops.push(close());
  }

  ops.push(
    close(),
    open("", { layout: { width: grow(), height: grow() } }), close(),
    close(),
    open("", { layout: { width: grow(), height: grow() } }), close(),
    close(),
  );

  return ops;
}

function buttonRects(metrics = layoutMetrics(state.size)) {
  let labels = [
    { id: "shuffle", label: "Shuffle" },
    { id: "warm", label: "Warm" },
    { id: "cool", label: "Cool" },
    { id: "expand", label: state.expanded ? "Compact" : "Expand" },
  ];
  let panelX = Math.floor((state.size.width - metrics.panelWidth) / 2);
  let panelY = Math.floor((state.size.height - metrics.panelHeight) / 2);
  let startX = panelX + 1;
  let y = panelY + 3;
  return labels.map((button, index) => ({
    ...button,
    rect: {
      x: startX + index * (metrics.buttonWidth + CONTROL_GAP),
      y,
      width: metrics.buttonWidth,
      height: 1,
    },
  }));
}

function centerText(value: string, width: number): string {
  if (value.length >= width) return value.slice(0, width);
  let left = Math.floor((width - value.length) / 2);
  return `${" ".repeat(left)}${value}`.padEnd(width, " ");
}

async function pumpInput(queue: AsyncQueue<QueueEvent>, input: Input): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let emit = (bytes?: Uint8Array) => {
    let result = input.scan(bytes);
    for (let event of result.events) queue.push(event);
    if (result.pending) timer = setTimeout(() => emit(), result.pending.delay);
  };
  for await (let chunk of Deno.stdin.readable) {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    emit(chunk);
  }
}
