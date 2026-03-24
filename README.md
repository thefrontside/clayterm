# clayterm

A terminal rendering backend for [Clay](https://github.com/nicbarker/clay), and
a terminal input event parser compiled to WebAssembly.

## Architecture

### Output

With every frame, the entire UI tree is packed into a flat byte array and sent
to WASM in a single call. On the C side, Clay runs layout, render commands are
walked into a cell buffer, and the buffer is diffed against the previous frame.
Only the cells that actually changed produce output. The result is an ANSI
escape sequence that can be written directly to stdout. One trip to WASM per
frame, double buffered, and only the bytes that need to change hit the output
stream.

Because the WASM module is pure computation with no I/O, it runs anywhere
WebAssembly does: Deno, Node, Bun, browsers, or any other runtime.

```
 TypeScript                        WASM (C)
+---------------+                +---------------------------+
|               |  Uint32Array   |                           |
| UI ops...     | =============> | Clay layout               |
|               |                |   -> render commands      |
+---------------+                |   -> cell buffer (back)   |
                                 |   -> diff against (front) |
                                 |   -> escape bytes         |
+---------------+                |                           |
|               | ANSI byte array|                           |
| stdout.write  | <============= |                           |
|               |                |                           |
+---------------+                +---------------------------+
```

### Input

Raw bytes from stdin are fed into a WASM-based parser that recognizes VT/ANSI
escape sequences, UTF-8 codepoints, and mouse protocols (VT200, SGR, urxvt). The
parser maintains its own internal buffer so partial sequences that arrive across
read boundaries are reassembled automatically. A lone ESC byte is held for a
configurable latency window (default 25ms) before being emitted, giving
multi-byte sequences time to arrive.

```
 TypeScript                        WASM (C)
+---------------+                +---------------------------+
|               |  raw byte array|                           |
| stdin.read    | =============> | trie match (keys/seqs)    |
|               |                |   -> mouse protocol       |
|               |                |   -> UTF-8 decode         |
+---------------+                |   -> ESC codes            |
                                 |                           |
+---------------+                |                           |
|               |  events[]      |                           |
| CharEvent     | <============= |                           |
| KeyEvent      |                |                           |
| MouseEvent    |                +---------------------------+
| DragEvent     |
| WheelEvent    |
| ResizeEvent   |
+---------------+
```

## Usage

### Output

```typescript
import { close, createTerm, grow, open, rgba, text } from "clayterm";

const term = await createTerm({ width: 80, height: 24 });

const ansi = term.render([
  open("root", {
    layout: { width: grow(), height: grow(), direction: "ttb" },
  }),
  open("box", {
    layout: { padding: { left: 2, top: 1 } },
    border: {
      color: rgba(0, 255, 0),
      left: 1,
      right: 1,
      top: 1,
      bottom: 1,
    },
    cornerRadius: { tl: 1, tr: 1, bl: 1, br: 1 },
  }),
  text("Hello, World!"),
  close(),
  close(),
]);

process.stdout.write(ansi);
```

### Input

```typescript
import { createInput } from "clayterm/input";

const input = await createInput({ escLatency: 25 });

process.stdin.setRawMode(true);
let timer: ReturnType<typeof setTimeout> | undefined;

process.stdin.on("data", (buf) => {
  clearTimeout(timer);

  let { events, pending } = input.scan(new Uint8Array(buf));

  for (let event of events) {
    dispatch(event);
  }

  // if a lone ESC is pending, wait and re-scan to flush it
  if (pending) {
    timer = setTimeout(() => {
      let flush = input.scan();
      for (let event of flush.events) {
        dispatch(event);
      }
    }, pending.delay);
  }
});
```

## Development

Requires `clang` with wasm32 target support.

First build the `.wasm`

```sh
make
```

run tests

```sh
deno task test
```
