import { beforeEach, describe, expect, it } from "./suite.ts";
import { createTerm, type Term } from "../term.ts";
import { close, grow, open, rgba, text } from "../ops.ts";
import { print } from "./print.ts";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("term", () => {
  let term: Term;

  beforeEach(async () => {
    term = await createTerm({ width: 40, height: 10 });
  });

  it("renders hello world", () => {
    let out = print(
      decode(term.render([
        open("root", {
          layout: { width: grow(), height: grow(), direction: "ttb" },
        }),
        text("Hello, World!"),
        close(),
      ])),
      40,
      10,
    );

    expect(out).toContain("Hello, World!");
  });

  it("text inherits parent background", () => {
    let ansi = decode(term.render([
      open("root", {
        layout: { width: grow(), height: grow(), direction: "ttb" },
        bg: rgba(255, 0, 0),
      }),
      text("hi"),
      close(),
    ]));

    // the SGR active when "h" is emitted should include the
    // parent's red background (48;2;255;0;0), not terminal default
    let before = ansi.slice(0, ansi.indexOf("h"));
    expect(before).toContain("\x1b[48;2;255;0;0");
  });

  it("renders borders and padding", () => {
    let out = print(
      decode(term.render([
        open("box", {
          layout: {
            width: grow(),
            height: grow(),
            padding: { left: 5, top: 5 },
            direction: "ttb",
          },
          border: {
            color: rgba(0, 255, 0),
            left: 1,
            right: 1,
            top: 1,
            bottom: 1,
          },
          cornerRadius: { tl: 1, tr: 1, bl: 1, br: 1 },
        }),
        text("padded"),
        close(),
      ])),
      40,
      10,
    );

    expect(out).toEqual(`
╭──────────────────────────────────────╮
│                                      │
│                                      │
│                                      │
│                                      │
│    padded                            │
│                                      │
│                                      │
│                                      │
╰──────────────────────────────────────╯`.trim());
  });
});
