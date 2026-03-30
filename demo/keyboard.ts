// deno-lint-ignore-file no-fallthrough
import { each, ensure, main, until } from "effection";
import {
  close,
  createTerm,
  fixed,
  grow,
  type InputEvent,
  type KeyEvent,
  type Op,
  open,
  rgba,
  text,
} from "../mod.ts";
import { useInput } from "./use-input.ts";
import { useStdin } from "./use-stdin.ts";

let active = rgba(60, 120, 220);
let inactive = rgba(50, 50, 60);
let on = rgba(40, 180, 80);
let label = rgba(220, 220, 220);
let dim = rgba(100, 100, 120);
let highlight = rgba(255, 220, 80);

let KEY_W = 5;
let GAP = 1;

interface KeyDef {
  label: string;
  width?: number;
  match: (event: InputEvent) => boolean;
}

function isKeyEvent(e: InputEvent): e is KeyEvent {
  return e.type === "keydown" || e.type === "keyrepeat" || e.type === "keyup";
}

function is(...codes: string[]): (event: InputEvent) => boolean {
  return (e) =>
    isKeyEvent(e) && e.type === "keydown" && codes.some((c) => e.code.toUpperCase() === c.toUpperCase());
}


function key(ops: Op[], k: KeyDef, ctx: AppContext): void {
  let bg = ctx.event && k.match(ctx.event) ? active : inactive;
  let w = k.width ?? KEY_W;
  ops.push(
    open("box", {
      layout: {
        width: fixed(w),
        height: grow(),
        padding: { left: 1, right: 1 },
        alignX: 2,
        alignY: 2,
      },
      bg,
    }),
    text(k.label, { color: label }),
    close(),
  );
}

function row(ops: Op[], keys: KeyDef[], ctx: AppContext): void {
  ops.push(
    open("box", { layout: { direction: "ltr", gap: GAP, height: fixed(3) } }),
  );
  for (let k of keys) {
    key(ops, k, ctx);
  }
  ops.push(close());
}

function spacer(ops: Op[], width: number): void {
  ops.push(
    open("box", { layout: { width: fixed(width), height: grow() } }),
    close(),
  );
}

function mainKeys(ops: Op[], ctx: AppContext): void {
  ops.push(
    open("box", { layout: { direction: "ttb", gap: GAP } }),
  );

  row(ops, [
    { label: "Esc", width: 11, match: is("Escape") },
    { label: "F1", match: is("F1") },
    { label: "F2", match: is("F2") },
    { label: "F3", match: is("F3") },
    { label: "F4", match: is("F4") },
    { label: "F5", match: is("F5") },
    { label: "F6", match: is("F6") },
    { label: "F7", match: is("F7") },
    { label: "F8", match: is("F8") },
    { label: "F9", match: is("F9") },
    { label: "F10", match: is("F10") },
    { label: "F11", match: is("F11") },
    { label: "F12", match: is("F12") },
  ], ctx);

  row(ops, [
    { label: "`", match: is("`") },
    { label: "1", match: is("1") },
    { label: "2", match: is("2") },
    { label: "3", match: is("3") },
    { label: "4", match: is("4") },
    { label: "5", match: is("5") },
    { label: "6", match: is("6") },
    { label: "7", match: is("7") },
    { label: "8", match: is("8") },
    { label: "9", match: is("9") },
    { label: "0", match: is("0") },
    { label: "-", match: is("-") },
    { label: "=", match: is("=") },
    { label: "Bksp", width: 9, match: is("Backspace") },
  ], ctx);

  row(ops, [
    { label: "Tab", width: 7, match: is("Tab") },
    { label: "Q", match: is("q") },
    { label: "W", match: is("w") },
    { label: "E", match: is("e") },
    { label: "R", match: is("r") },
    { label: "T", match: is("t") },
    { label: "Y", match: is("y") },
    { label: "U", match: is("u") },
    { label: "I", match: is("i") },
    { label: "O", match: is("o") },
    { label: "P", match: is("p") },
    { label: "[", match: is("[") },
    { label: "]", match: is("]") },
    { label: "\\", width: 7, match: is("\\") },
  ], ctx);

  row(ops, [
    { label: "Caps", width: 9, match: is("CapsLock") },
    { label: "A", match: is("a") },
    { label: "S", match: is("s") },
    { label: "D", match: is("d") },
    { label: "F", match: is("f") },
    { label: "G", match: is("g") },
    { label: "H", match: is("h") },
    { label: "J", match: is("j") },
    { label: "K", match: is("k") },
    { label: "L", match: is("l") },
    { label: ";", match: is(";") },
    { label: "'", match: is("'") },
    { label: "Enter", width: 10, match: is("Enter") },
  ], ctx);

  row(ops, [
    { label: "Shift", width: 11, match: is("ShiftLeft") },
    { label: "Z", match: is("z") },
    { label: "X", match: is("x") },
    { label: "C", match: is("c") },
    { label: "V", match: is("v") },
    { label: "B", match: is("b") },
    { label: "N", match: is("n") },
    { label: "M", match: is("m") },
    { label: ",", match: is(",") },
    { label: ".", match: is(".") },
    { label: "/", match: is("/") },
    { label: "Shift", width: 13, match: is("ShiftRight") },
  ], ctx);

  row(ops, [
    { label: "Ctrl", width: 7, match: is("ControlLeft") },
    { label: "Win", width: 6, match: is("SuperLeft") },
    { label: "Alt", width: 6, match: is("AltLeft") },
    { label: "", width: 33, match: is(" ") },
    { label: "Alt", width: 6, match: is("AltRight") },
    { label: "Win", width: 6, match: is("SuperRight") },
    { label: "Menu", width: 6, match: is() },
    { label: "Ctrl", width: 7, match: is("ControlRight") },
  ], ctx);

  ops.push(close());
}

function navKeys(ops: Op[], ctx: AppContext): void {
  ops.push(
    open("box", { layout: { direction: "ttb", gap: GAP } }),
  );

  // top section: Ins/Home/PgUp, Del/End/PgDn
  row(ops, [
    { label: "Ins", width: 6, match: is("Insert") },
    { label: "Home", width: 6, match: is("Home") },
    { label: "PgUp", width: 6, match: is("PageUp") },
  ], ctx);

  row(ops, [
    { label: "Del", width: 6, match: is("Delete") },
    { label: "End", width: 6, match: is("End") },
    { label: "PgDn", width: 6, match: is("PageDown") },
  ], ctx);

  // gap before arrows
  ops.push(
    open("box", { layout: { height: fixed(3) } }),
    close(),
  );

  // arrow up
  ops.push(
    open("box", { layout: { direction: "ltr", gap: GAP, height: fixed(3) } }),
  );
  spacer(ops, 6);
  key(ops, { label: "\u2191", width: 6, match: is("ArrowUp") }, ctx);
  spacer(ops, 6);
  ops.push(close());

  // arrow left/down/right
  row(ops, [
    { label: "\u2190", width: 6, match: is("ArrowLeft") },
    { label: "\u2193", width: 6, match: is("ArrowDown") },
    { label: "\u2192", width: 6, match: is("ArrowRight") },
  ], ctx);

  ops.push(close());
}

function numpad(ops: Op[], ctx: AppContext): void {
  ops.push(
    open("box", { layout: { direction: "ttb", gap: GAP } }),
  );

  row(ops, [
    { label: "Num", width: 6, match: is("NumLock") },
    { label: "/", width: 6, match: is("NumpadDivide") },
    { label: "*", width: 6, match: is("NumpadMultiply") },
    { label: "-", width: 6, match: is("NumpadSubtract") },
  ], ctx);

  // rows 2-3 grouped horizontally so + spans both
  ops.push(
    open("box", { layout: { direction: "ltr", gap: GAP } }),
  );

  // left side: 7-8-9 and 4-5-6 stacked
  ops.push(
    open("box", { layout: { direction: "ttb", gap: GAP } }),
  );
  row(ops, [
    { label: "7", width: 6, match: is("Numpad7") },
    { label: "8", width: 6, match: is("Numpad8") },
    { label: "9", width: 6, match: is("Numpad9") },
  ], ctx);
  row(ops, [
    { label: "4", width: 6, match: is("Numpad4") },
    { label: "5", width: 6, match: is("Numpad5") },
    { label: "6", width: 6, match: is("Numpad6") },
  ], ctx);
  ops.push(close());

  // + spanning both rows
  key(ops, { label: "+", match: is("NumpadAdd") }, ctx);

  ops.push(close());

  // rows 4-5 grouped horizontally so Enter spans both
  ops.push(
    open("box", { layout: { direction: "ltr", gap: GAP } }),
  );

  // left side: 1-2-3 and 0-. stacked
  ops.push(
    open("box", { layout: { direction: "ttb", gap: GAP } }),
  );
  row(ops, [
    { label: "1", width: 6, match: is("Numpad1") },
    { label: "2", width: 6, match: is("Numpad2") },
    { label: "3", width: 6, match: is("Numpad3") },
  ], ctx);
  row(ops, [
    { label: "0", width: 13, match: is("Numpad0") },
    { label: ".", width: 6, match: is("NumpadDecimal") },
  ], ctx);
  ops.push(close());

  // Enter spanning both rows
  key(ops, { label: "Ent", match: is("NumpadEnter") }, ctx);

  ops.push(close());

  ops.push(close());
}

function toggle(ops: Op[], enabled: boolean, name: string): void {
  let indicator = enabled
    ? "\u25cf\u2500\u2500\u2500"
    : "\u2500\u2500\u2500\u25cb";
  ops.push(
    open("box", {
      layout: {
        direction: "ltr",
        height: fixed(1),
        gap: 1,
      },
    }),
    text(indicator, { color: enabled ? on : dim }),
    text(name, { color: enabled ? label : dim }),
    close(),
  );
}

let flagNames: (keyof Omit<AppContext, "mode" | "event">)[] = [
  "Disambiguate escape codes",
  "Report event types",
  "Report alternate keys",
  "Report all keys as escapes",
  "Report associated text",
];

function flagPanel(ops: Op[], ctx: AppContext): void {
  let color = ctx.mode === "config" ? active : rgba(0, 0, 0, 0);
  ops.push(open("box", {
    layout: {
      direction: "ttb",
      gap: 1,
      padding: { left: 1, right: 1, top: 1, bottom: 1 },
    },
    border: { color, left: 1, right: 1, top: 1, bottom: 1 },
  }));

  ops.push(
    open("box", { layout: { height: fixed(1) } }),
    text("Keyboard Protocol Level", { color: highlight }),
    close(),
  );

  for (let i = 0; i < flagNames.length; i++) {
    let name = flagNames[i];
    ops.push(
      open("box", { layout: { direction: "ltr", height: fixed(1), gap: 1 } }),
    );
    ops.push(text(`${i + 1}.`, { color: dim }));
    toggle(ops, ctx[name], name);
    ops.push(close());
  }

  ops.push(close());
}

function keyboard(ctx: AppContext): Op[] {
  let ops: Op[] = [];

  // root
  ops.push(
    open("box", {
      layout: {
        width: grow(),
        height: grow(),
        direction: "ttb",
        alignX: 2,
        alignY: 2,
        padding: { left: 2, top: 1 },
      },
    }),
  );

  // keyboard + toggles wrapper
  ops.push(
    open("box", { layout: { direction: "ttb" } }),
  );

  // mode badge
  let badgeBg = ctx.mode === "input" ? rgba(40, 120, 200) : rgba(200, 120, 40);
  let badgeLabel = ctx.mode === "input" ? "input" : "config";
  let badgeHint = ctx.mode === "input"
    ? "Ctrl+X Ctrl+X to enter config"
    : "Set flags with keys [0-5], Enter to save";
  ops.push(
    open("box", { layout: { direction: "ltr", height: fixed(1), padding: { bottom: 1 } } }),
    open("box", { layout: { padding: { left: 1, right: 1 } }, bg: rgba(60, 60, 60) }),
    text("mode", { color: rgba(220, 220, 220) }),
    close(),
    open("box", { layout: { padding: { left: 1, right: 1 } }, bg: badgeBg }),
    text(badgeLabel, { color: rgba(255, 255, 255) }),
    close(),
    text(` ${badgeHint}`, { color: dim }),
    close(),
  );

  // toggles right-aligned above keyboard
  ops.push(
    open("box", {
      layout: {
        width: grow(),
        direction: "ltr",
        alignX: 1,
        padding: { bottom: 1 },
      },
    }),
  );
  flagPanel(ops, ctx);
  ops.push(close());

  // three keyboard groups side by side, bottom-aligned
  let kbColor = ctx.mode === "input" ? active : rgba(0, 0, 0, 0);
  ops.push(
    open("box", {
      layout: {
        direction: "ltr",
        gap: 3,
        alignY: 1,
        padding: { left: 1, right: 1, top: 1, bottom: 1 },
      },
      border: { color: kbColor, left: 1, right: 1, top: 1, bottom: 1 },
    }),
  );

  mainKeys(ops, ctx);
  navKeys(ops, ctx);
  numpad(ops, ctx);

  ops.push(close());

  ops.push(close()); // keyboard + toggles wrapper

  // raw event display
  ops.push(
    open("box", { layout: { height: fixed(1), padding: { top: 1 } } }),
    text(ctx.event ? JSON.stringify(ctx.event) : "Press any key...", {
      color: highlight,
    }),
    close(),
  );

  ops.push(close());

  return ops;
}

let encoder = new TextEncoder();
let esc = (s: string) => Deno.stdout.writeSync(encoder.encode(s));

function ttyFlags(ctx: AppContext): Uint8Array {
  let bits = 0;
  if (ctx["Disambiguate escape codes"]) bits |= 1;
  if (ctx["Report event types"]) bits |= 2;
  if (ctx["Report alternate keys"]) bits |= 4;
  if (ctx["Report all keys as escapes"]) bits |= 8;
  if (ctx["Report associated text"]) bits |= 16;
  return encoder.encode(`\x1b[<u\x1b[>${bits}u`);
}

await main(function* () {
  let { columns, rows } = Deno.stdout.isTerminal()
    ? Deno.consoleSize()
    : { columns: 80, rows: 24 };

  Deno.stdin.setRaw(true);

  let stdin = yield* useStdin();
  let input = useInput(stdin);

  let term = yield* until(createTerm({ width: columns, height: rows }));

  esc("\x1b[?1049h\x1b[?25l\x1b[>3u");
  yield* ensure(() => {
    esc("\x1b[<u\x1b[?25h\x1b[?1049l");
  });

  let modality = recognizer();

  let context = modality.next().value;

  Deno.stdout.writeSync(term.render(keyboard(context)));

  for (let event of yield* each(input)) {    
    if (event.type === "keydown" && event.ctrl && event.key === "c") {
      break;
    }
       
    context = modality.next(event).value;

    Deno.stdout.writeSync(ttyFlags(context));

    Deno.stdout.writeSync(term.render(keyboard(context)));

    yield* each.next();
  }
});

function* recognizer(): Iterator<AppContext, never, InputEvent> {
  let current: AppContext = {
    mode: "input",
    "Disambiguate escape codes": true,
    "Report event types": true,
    "Report alternate keys": false,
    "Report all keys as escapes": false,
    "Report associated text": false,
    event: null,
  };

  let event: InputEvent = yield current;

  let mode = inputmode({ ...current, event });

  while (true) {
    mode = yield* mode;
  }
}

type Mode = Iterable<AppContext, Mode, InputEvent>;

function* inputmode(context: AppContext): Mode {
  context = { ...context, mode: "input" };
  let event = context.event ? context.event : yield context;
  while (true) {
    context = { ...context, event };
    if (event.type === "keydown" && event.key === "x" && event.ctrl) {
      let next = yield context;
      while (next.type !== "keydown") {
        context = { ...context, event: next };
        next = yield context;
      }
      context = { ...context, event: next };
      if (next.key === "x" && next.ctrl) {
        return configmode({
          ...context,
          event: null,
        });
      }
    }
    event = yield context;
  }
}

function* configmode(context: AppContext): Mode {
  context = { ...context, mode: "config" };
  let event = yield context;
  while (true) {
    if (event.type === "keydown" && event.key === "Enter") {
      return inputmode({...context, event: null });
    }
    if (event.type === "keydown" && "012345".indexOf(event.key) >= 0) {
      context = { ...context };
      context["Report associated text"] = false;
      context["Report all keys as escapes"] = false;
      context["Report alternate keys"] = false;
      context["Report event types"] = false;
      context["Disambiguate escape codes"] = false;                        
      switch (event.key) {
        case "5":
          context["Report associated text"] = true;
        case "4":
          context["Report all keys as escapes"] = true;
        case "3":
          context["Report alternate keys"] = true;
        case "2":
          context["Report event types"] = true;
        case "1":
          context["Disambiguate escape codes"] = true;
          break;
        case "0":
          break;
      }
    }
    event = yield context;
  }
}



type AppContext = {
  mode: "input" | "config";
  event: InputEvent | null;  
  ["Disambiguate escape codes"]: boolean;
  ["Report event types"]: boolean;
  ["Report alternate keys"]: boolean;
  ["Report all keys as escapes"]: boolean;
  ["Report associated text"]: boolean;
};

