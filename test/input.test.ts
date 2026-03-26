import { beforeEach, describe, expect, it } from "./suite.ts";
import { createInput, type Input } from "../input.ts";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function str(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe("input", () => {
  let input: Input;

  beforeEach(async () => {
    input = await createInput({ escLatency: 25 });
  });

  describe("printable ASCII", () => {
    it("parses a single character", () => {
      let result = input.scan(bytes(0x61)); // 'a'
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({ type: "char", key: "a" });
    });

    it("parses multiple characters", () => {
      let result = input.scan(str("hello"));
      expect(result.events.length).toBe(5);
      expect(result.events[0]).toMatchObject({ type: "char", key: "h" });
      expect(result.events[4]).toMatchObject({ type: "char", key: "o" });
    });
  });

  describe("control characters", () => {
    it("parses Ctrl+C", () => {
      let result = input.scan(bytes(0x03));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "char",
        key: "c",
        ctrl: true,
      });
    });

    it("parses Tab without ctrl modifier", () => {
      let result = input.scan(bytes(0x09));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({ type: "key", key: "Tab" });
    });

    it("parses Enter without ctrl modifier", () => {
      let result = input.scan(bytes(0x0d));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({ type: "key", key: "Enter" });
    });
  });

  describe("backspace", () => {
    it("parses 0x7f as backspace", () => {
      let result = input.scan(bytes(0x7f));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({ type: "key", key: "Backspace" });
    });
  });

  describe("arrow keys", () => {
    it("parses arrow up (CSI)", () => {
      let result = input.scan(bytes(0x1b, 0x5b, 0x41));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({ type: "key", key: "ArrowUp" });
    });

    it("parses arrow down (SS3)", () => {
      let result = input.scan(bytes(0x1b, 0x4f, 0x42));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({ type: "key", key: "ArrowDown" });
    });
  });

  describe("modifier combos", () => {
    it("parses Ctrl+Arrow Up", () => {
      let result = input.scan(bytes(0x1b, 0x5b, 0x31, 0x3b, 0x35, 0x41));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "key",
        key: "ArrowUp",
        ctrl: true,
      });
    });

    it("parses Shift+Arrow Up", () => {
      let result = input.scan(bytes(0x1b, 0x5b, 0x31, 0x3b, 0x32, 0x41));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "key",
        key: "ArrowUp",
        shift: true,
      });
    });

    it("parses Ctrl+Alt+Shift combo", () => {
      let result = input.scan(bytes(0x1b, 0x5b, 0x31, 0x3b, 0x38, 0x41));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "key",
        key: "ArrowUp",
        ctrl: true,
        alt: true,
        shift: true,
      });
    });
  });

  describe("function keys", () => {
    it("parses F1 (SS3)", () => {
      let result = input.scan(bytes(0x1b, 0x4f, 0x50));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({ type: "key", key: "F1" });
    });

    it("parses F5 (CSI ~)", () => {
      let result = input.scan(str("\x1b[15~"));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({ type: "key", key: "F5" });
    });
  });

  describe("navigation keys", () => {
    it("parses Home", () => {
      let result = input.scan(bytes(0x1b, 0x4f, 0x48));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({ type: "key", key: "Home" });
    });

    it("parses End", () => {
      let result = input.scan(bytes(0x1b, 0x4f, 0x46));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({ type: "key", key: "End" });
    });

    it("parses Delete", () => {
      let result = input.scan(str("\x1b[3~"));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({ type: "key", key: "Delete" });
    });

    it("parses PgDn with Ctrl", () => {
      let result = input.scan(str("\x1b[6;5~"));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "key",
        key: "PageDown",
        ctrl: true,
      });
    });
  });

  describe("mouse", () => {
    it("parses SGR mouse press", () => {
      let result = input.scan(str("\x1b[<0;35;12M"));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "mouse",
        button: "left",
        x: 34,
        y: 11,
      });
    });

    it("parses SGR left release", () => {
      let result = input.scan(str("\x1b[<0;10;5m"));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "mouse",
        button: "left",
        x: 9,
        y: 4,
        release: true,
      });
    });

    it("parses SGR right release", () => {
      let result = input.scan(str("\x1b[<2;10;5m"));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "mouse",
        button: "right",
        x: 9,
        y: 4,
        release: true,
      });
    });

    it("parses SGR middle release", () => {
      let result = input.scan(str("\x1b[<1;10;5m"));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "mouse",
        button: "middle",
        x: 9,
        y: 4,
        release: true,
      });
    });

    it("parses VT200 release", () => {
      // button 3 = release (0x23 = 3 + 0x20), x=10 (0x2b), y=5 (0x26)
      let result = input.scan(bytes(0x1b, 0x5b, 0x4d, 0x23, 0x2b, 0x26));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "mouse",
        button: "release",
        x: 10,
        y: 5,
        release: true,
      });
    });

    it("parses SGR wheel up", () => {
      let result = input.scan(str("\x1b[<64;15;20M"));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "wheel",
        direction: "up",
        x: 14,
        y: 19,
      });
    });

    it("parses SGR wheel down", () => {
      let result = input.scan(str("\x1b[<65;15;20M"));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "wheel",
        direction: "down",
        x: 14,
        y: 19,
      });
    });

    it("parses VT200 mouse", () => {
      // \x1b[M + button(0+0x20=0x20) + x(10+0x21=0x2b) + y(5+0x21=0x26)
      let result = input.scan(bytes(0x1b, 0x5b, 0x4d, 0x20, 0x2b, 0x26));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "mouse",
        button: "left",
        x: 10,
        y: 5,
      });
    });
  });

  describe("ESC timeout", () => {
    it("returns pending for lone ESC", () => {
      let result = input.scan(bytes(0x1b));
      expect(result.events.length).toBe(0);
      expect(result.pending).toBeDefined();
      expect(result.pending!.delay).toBe(25);
    });

    it("resolves ESC after timeout", async () => {
      input.scan(bytes(0x1b));
      await new Promise((r) => setTimeout(r, 30));
      let result = input.scan(new Uint8Array(0));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({ type: "key", key: "Escape" });
      expect(result.pending).toBeUndefined();
    });

    it("resolves as escape sequence when more bytes arrive", () => {
      let r1 = input.scan(bytes(0x1b));
      expect(r1.events.length).toBe(0);

      let r2 = input.scan(bytes(0x5b, 0x41));
      expect(r2.events.length).toBe(1);
      expect(r2.events[0]).toMatchObject({ type: "key", key: "ArrowUp" });
      expect(r2.pending).toBeUndefined();
    });

    it("resolves pending ESC as Alt modifier when plain byte arrives", () => {
      let r1 = input.scan(bytes(0x1b));
      expect(r1.events.length).toBe(0);
      expect(r1.pending).toBeDefined();

      // "x" arrives — ESC + x = Alt+x
      let r2 = input.scan(bytes(0x78)); // 'x'
      expect(r2.events.length).toBe(1);
      expect(r2.events[0]).toMatchObject({ type: "char", key: "x", alt: true });
      expect(r2.pending).toBeUndefined();
    });

    it("completes pending ESC sequence and parses trailing bytes", () => {
      let r1 = input.scan(bytes(0x1b));
      expect(r1.events.length).toBe(0);
      expect(r1.pending).toBeDefined();

      // rest of ArrowUp + "hi"
      let r2 = input.scan(bytes(0x5b, 0x41, 0x68, 0x69));
      expect(r2.events.length).toBe(3);
      expect(r2.events[0]).toMatchObject({ type: "key", key: "ArrowUp" });
      expect(r2.events[1]).toMatchObject({ type: "char", key: "h" });
      expect(r2.events[2]).toMatchObject({ type: "char", key: "i" });
      expect(r2.pending).toBeUndefined();
    });
  });

  describe("Alt combinations", () => {
    it("parses Alt+a as unrecognized ESC sequence", () => {
      let result = input.scan(bytes(0x1b, 0x61));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "char",
        key: "a",
        alt: true,
      });
    });
  });

  describe("multi-event burst", () => {
    it("parses multiple escape sequences in one call", () => {
      // Arrow Up + Arrow Down + "hi"
      let result = input.scan(
        bytes(0x1b, 0x5b, 0x41, 0x1b, 0x5b, 0x42, 0x68, 0x69),
      );
      expect(result.events.length).toBe(4);
      expect(result.events[0]).toMatchObject({ type: "key", key: "ArrowUp" });
      expect(result.events[1]).toMatchObject({ type: "key", key: "ArrowDown" });
      expect(result.events[2]).toMatchObject({ type: "char", key: "h" });
      expect(result.events[3]).toMatchObject({ type: "char", key: "i" });
    });
  });

  describe("partial sequences", () => {
    it("buffers partial escape sequence", () => {
      let r1 = input.scan(bytes(0x1b, 0x5b));
      expect(r1.events.length).toBe(0);

      let r2 = input.scan(bytes(0x41));
      expect(r2.events.length).toBe(1);
      expect(r2.events[0]).toMatchObject({ type: "key", key: "ArrowUp" });
    });
  });

  describe("Kitty keyboard protocol (CSI u)", () => {
    it("parses character with alt modifier", () => {
      let result = input.scan(str("\x1b[97;3u")); // a + Alt
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "char",
        key: "a",
        alt: true,
      });
    });

    it("parses Tab with alt modifier", () => {
      let result = input.scan(str("\x1b[9;3u"));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "key",
        key: "Tab",
        alt: true,
      });
    });

    it("parses Enter with ctrl modifier", () => {
      let result = input.scan(str("\x1b[13;5u"));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "key",
        key: "Enter",
        ctrl: true,
      });
    });

    it("parses Escape with shift modifier", () => {
      let result = input.scan(str("\x1b[27;2u"));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "key",
        key: "Escape",
        shift: true,
      });
    });

    it("parses Backspace without modifiers", () => {
      let result = input.scan(str("\x1b[127u"));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "key",
        key: "Backspace",
      });
    });

    it("parses combined modifiers", () => {
      let result = input.scan(str("\x1b[105;7u")); // i + Ctrl+Alt
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "char",
        key: "i",
        ctrl: true,
        alt: true,
      });
    });

    it("parses F1 functional key codepoint", () => {
      let result = input.scan(str("\x1b[57376;2u")); // F1 + Shift
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "key",
        key: "F1",
        shift: true,
      });
    });

    it("parses arrow key codepoint", () => {
      let result = input.scan(str("\x1b[57352;5u")); // ArrowUp + Ctrl
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "key",
        key: "ArrowUp",
        ctrl: true,
      });
    });
  });

  describe("UTF-8", () => {
    it("parses 2-byte UTF-8 (é)", () => {
      let result = input.scan(bytes(0xc3, 0xa9));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({ type: "char", key: "\u00e9" });
    });

    it("parses 3-byte UTF-8 (中)", () => {
      let result = input.scan(bytes(0xe4, 0xb8, 0xad));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({ type: "char", key: "\u4e2d" });
    });

    it("parses 4-byte UTF-8 (emoji 🎉)", () => {
      let result = input.scan(bytes(0xf0, 0x9f, 0x8e, 0x89));
      expect(result.events.length).toBe(1);
      expect(result.events[0]).toMatchObject({
        type: "char",
        key: "\u{1f389}",
      });
    });
  });
});
