import { type Op, pack } from "./ops.ts";
import { createTermNative } from "./term-native.ts";

export interface TermOptions {
  height: number;
  width: number;
}

export interface RenderOptions {
  mode?: "line";

  /**
   * Row where to begin rendering. This should only be used when
   * rendering into a region as part of the CLI main screen. For
   * interfaces that use the entire screen, leave unset which will
   * default to 0. This is 1-based which which is the DSR native
   * format.
   *
   * https://www.ecma-international.org/publications-and-standards/standards/ecma-48/
   */
  row?: number;

  pointer?: {
    x: number;
    y: number;
    down: boolean;
  };
}

export type PointerEvent =
  | { type: "pointerenter"; id: string }
  | { type: "pointerleave"; id: string }
  | { type: "pointerclick"; id: string };

export interface RenderInfo {
  dimensions: { x: number; y: number; width: number; height: number };
}

export interface RenderResult {
  output: Uint8Array;
  events: PointerEvent[];
  info: Map<string, RenderInfo>;
}

export interface Term {
  render(ops: Op[], options?: RenderOptions): RenderResult;
}

export async function createTerm(options: TermOptions): Promise<Term> {
  let { width, height } = options;
  let native = await createTermNative(width, height);
  let { memory, statePtr, opsBuf } = native;

  let prev = new Set<string>();
  let pressed = new Set<string>();
  let wasDown = false;

  return {
    render(ops: Op[], options?: RenderOptions): RenderResult {
      let len = pack(ops, memory.buffer, opsBuf, memory.buffer.byteLength);
      let mode = options?.mode === "line" ? 1 : 0;
      let row = options?.row ?? 1;
      native.reduce(statePtr, opsBuf, len, mode, row);

      if (options?.pointer) {
        let { x, y, down } = options.pointer;
        native.setPointer(x, y, down);
      }

      let output = new Uint8Array(
        memory.buffer,
        native.output(statePtr),
        native.length(statePtr),
      );

      let current = new Set(
        options?.pointer ? native.getPointerOverIds() : [],
      );
      let down = options?.pointer?.down ?? false;
      let events: PointerEvent[] = [];

      for (let id of current) {
        if (!prev.has(id)) {
          events.push({ type: "pointerenter", id });
        }
      }

      for (let id of prev) {
        if (!current.has(id)) {
          events.push({ type: "pointerleave", id });
        }
      }

      if (wasDown && !down) {
        for (let id of pressed) {
          if (current.has(id)) {
            events.push({ type: "pointerclick", id });
          }
        }
      }

      if (down && !wasDown) {
        pressed = new Set(current);
      } else if (!down) {
        pressed.clear();
      }

      prev = current;
      wasDown = down;

      let info = new Map<string, RenderInfo>();
      for (let el of native.getElementInfo()) {
        if (!info.has(el.name)) {
          info.set(el.name, {
            dimensions: {
              x: el.x,
              y: el.y,
              width: el.width,
              height: el.height,
            },
          });
        }
      }

      return { output, events, info };
    },
  };
}
