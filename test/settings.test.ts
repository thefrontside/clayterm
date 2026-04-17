import { describe, expect, it } from "./suite.ts";
import {
  alternateBuffer,
  cursor,
  mouseTracking,
  progressiveInput,
  settings,
} from "../settings.ts";

function str(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

describe("settings", () => {
  describe("alternateBuffer", () => {
    it("applies with enter and removes with leave", () => {
      let s = alternateBuffer();
      expect(str(s.apply)).toBe("\x1b[?1049h");
      expect(str(s.revert)).toBe("\x1b[?1049l");
    });

    it("uses mode 47 when clear is false", () => {
      let s = alternateBuffer({ clear: false });
      expect(str(s.apply)).toBe("\x1b[?47h");
      expect(str(s.revert)).toBe("\x1b[?1049l");
    });
  });

  describe("cursor", () => {
    it("hides on apply when visible is false", () => {
      let s = cursor(false);
      expect(str(s.apply)).toBe("\x1b[?25l");
      expect(str(s.revert)).toBe("\x1b[?25h");
    });

    it("shows on apply when visible is true", () => {
      let s = cursor(true);
      expect(str(s.apply)).toBe("\x1b[?25h");
      expect(str(s.revert)).toBe("\x1b[?25l");
    });
  });

  describe("progressiveInput", () => {
    it("pushes the given level and pops on remove", () => {
      let s = progressiveInput(3);
      expect(str(s.apply)).toBe("\x1b[>3u");
      expect(str(s.revert)).toBe("\x1b[<u");
    });
  });

  describe("mouseTracking", () => {
    it("enables any-event tracking with SGR encoding", () => {
      let s = mouseTracking();
      expect(str(s.apply)).toBe("\x1b[?1003h\x1b[?1006h");
      expect(str(s.revert)).toBe("\x1b[?1006l\x1b[?1003l");
    });
  });

  describe("settings()", () => {
    it("concatenates apply in order", () => {
      let s = settings(alternateBuffer(), cursor(false));
      expect(str(s.apply)).toBe("\x1b[?1049h\x1b[?25l");
    });

    it("concatenates remove in reverse order", () => {
      let s = settings(alternateBuffer(), cursor(false));
      expect(str(s.revert)).toBe("\x1b[?25h\x1b[?1049l");
    });

    it("composes multiple settings", () => {
      let s = settings(
        alternateBuffer(),
        cursor(false),
        progressiveInput(3),
      );
      expect(str(s.apply)).toBe("\x1b[?1049h\x1b[?25l\x1b[>3u");
      expect(str(s.revert)).toBe("\x1b[<u\x1b[?25h\x1b[?1049l");
    });
  });
});
