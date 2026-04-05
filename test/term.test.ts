import { beforeEach, describe, expect, it } from "./suite.ts";
import { createTerm, type Term } from "../term.ts";
import {
  ATTACH_POINT,
  ATTACH_TO,
  EXIT_TRANSITION_SIBLING_ORDERING,
  TRANSITION_ENTER_TRIGGER,
  TRANSITION_EXIT_TRIGGER,
  TRANSITION_HANDLER,
  TRANSITION_INTERACTION_HANDLING,
  TRANSITION_PRESET,
  TRANSITION_PROPERTY,
  close,
  fixed,
  grow,
  open,
  rgba,
  text,
} from "../ops.ts";
import { print } from "./print.ts";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("term", () => {
  let term: Term;

  beforeEach(async () => {
    term = await createTerm({ width: 40, height: 10 });
  });

  it("renders hello world", () => {
    let out = print(
      decode(
        term.render([
          open("root", {
            layout: { width: grow(), height: grow(), direction: "ttb" },
          }),
          text("Hello, World!"),
          close(),
        ]).output,
      ),
      40,
      10,
    );

    expect(out).toContain("Hello, World!");
  });

  it("text inherits parent background", () => {
    let ansi = decode(
      term.render([
        open("root", {
          layout: { width: grow(), height: grow(), direction: "ttb" },
          bg: rgba(255, 0, 0),
        }),
        text("hi"),
        close(),
      ]).output,
    );

    // the SGR active when "h" is emitted should include the
    // parent's red background (48;2;255;0;0), not terminal default
    let before = ansi.slice(0, ansi.indexOf("h"));
    expect(before).toContain("\x1b[48;2;255;0;0");
  });

  it("renders borders and padding", () => {
    let out = print(
      decode(
        term.render([
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
        ]).output,
      ),
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

  it("clips children with horizontal child offsets", () => {
    let out = print(
      decode(
        term.render([
          open("root", {
            layout: { width: fixed(40), height: fixed(10), direction: "ttb" },
          }),
          open("viewport", {
            layout: { width: fixed(8), height: fixed(1) },
            clip: { horizontal: true, childOffset: { x: -2 } },
          }),
          open("track", {
            layout: { width: fixed(12), height: fixed(1), direction: "ltr" },
          }),
          open("a", { layout: { width: fixed(4), height: fixed(1) } }),
          text("ABCD"),
          close(),
          open("b", { layout: { width: fixed(4), height: fixed(1) } }),
          text("EFGH"),
          close(),
          open("c", { layout: { width: fixed(4), height: fixed(1) } }),
          text("IJKL"),
          close(),
          close(),
          close(),
          close(),
        ]).output,
      ),
      40,
      10,
    );

    expect(out.split("\n")[0]).toBe("CDEFGHIJ                                ");
  });

  it("moves a bordered floating frame as one unit", () => {
    let out = print(
      decode(
        term.render([
          open("root", {
            layout: { width: fixed(40), height: fixed(10), direction: "ttb" },
          }),
          open("frame", {
            layout: {
              width: fixed(12),
              height: fixed(5),
              direction: "ttb",
              padding: { left: 1, top: 1 },
            },
            border: {
              color: rgba(255, 255, 255),
              left: 1,
              right: 1,
              top: 1,
              bottom: 1,
            },
            floating: {
              x: 3,
              y: 1,
              attachTo: ATTACH_TO.ROOT,
              attachPoints: {
                element: ATTACH_POINT.CENTER_CENTER,
                parent: ATTACH_POINT.CENTER_CENTER,
              },
            },
          }),
          text("box"),
          close(),
          close(),
        ]).output,
      ),
      40,
      10,
    );

    expect(out).toContain("│box       │");
    expect(out.split("\n")[3]).toContain("┌──────────┐");
  });

  it("accepts transition-configured elements across frames", () => {
    let ops = [
      open("root", {
        layout: { width: fixed(40), height: fixed(10), direction: "ttb" },
      }),
      open("box", {
        layout: {
          width: fixed(12),
          height: fixed(5),
          direction: "ttb",
          padding: { left: 1, top: 1 },
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
            siblingOrdering:
              EXIT_TRANSITION_SIBLING_ORDERING.NATURAL_ORDER,
          },
        },
      }),
      text("transition"),
      close(),
      close(),
    ];

    expect(() => {
      term.render(ops, { deltaTime: 0 });
      term.render(ops, { deltaTime: 0.016 });
    }).not.toThrow();
  });

  it("reports active transitions while a transition is running", () => {
    let enterOps = [
      open("root", {
        layout: { width: fixed(40), height: fixed(10), direction: "ttb" },
      }),
      close(),
    ];

    let transitionOps = [
      open("root", {
        layout: { width: fixed(40), height: fixed(10), direction: "ttb" },
      }),
      open("box", {
        layout: {
          width: fixed(12),
          height: fixed(5),
          direction: "ttb",
          padding: { left: 1, top: 1 },
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
        },
      }),
      text("box"),
      close(),
      close(),
    ];

    term.render(enterOps, { deltaTime: 0 });
    let result = term.render(transitionOps, { deltaTime: 0.016 });
    expect(result.hasActiveTransitions).toBe(true);
  });

  describe("row offset", () => {
    it("renders two frames at the offset position", async () => {
      let term = await createTerm({ width: 20, height: 5, top: 5 });
      let box = (msg: string) => [
        open("root", {
          layout: { width: grow(), height: grow(), direction: "ttb" },
        }),
        open("box", {
          layout: {
            width: grow(),
            height: grow(),
            direction: "ttb",
            padding: { left: 1, top: 1 },
          },
          border: {
            color: rgba(255, 255, 255),
            left: 1,
            right: 1,
            top: 1,
            bottom: 1,
          },
        }),
        text(msg),
        close(),
        close(),
      ];

      let header = await createTerm({ width: 20, height: 5 });
      let banner = decode(header.render(box("hello")).output);

      let first = decode(term.render(box("world")).output);
      expect(print(banner + first, 20, 10)).toEqual(`\
┌──────────────────┐
│hello             │
│                  │
│                  │
└──────────────────┘
┌──────────────────┐
│world             │
│                  │
│                  │
└──────────────────┘`);

      let second = decode(term.render(box("universe")).output);
      expect(print(banner + first + second, 20, 10)).toEqual(`\
┌──────────────────┐
│hello             │
│                  │
│                  │
└──────────────────┘
┌──────────────────┐
│universe          │
│                  │
│                  │
└──────────────────┘`);
    });
  });
});
