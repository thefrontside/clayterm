import { compiled } from "./wasm.ts";

export async function createDisplayWidth(): Promise<(text: string) => number> {
  let memory = new WebAssembly.Memory({ initial: 4 });

  let instance = await WebAssembly.instantiate(compiled, {
    env: { memory },
    clay: {
      measureTextFunction() {},
      queryScrollOffsetFunction(ret: number) {
        let v = new DataView(memory.buffer);
        v.setFloat32(ret, 0, true);
        v.setFloat32(ret + 4, 0, true);
      },
    },
  });

  let exports = instance.exports as unknown as {
    __heap_base: WebAssembly.Global;
    display_width(ptr: number, len: number): number;
  };

  let heap = exports.__heap_base.value as number;
  let encoder = new TextEncoder();

  return function displayWidth(text: string): number {
    let encoded = encoder.encode(text);
    let len = encoded.byteLength;

    // Grow memory if needed to fit the encoded string
    let needed = heap + len;
    let pages = Math.ceil(needed / 65536);
    let current = memory.buffer.byteLength / 65536;
    if (pages > current) {
      memory.grow(pages - current);
    }

    new Uint8Array(memory.buffer, heap, len).set(encoded);
    return exports.display_width(heap, len);
  };
}
