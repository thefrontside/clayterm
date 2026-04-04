export interface Native {
  memory: WebAssembly.Memory;
  statePtr: number;
  opsBuf: number;
  reduce(ct: number, buf: number, len: number, dt: number): void;
  output(ct: number): number;
  length(ct: number): number;
  hasActiveTransitions(): boolean;
  setPointer(x: number, y: number, down: boolean): void;
  getPointerOverIds(): string[];
}

import { compiled } from "./wasm.ts";

export async function createTermNative(
  w: number,
  h: number,
  row: number = 0,
): Promise<Native> {
  let memory = new WebAssembly.Memory({ initial: 2 });
  let exports: Record<string, CallableFunction> = {};

  let instance = await WebAssembly.instantiate(compiled, {
    env: { memory },
    clay: {
      measureTextFunction(
        ret: number,
        text: number,
        _config: number,
        _userData: number,
      ) {
        exports.measure(ret, text);
      },
      queryScrollOffsetFunction(
        ret: number,
        _elementId: number,
        _userData: number,
      ) {
        let view = new DataView(memory.buffer);
        view.setFloat32(ret, 0, true);
        view.setFloat32(ret + 4, 0, true);
      },
    },
  });

  Object.assign(exports, instance.exports);

  let ct = exports as unknown as {
    __heap_base: WebAssembly.Global;
    clayterm_size(w: number, h: number): number;
    init(mem: number, w: number, h: number, row: number): number;
    reduce(ct: number, buf: number, len: number, dt: number): void;
    output(ct: number): number;
    length(ct: number): number;
    has_active_transitions(): number;
    Clay_SetPointerState(vec: number, down: number): void;
    pointer_over_count(): number;
    pointer_over_id_string_length(index: number): number;
    pointer_over_id_string_ptr(index: number): number;
  };

  let heap = ct.__heap_base.value as number;
  let size = ct.clayterm_size(w, h);

  // grow memory to fit heap + state + ops buffer (1MB headroom for ops)
  let needed = heap + size + 1024 * 1024;
  let pages = Math.ceil(needed / 65536);
  let current = memory.buffer.byteLength / 65536;
  if (pages > current) {
    memory.grow(pages - current);
  }

  let statePtr = ct.init(heap, w, h, row);
  let opsBuf = (heap + size + 3) & ~3;

  return {
    memory,
    statePtr,
    opsBuf,
    reduce: ct.reduce,
    output: ct.output,
    length: ct.length,
    hasActiveTransitions() {
      return ct.has_active_transitions() !== 0;
    },
    setPointer(x: number, y: number, down: boolean) {
      let view = new DataView(memory.buffer);
      view.setFloat32(opsBuf, x, true);
      view.setFloat32(opsBuf + 4, y, true);
      ct.Clay_SetPointerState(opsBuf, down ? 1 : 0);
    },
    getPointerOverIds(): string[] {
      let decoder = new TextDecoder();
      let count = ct.pointer_over_count();
      let ids: string[] = [];
      for (let i = 0; i < count; i++) {
        let len = ct.pointer_over_id_string_length(i);
        if (len === 0) continue;
        let ptr = ct.pointer_over_id_string_ptr(i);
        ids.push(decoder.decode(new Uint8Array(memory.buffer, ptr, len)));
      }
      return ids;
    },
  };
}
