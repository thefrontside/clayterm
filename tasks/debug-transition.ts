import { createTerm } from "../term.ts";
import {
  close,
  fixed,
  open,
  rgba,
  text,
  TRANSITION_HANDLER,
  TRANSITION_INTERACTION_HANDLING,
  TRANSITION_PRESET,
  TRANSITION_PROPERTY,
  TRANSITION_ENTER_TRIGGER,
  TRANSITION_EXIT_TRIGGER,
  EXIT_TRANSITION_SIBLING_ORDERING,
} from "../ops.ts";
import { print } from "../test/print.ts";

let term = await createTerm({ width: 40, height: 10 });

let empty = [
  open("root", { layout: { width: fixed(40), height: fixed(10), direction: "ttb" } }),
  close(),
];

let withBox = [
  open("root", { layout: { width: fixed(40), height: fixed(10), direction: "ttb" } }),
  open("box", {
    layout: {
      width: fixed(12),
      height: fixed(5),
      direction: "ttb",
      padding: { left: 1, top: 1 },
      alignX: 2,
      alignY: 2,
    },
    border: {
      color: rgba(255, 255, 255),
      left: 1,
      right: 1,
      top: 1,
      bottom: 1,
    },
    transition: {
      duration: 0.25,
      handler: TRANSITION_HANDLER.EASE_OUT,
      properties: TRANSITION_PROPERTY.X,
      interactionHandling:
        TRANSITION_INTERACTION_HANDLING.DISABLE_WHILE_POSITIONING,
      enter: {
        preset: TRANSITION_PRESET.ENTER_FROM_LEFT,
        trigger: TRANSITION_ENTER_TRIGGER.TRIGGER_ON_FIRST_PARENT_FRAME,
      },
      exit: {
        preset: TRANSITION_PRESET.EXIT_TO_RIGHT,
        trigger: TRANSITION_EXIT_TRIGGER.TRIGGER_WHEN_PARENT_EXITS,
        siblingOrdering: EXIT_TRANSITION_SIBLING_ORDERING.NATURAL_ORDER,
      },
    },
  }),
  text("box"),
  close(),
  close(),
];

term.render(empty, { deltaTime: 0 });

let screen = Array.from({ length: 10 }, () => Array.from({ length: 40 }, () => " "));

function applyAnsi(ansi: string) {
  let x = 0;
  let y = 0;
  let i = 0;
  while (i < ansi.length) {
    if (ansi[i] === "\x1b" && ansi[i + 1] === "[") {
      i += 2;
      let params = "";
      while (i < ansi.length && ((ansi[i] >= "0" && ansi[i] <= "9") || ansi[i] === ";" || ansi[i] === "?")) {
        params += ansi[i++];
      }
      let cmd = ansi[i++];
      if (cmd === "H") {
        let parts = params.split(";");
        y = (parseInt(parts[0]) || 1) - 1;
        x = (parseInt(parts[1]) || 1) - 1;
      }
      continue;
    }
    let cp = ansi.codePointAt(i)!;
    let ch = String.fromCodePoint(cp);
    if (x >= 0 && x < 40 && y >= 0 && y < 10) screen[y][x] = ch;
    x += 1;
    i += ch.length;
  }
}

function dump() {
  return screen.map((row) => row.join("")).join("\n");
}

for (let frame = 0; frame < 30; frame++) {
  let result = term.render(withBox, { deltaTime: frame === 0 ? 0.016 : 0.016 });
  console.log("FRAME", frame, "active", result.hasActiveTransitions, "len", result.output.length);
  let ansi = new TextDecoder().decode(result.output);
  console.log(print(ansi, 40, 10));
  applyAnsi(ansi);
  console.log("COMPOSITE");
  console.log(dump());
}
