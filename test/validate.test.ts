import { beforeEach, describe, expect, it } from "./suite.ts";
import { createTerm, type Term } from "../term.ts";
import {
  close,
  grow,
  open,
  text,
  TRANSITION_HANDLER,
  TRANSITION_PRESET,
  TRANSITION_PROPERTY,
} from "../ops.ts";
import { assert, validate, validated } from "../validate.ts";
import { print } from "./print.ts";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("validate", () => {
  it("accepts valid ops", () => {
    expect(validate([
      open("root", { layout: { width: grow(), height: grow() } }),
      text("hello"),
      close(),
    ])).toBe(true);
  });

  it("accepts empty array", () => {
    expect(validate([])).toBe(true);
  });

  it("rejects ops with wrong id", () => {
    expect(validate([{ id: 0xff }])).toBe(false);
  });

  it("rejects open element missing name", () => {
    expect(validate([{ id: 0x02 }])).toBe(false);
  });

  it("rejects text missing content", () => {
    expect(validate([{ id: 0x03 }])).toBe(false);
  });

  it("rejects non-array", () => {
    expect(validate("garbage")).toBe(false);
  });

  it("rejects null", () => {
    expect(validate(null)).toBe(false);
  });

  it("assert throws TypeError on bad input", () => {
    expect(() => assert([{ id: 0x02 }])).toThrow(TypeError);
  });

  it("rejects padding > 255 (u8 overflow)", () => {
    expect(validate([
      open("x", { layout: { padding: { left: 300 } } }),
      close(),
    ])).toBe(false);
  });

  it("rejects fractional padding", () => {
    expect(validate([
      open("x", { layout: { padding: { left: 1.5 } } }),
      close(),
    ])).toBe(false);
  });

  it("rejects fontSize > 255", () => {
    expect(validate([text("hi", { fontSize: 256 })])).toBe(false);
  });

  it("rejects gap > 65535 (u16 overflow)", () => {
    expect(validate([
      open("x", { layout: { gap: 70000 } }),
      close(),
    ])).toBe(false);
  });

  it("rejects negative border width", () => {
    expect(validate([
      open("x", { border: { color: 0xFF0000, left: -1 } }),
      close(),
    ])).toBe(false);
  });

  it("rejects fractional color", () => {
    expect(validate([text("hi", { color: 1.5 })])).toBe(false);
  });

  it("accepts transition configs", () => {
    expect(validate([
      open("x", {
        transition: {
          duration: 0.3,
          handler: TRANSITION_HANDLER.EASE_OUT,
          properties: TRANSITION_PROPERTY.X,
          enter: { preset: TRANSITION_PRESET.ENTER_FROM_LEFT },
        },
      }),
      close(),
    ])).toBe(true);
  });
});

describe("validated", () => {
  let term: Term;

  beforeEach(async () => {
    term = validated(await createTerm({ width: 40, height: 10 }));
  });

  it("renders valid ops normally", () => {
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

  it("throws on invalid ops", () => {
    // deno-lint-ignore no-explicit-any
    expect(() => term.render([{ id: 0xff }] as any)).toThrow(TypeError);
  });
});
