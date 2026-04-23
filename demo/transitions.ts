/**
 * Transitions demo — a sidebar that smoothly toggles between collapsed and expanded states.
 *
 * Exercises v1 transitions: one duration, one easing, multiple properties
 * (width + bg) on a single element.
 */

import { main, sleep, until } from "effection";
import {
  close,
  createTerm,
  cursor,
  fixed,
  grow,
  open,
  rgba,
  settings,
  text,
} from "../mod.ts";
import { alternateBuffer } from "../settings.ts";

const BG_COLLAPSED = rgba(30, 30, 60);
const BG_EXPANDED = rgba(80, 80, 140);
const CONTENT_BG = rgba(20, 20, 20);
const TEXT_COLOR = rgba(220, 220, 220);

await main(function* () {
  let term = yield* until(createTerm({ width: 60, height: 18 }));
  let tty = settings(alternateBuffer(), cursor(false));
  Deno.stdout.writeSync(tty.apply);

  try {
    let expanded = false;
    let lastToggle = 0;

    for (let i = 0; i < 400; i++) {
      let wallMs = i * 25;
      if (wallMs - lastToggle > 2000) {
        expanded = !expanded;
        lastToggle = wallMs;
      }

      let ops = [
        open("root", {
          layout: { width: grow(), height: grow(), direction: "ltr" },
        }),
        open("sidebar", {
          layout: {
            width: fixed(expanded ? 24 : 4),
            height: grow(),
            padding: { left: 1, right: 1, top: 1, bottom: 1 },
            direction: "ttb",
          },
          bg: expanded ? BG_EXPANDED : BG_COLLAPSED,
          transition: {
            duration: 0.4,
            easing: "easeInOut",
            properties: ["width", "bg"],
          },
        }),
        open("label", {
          layout: { width: grow(), height: fixed(1) },
        }),
        text(expanded ? "Menu" : "", { color: TEXT_COLOR }),
        close(),
        close(),
        open("content", {
          layout: {
            width: grow(),
            height: grow(),
            padding: { left: 2, right: 2, top: 1, bottom: 1 },
          },
          bg: CONTENT_BG,
        }),
        open("body", { layout: { width: grow(), height: grow() } }),
        text("clayterm transitions demo", { color: TEXT_COLOR }),
        close(),
        close(),
        close(),
      ];

      let r = term.render(ops);
      Deno.stdout.writeSync(r.output);
      yield* sleep(25);
    }
  } finally {
    Deno.stdout.writeSync(tty.revert);
  }
});
