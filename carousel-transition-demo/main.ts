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
const CONTROL_GAP = 2;
const CONTROL_TO_FRAME_GAP = 1;
const CONTROL_WIDTH_MIN = 8;
const CONTROL_WIDTH_MAX = 12;
const INDICATOR_WIDTH = 9;
const TRANSITION_DURATION = 0.28;

const palette = {
  appBg: rgba(7, 10, 16),
  frameBg: rgba(12, 18, 26),
  frameBorder: rgba(227, 202, 154),
  frameText: rgba(233, 236, 238),
  buttonBg: rgba(18, 28, 41),
  buttonHover: rgba(39, 62, 89),
  buttonPressed: rgba(77, 55, 29),
  buttonText: rgba(242, 243, 239),
  indicatorText: rgba(152, 178, 198),
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
  frameOuterWidth: number;
  frameOuterHeight: number;
  frameInnerWidth: number;
  frameInnerHeight: number;
  stackWidth: number;
  stackHeight: number;
  controlWidth: number;
  prevRect: Rect;
  nextRect: Rect;
}

interface PointerState {
  x: number;
  y: number;
  down: boolean;
}

interface AppState {
  size: TerminalSize;
  pointer: PointerState;
  currentSlide: number;
  targetSlide: number;
  previousSlide: number | null;
  direction: 1 | -1;
  pressedButton: ButtonName | null;
  animating: boolean;
}

interface SlideSpec {
  title: string;
  body: string[];
  art: (canvas: string[][]) => void;
}

type ButtonName = "prev" | "next";
type QueueEvent = InputEvent | { type: "sigwinch" } | { type: "tick" };

class AsyncQueue<T> {
  #values: T[] = [];
  #resolvers: ((value: T) => void)[] = [];

  push(value: T): void {
    let resolver = this.#resolvers.shift();
    if (resolver) {
      resolver(value);
    } else {
      this.#values.push(value);
    }
  }

  next(): Promise<T> {
    let value = this.#values.shift();
    if (value !== undefined) return Promise.resolve(value);
    return new Promise((resolve) => this.#resolvers.push(resolve));
  }
}

let slideSpecs: SlideSpec[] = [
  { title: "DUNES / 01", body: ["slow light over a quiet ridge"], art: drawDunes },
  { title: "TIDE / 02", body: ["night water and a patient little hull"], art: drawOcean },
  { title: "CITY / 03", body: ["late windows / low traffic / warm electric hum"], art: drawCity },
  { title: "ATLAS / 04", body: ["a room made from lines and timing"], art: drawGridRoom },
];

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

let queue = new AsyncQueue<QueueEvent>();
let tickTimer: ReturnType<typeof setTimeout> | undefined;
let state: AppState = {
  size,
  pointer: { x: -1, y: -1, down: false },
  currentSlide: 0,
  targetSlide: 0,
  previousSlide: null,
  direction: 1,
  pressedButton: null,
  animating: false,
};

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
  let controlWidth = clamp(
    Math.floor((size.width - INDICATOR_WIDTH - CONTROL_GAP * 2) / 2),
    CONTROL_WIDTH_MIN,
    CONTROL_WIDTH_MAX,
  );
  let controlGroupWidth = controlWidth * 2 + INDICATOR_WIDTH + CONTROL_GAP * 2;
  let maxFrameWidth = Math.max(18, size.width - 6);
  let maxFrameHeight = Math.max(8, size.height - CONTROL_TO_FRAME_GAP - 1 - 4);
  let frameOuterWidth = Math.min(maxFrameWidth, Math.floor(maxFrameHeight * 4 / 3));
  let frameOuterHeight = Math.min(maxFrameHeight, Math.floor(frameOuterWidth * 3 / 4));
  frameOuterWidth = Math.max(18, frameOuterWidth);
  frameOuterHeight = Math.max(8, frameOuterHeight);
  if (frameOuterHeight > maxFrameHeight) {
    frameOuterHeight = maxFrameHeight;
    frameOuterWidth = Math.max(18, Math.min(maxFrameWidth, Math.floor(frameOuterHeight * 4 / 3)));
  }
  if (frameOuterWidth > maxFrameWidth) {
    frameOuterWidth = maxFrameWidth;
    frameOuterHeight = Math.max(8, Math.min(maxFrameHeight, Math.floor(frameOuterWidth * 3 / 4)));
  }
  let frameInnerWidth = Math.max(1, frameOuterWidth - 2);
  let frameInnerHeight = Math.max(1, frameOuterHeight - 2);
  let stackHeight = frameOuterHeight + CONTROL_TO_FRAME_GAP + 1;
  let stackWidth = Math.max(frameOuterWidth, controlGroupWidth);
  let controlBaseX = Math.floor((size.width - controlGroupWidth) / 2);
  let frameTopY = Math.max(0, Math.floor((size.height - stackHeight) / 2));
  let controlY = frameTopY + frameOuterHeight + CONTROL_TO_FRAME_GAP;
  return {
    frameOuterWidth,
    frameOuterHeight,
    frameInnerWidth,
    frameInnerHeight,
    stackWidth,
    stackHeight,
    controlWidth,
    prevRect: { x: controlBaseX, y: controlY, width: controlWidth, height: 1 },
    nextRect: {
      x: controlBaseX + controlWidth + CONTROL_GAP + INDICATOR_WIDTH + CONTROL_GAP,
      y: controlY,
      width: controlWidth,
      height: 1,
    },
  };
}

function buttonAtPointer(pointer: PointerState, metrics = layoutMetrics(state.size)): ButtonName | null {
  if (inRect(pointer, metrics.prevRect)) return "prev";
  if (inRect(pointer, metrics.nextRect)) return "next";
  return null;
}

function inRect(pointer: PointerState, rect: Rect): boolean {
  return pointer.x >= rect.x && pointer.x < rect.x + rect.width &&
    pointer.y >= rect.y && pointer.y < rect.y + rect.height;
}

function updatePointer(event: MouseDownEvent | MouseMoveEvent | MouseUpEvent): void {
  state.pointer.x = event.x;
  state.pointer.y = event.y;
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
  switch (event.key) {
    case "q":
    case "Q":
      return true;
    case "ArrowLeft":
      queueTransition(-1);
      render(0);
      return false;
    case "ArrowRight":
      queueTransition(1);
      render(0);
      return false;
    default:
      return false;
  }
}

function handleMouseDown(event: MouseDownEvent): boolean {
  updatePointer(event);
  if (event.button !== "left") return false;
  state.pointer.down = true;
  state.pressedButton = buttonAtPointer(state.pointer);
  return true;
}

function handleMouseMove(event: MouseMoveEvent): boolean {
  updatePointer(event);
  return true;
}

function handleMouseUp(event: MouseUpEvent): boolean {
  updatePointer(event);
  let pressed = state.pressedButton;
  let hovered = buttonAtPointer(state.pointer);
  state.pointer.down = false;
  state.pressedButton = null;
  if ((event.button === "left" || event.button === "release") && pressed && hovered === pressed) {
    queueTransition(pressed === "prev" ? -1 : 1);
  }
  return true;
}

function queueTransition(direction: 1 | -1): void {
  if (state.animating) return;
  state.previousSlide = state.currentSlide;
  state.targetSlide = wrapSlide(state.currentSlide + direction);
  state.currentSlide = state.targetSlide;
  state.direction = direction;
  state.animating = true;
  scheduleTick();
}

function wrapSlide(index: number): number {
  return (index + slideSpecs.length) % slideSpecs.length;
}

function scheduleTick(): void {
  if (tickTimer || !state.animating) return;
  tickTimer = setTimeout(() => {
    tickTimer = undefined;
    if (state.animating) queue.push({ type: "tick" });
  }, TICK_MS);
}

function render(deltaTime: number): void {
  let { output, hasActiveTransitions } = term.render(buildOps(), { deltaTime });
  Deno.stdout.writeSync(output);
  if (state.animating && !hasActiveTransitions) {
    state.previousSlide = null;
    state.animating = false;
    return;
  }
  if (state.animating && hasActiveTransitions) {
    scheduleTick();
  }
}

function buildOps(): Op[] {
  let metrics = layoutMetrics(state.size);
  let hovered = buttonAtPointer(state.pointer, metrics);
  let indicator = `${padLeft(String(state.currentSlide + 1), 2)} / ${slideSpecs.length}`;
  let ops: Op[] = [];

  ops.push(
    open("root", { layout: { width: grow(), height: grow(), direction: "ttb" }, bg: palette.appBg }),
    open("", { layout: { width: grow(), height: grow() } }), close(),
    open("center-row", { layout: { width: grow(), height: fixed(metrics.stackHeight), direction: "ltr" }, bg: palette.appBg }),
    open("", { layout: { width: grow(), height: grow() } }), close(),
    open("stack", { layout: { width: fixed(metrics.stackWidth), height: fixed(metrics.stackHeight), direction: "ttb" }, bg: palette.appBg }),
    open("frame-row", { layout: { width: grow(), height: fixed(metrics.frameOuterHeight), direction: "ltr" }, bg: palette.appBg }),
    open("", { layout: { width: grow(), height: grow() } }), close(),
  );

  if (state.previousSlide !== null && state.animating) {
    pushTransitionSlide(ops, "previous", slideSpecs[state.previousSlide], metrics, state.direction, false);
  }
  pushTransitionSlide(ops, "current", slideSpecs[state.currentSlide], metrics, state.direction, true);

  ops.push(
    open("", { layout: { width: grow(), height: grow() } }), close(),
    close(),
    open("", { layout: { width: grow(), height: fixed(CONTROL_TO_FRAME_GAP) } }), close(),
    open("controls", { layout: { width: grow(), height: fixed(1), direction: "ltr" }, bg: palette.appBg }),
    open("", { layout: { width: grow(), height: grow() } }), close(),
  );

  pushButton(ops, "Prev", metrics.controlWidth, hovered === "prev", state.pressedButton === "prev");
  ops.push(open("", { layout: { width: fixed(CONTROL_GAP), height: fixed(1) }, bg: palette.appBg }), close());
  ops.push(open("indicator", { layout: { width: fixed(INDICATOR_WIDTH), height: fixed(1) }, bg: palette.appBg }), text(centerText(indicator, INDICATOR_WIDTH), { color: palette.indicatorText }), close());
  ops.push(open("", { layout: { width: fixed(CONTROL_GAP), height: fixed(1) }, bg: palette.appBg }), close());
  pushButton(ops, "Next", metrics.controlWidth, hovered === "next", state.pressedButton === "next");

  ops.push(
    open("", { layout: { width: grow(), height: grow() } }), close(),
    close(), close(),
    open("", { layout: { width: grow(), height: grow() } }), close(),
    close(), close(),
  );

  return ops;
}

function pushTransitionSlide(
  ops: Op[],
  key: string,
  slide: SlideSpec,
  metrics: LayoutMetrics,
  direction: 1 | -1,
  entering: boolean,
): void {
  let enterPreset = entering
    ? direction === 1
      ? TRANSITION_PRESET.ENTER_FROM_RIGHT
      : TRANSITION_PRESET.ENTER_FROM_LEFT
    : TRANSITION_PRESET.NONE;
  let exitPreset = !entering
    ? direction === 1
      ? TRANSITION_PRESET.EXIT_TO_LEFT
      : TRANSITION_PRESET.EXIT_TO_RIGHT
    : TRANSITION_PRESET.NONE;

  ops.push(
    open(`slide-${key}`, {
      layout: {
        width: fixed(metrics.frameOuterWidth),
        height: fixed(metrics.frameOuterHeight),
        direction: "ttb",
        padding: { left: 1, right: 1, top: 1, bottom: 1 },
      },
      bg: palette.frameBg,
      border: { color: palette.frameBorder, left: 1, right: 1, top: 1, bottom: 1 },
      cornerRadius: { tl: 1, tr: 1, bl: 1, br: 1 },
      transition: {
        duration: TRANSITION_DURATION,
        handler: TRANSITION_HANDLER.EASE_OUT,
        properties: TRANSITION_PROPERTY.X,
        interactionHandling: TRANSITION_INTERACTION_HANDLING.DISABLE_WHILE_POSITIONING,
        enter: {
          preset: enterPreset,
          trigger: TRANSITION_ENTER_TRIGGER.TRIGGER_ON_FIRST_PARENT_FRAME,
        },
        exit: {
          preset: exitPreset,
          trigger: TRANSITION_EXIT_TRIGGER.TRIGGER_WHEN_PARENT_EXITS,
          siblingOrdering: EXIT_TRANSITION_SIBLING_ORDERING.NATURAL_ORDER,
        },
      },
    }),
  );

  let rows = buildSlideRows(slide, metrics.frameInnerWidth, metrics.frameInnerHeight);
  for (let index = 0; index < rows.length; index++) {
    ops.push(
      open(`slide-${key}-row-${index}`, { layout: { width: grow(), height: fixed(1) }, bg: palette.frameBg }),
      text(rows[index], { color: palette.frameText }),
      close(),
    );
  }
  ops.push(close());
}

function pushButton(ops: Op[], label: string, width: number, hovered: boolean, pressed: boolean): void {
  let bg = pressed ? palette.buttonPressed : hovered ? palette.buttonHover : palette.buttonBg;
  ops.push(open("", { layout: { width: fixed(width), height: fixed(1) }, bg }), text(centerText(label, width), { color: palette.buttonText }), close());
}

function buildSlideRows(slide: SlideSpec, width: number, height: number): string[] {
  let canvas = createCanvas(width, height, " ");
  slide.art(canvas);
  write(canvas, 2, 1, slide.title);
  let bodyY = Math.max(2, height - slide.body.length - 1);
  for (let i = 0; i < slide.body.length; i++) {
    write(canvas, 2, bodyY + i, slide.body[i]);
  }
  return canvas.map((row) => row.join(""));
}

function createCanvas(width: number, height: number, fillChar: string): string[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => fillChar));
}

function put(canvas: string[][], x: number, y: number, ch: string): void {
  if (y < 0 || y >= canvas.length || x < 0 || x >= canvas[0].length) return;
  canvas[y][x] = ch;
}

function write(canvas: string[][], x: number, y: number, value: string): void {
  for (let i = 0; i < value.length; i++) put(canvas, x + i, y, value[i]);
}

function fillRect(canvas: string[][], x: number, y: number, width: number, height: number, ch: string): void {
  for (let yy = 0; yy < height; yy++) {
    for (let xx = 0; xx < width; xx++) put(canvas, x + xx, y + yy, ch);
  }
}

function drawDunes(canvas: string[][]): void {
  let width = canvas[0].length;
  let height = canvas.length;
  let sunX = Math.floor(width * 0.7);
  let sunY = Math.max(2, Math.floor(height * 0.28));
  let radius = Math.max(2, Math.floor(Math.min(width, height) * 0.08));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let dx = x - sunX;
      let dy = y - sunY;
      if (dx * dx + dy * dy <= radius * radius) put(canvas, x, y, "o");
    }
  }
  let horizon = Math.floor(height * 0.58);
  for (let x = 0; x < width; x++) {
    let ridge = horizon + Math.floor(Math.sin(x / 5) * 1.4);
    for (let y = ridge; y < height; y++) put(canvas, x, y, y % 2 === 0 ? "." : ",");
  }
  for (let x = 0; x < width; x++) {
    let front = Math.floor(height * 0.75) + Math.floor(Math.sin((x + 9) / 7) * 2);
    for (let y = front; y < height; y++) put(canvas, x, y, y % 2 === 0 ? ":" : ";");
  }
}

function drawOcean(canvas: string[][]): void {
  let width = canvas[0].length;
  let height = canvas.length;
  let moonX = Math.max(5, width - 10);
  let moonY = Math.max(2, Math.floor(height * 0.18));
  put(canvas, moonX, moonY, "(");
  put(canvas, moonX + 1, moonY, "_");
  put(canvas, moonX + 2, moonY, ")");
  for (let i = 0; i < Math.min(8, width / 6); i++) put(canvas, 4 + i * 6, 2 + (i % 2), ".");
  let waterStart = Math.floor(height * 0.58);
  for (let y = waterStart; y < height; y++) {
    for (let x = 0; x < width; x++) put(canvas, x, y, (x + y) % 4 < 2 ? "~" : "-");
  }
  let boatY = Math.max(3, waterStart - 2);
  let boatX = Math.max(2, Math.floor(width * 0.38));
  write(canvas, boatX, boatY, "  /\\");
  write(canvas, boatX - 1, boatY + 1, "_/__\\_");
}

function drawCity(canvas: string[][]): void {
  let width = canvas[0].length;
  let height = canvas.length;
  let ground = Math.floor(height * 0.72);
  for (let i = 0; i < Math.min(width / 5, 14); i++) put(canvas, 1 + i * 5, 2 + (i % 3), ".");
  let x = 0;
  let seed = 3;
  while (x < width) {
    let buildingWidth = 4 + (seed % 5);
    let buildingHeight = 4 + ((seed * 3) % Math.max(5, ground - 3));
    let top = Math.max(2, ground - buildingHeight);
    fillRect(canvas, x, top, Math.min(buildingWidth, width - x), ground - top, "#");
    for (let yy = top + 1; yy < ground - 1; yy += 2) {
      for (let xx = x + 1; xx < x + buildingWidth - 1 && xx < width - 1; xx += 2) {
        put(canvas, xx, yy, (xx + yy + seed) % 4 === 0 ? "*" : ".");
      }
    }
    x += buildingWidth + 1;
    seed += 2;
  }
  for (let xx = 0; xx < width; xx++) put(canvas, xx, ground, "=");
}

function drawGridRoom(canvas: string[][]): void {
  let width = canvas[0].length;
  let height = canvas.length;
  let vanishingX = Math.floor(width / 2);
  let horizon = Math.max(2, Math.floor(height * 0.35));
  for (let x = 0; x < width; x += 4) {
    let dx = x - vanishingX;
    for (let y = horizon; y < height; y++) {
      let xx = vanishingX + Math.floor(dx * (y - horizon) / Math.max(1, height - horizon));
      put(canvas, xx, y, y % 2 === 0 ? "/" : "\\");
    }
  }
  for (let y = horizon; y < height; y += 2) {
    for (let x = 0; x < width; x++) {
      if ((x + y) % 3 === 0) put(canvas, x, y, "-");
    }
  }
  let cardW = Math.max(12, Math.floor(width * 0.36));
  let cardH = Math.max(4, Math.floor(height * 0.24));
  let cardX = Math.floor((width - cardW) / 2);
  let cardY = Math.max(2, Math.floor(height * 0.16));
  drawAsciiBox(canvas, cardX, cardY, cardW, cardH);
  write(canvas, cardX + 2, cardY + 1, "native transitions");
  write(canvas, cardX + 2, cardY + 2, "whole-box motion");
}

function drawAsciiBox(canvas: string[][], x: number, y: number, width: number, height: number): void {
  if (width < 2 || height < 2) return;
  for (let xx = 1; xx < width - 1; xx++) {
    put(canvas, x + xx, y, "-");
    put(canvas, x + xx, y + height - 1, "-");
  }
  for (let yy = 1; yy < height - 1; yy++) {
    put(canvas, x, y + yy, "|");
    put(canvas, x + width - 1, y + yy, "|");
  }
  put(canvas, x, y, "+");
  put(canvas, x + width - 1, y, "+");
  put(canvas, x, y + height - 1, "+");
  put(canvas, x + width - 1, y + height - 1, "+");
}

function centerText(value: string, width: number): string {
  if (value.length >= width) return value.slice(0, width);
  let left = Math.floor((width - value.length) / 2);
  return `${" ".repeat(left)}${value}`.padEnd(width, " ");
}

function padLeft(value: string, width: number): string {
  if (value.length >= width) return value;
  return `${" ".repeat(width - value.length)}${value}`;
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
