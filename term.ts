import { type Op, pack } from "./ops.ts";
import { createTermNative } from "./term-native.ts";

export interface TermOptions {
  height: number;
  width: number;
  top?: number;
}

export interface RenderOptions {
  pointer?: {
    x: number;
    y: number;
    down: boolean;
  };
  deltaTime?: number;
}

export type PointerEvent =
  | { type: "pointerenter"; id: string }
  | { type: "pointerleave"; id: string }
  | { type: "pointerclick"; id: string };

export interface RenderResult {
  output: Uint8Array;
  events: PointerEvent[];
  hasActiveTransitions: boolean;
}

export interface Term {
  render(ops: Op[], options?: RenderOptions): RenderResult;
}

export async function createTerm(options: TermOptions): Promise<Term> {
  let { width, height, top = 0 } = options;
  let native = await createTermNative(width, height, top);
  let { memory, statePtr, opsBuf } = native;

  let prev = new Set<string>();
  let pressed = new Set<string>();
  let wasDown = false;
  let lastRenderTime = performance.now();

  return {
    render(ops: Op[], options?: RenderOptions): RenderResult {
      let len = pack(ops, memory.buffer, opsBuf, memory.buffer.byteLength);
      let now = performance.now();
      let dt = options?.deltaTime ?? Math.min((now - lastRenderTime) / 1000, 0.25);
      lastRenderTime = now;
      native.reduce(statePtr, opsBuf, len, dt);

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
      let hasActiveTransitions = native.hasActiveTransitions();
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

      return { output, events, hasActiveTransitions };
    },
  };
}
