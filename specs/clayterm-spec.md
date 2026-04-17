# Clayterm Current-State Specification

**Version:** 0.1 (draft)
**Status:** Current-state specification. Normative for the rendering contract. Descriptive for settling surfaces.

---

## 1. Purpose

Clayterm is a terminal rendering engine. It accepts a declarative description of a terminal UI layout, performs layout computation and cell-level diffing internally, and returns ANSI escape byte sequences suitable for direct write to a terminal output stream.

This specification defines Clayterm's current-state rendering contract: its architectural model, its invariants, its stable public API surface, and its intentional boundaries. It is written to allow future feature work to extend the project without destabilizing the core.

This specification does not attempt to define areas of Clayterm that are still settling. Where the project has working but evolving surfaces — including the input parsing API, pointer event model, and certain wrapper types — those are described in Section 12 as current implementation rather than normative contract.

---

## 2. Scope

### In scope (normative)

- The rendering pipeline and its architectural commitments
- The frame-snapshot rendering model
- The stable public rendering API
- The descriptor model and core helpers
- Element identity and frame semantics
- Boundary responsibilities (what Clayterm owns and what it does not)

### In scope (non-normative, descriptive)

- Current implementation surfaces that are settling but not yet stable enough to freeze (Section 12)
- Implementation notes that aid understanding but do not define contract (Section 14)

### Out of scope

- Internal C code organization, function names, or file structure
- WASM memory layout or compilation details beyond behavioral requirements
- Performance targets or benchmark methodology
- Packaging, CI, or distribution workflow details
- Higher-level UI framework concerns (e.g., component lifecycle, reconciliation)
- Demo applications
- The crankterm project or any specific framework built on Clayterm

---

## 3. Terminology

**Frame.** A single, complete rendering pass. Each frame begins with the caller providing descriptors and ends with the renderer returning ANSI bytes. Frames are independent; the renderer carries no UI tree state between them.

**Descriptor (op).** A plain object that declares one element of the UI tree for a single frame. Descriptors are typed by an identifier field and carry layout, styling, and content properties. The set of descriptors for a frame is ordered and forms an implicit tree via open/close pairing.

**Descriptor array.** An ordered array of descriptors constituting a complete frame description. The array is the input to the rendering transaction.

**Render transaction.** The process of accepting a descriptor array, performing layout, walking render commands, diffing against the previous frame's cell buffer, and producing ANSI byte output. A render transaction is a single, synchronous operation from the caller's perspective.

**ANSI bytes.** A byte sequence of UTF-8–encoded ANSI escape codes and text content that, when written to a terminal file descriptor, produces the visual output described by the frame's descriptors. ANSI bytes include cursor-positioning sequences, SGR (Select Graphic Rendition) attribute sequences, and UTF-8 text.

**Renderer core.** The WASM module and its TS entry points that together implement the render transaction. The renderer core owns layout computation, render-command walking, cell-buffer diffing, and ANSI byte generation.

**Caller.** Any code that invokes Clayterm's public API to produce terminal output. The caller owns terminal setup, IO, input handling, and application lifecycle.

**Higher-level framework.** A component model, reconciler, or application framework built on top of Clayterm. Examples include crankterm. Clayterm has no dependency on any higher-level framework, and this specification does not constrain their design.

**Term.** An instance of the Clayterm renderer, bound to specific terminal dimensions. A Term is the object through which the caller performs render transactions.

---

## 4. Architectural Model

*This section is normative.*

### 4.1 Pipeline

Clayterm implements a rendering pipeline with the following stages:

1. **Descriptor acceptance.** The caller provides a complete descriptor array representing the desired UI state for a single frame.

2. **Transfer.** The renderer transfers the frame description into the WASM module. The transfer mechanism is an implementation detail. The normative requirement is that the transfer occurs as part of a single render transaction; the caller does not interact with the transfer mechanism directly.

3. **Render transaction.** The WASM module processes the frame description. Internally, it drives a layout engine to compute element positions and sizes, walks the resulting render commands to populate a cell buffer, and diffs the cell buffer against the previous frame.

4. **Output generation.** For each cell that differs from the previous frame, the renderer emits ANSI escape sequences (cursor positioning, color attributes, and text) into an output buffer.

5. **Output retrieval.** The caller reads the ANSI byte output.

### 4.2 Single-transaction rendering

A frame MUST be rendered in a single transaction that crosses the TS→WASM boundary once. The caller provides the complete descriptor array, invokes the render transaction, and reads the output. There are no intermediate callbacks, yields, or partial results.

### 4.3 Frame-snapshot model

Each render transaction operates on a complete, self-contained snapshot of the UI. The renderer MUST NOT maintain an internal component tree or UI state across frames. The only state the renderer retains between frames is the cell buffer used for diffing, which is an implementation detail of output minimization and not observable to the caller except through reduced output size.

### 4.4 Double-buffered diffing

The renderer maintains two cell buffers: a front buffer (the previously rendered frame) and a back buffer (the frame being rendered). After populating the back buffer from the current frame's render commands, the renderer compares it against the front buffer and emits ANSI bytes only for cells that differ. The buffers are then swapped. This mechanism is internal to the renderer and not directly observable to the caller.

---

## 5. Contract Layer Boundary

*This section is normative.*

This specification defines the **architectural rendering contract**: the commitments that make Clayterm what it is and that callers and framework authors can depend on.

This specification **does not** define the following as normative:

- **The internal transfer encoding.** The mechanism by which descriptors are serialized for the WASM module — its byte format, opcode structure, and field encoding — is an implementation detail. The normative commitment is that the transfer happens within a single render transaction; the encoding is described in Section 12.1 as current implementation surface.

- **Validation or error semantics.** How the renderer responds to invalid input (malformed descriptor arrays, unbalanced open/close pairs) is not yet specified as contract. Section 9.1 defines what constitutes valid input. Behavior for invalid input is currently unspecified.

- **The complete set of descriptor properties.** The existence of the core descriptor constructors (`open`, `close`, `text`) and the core sizing helpers (`grow`, `fixed`, `fit`) is normative. The full set of properties accepted by these constructors — which layout fields, which styling options, which configuration groups are available — is current implementation surface described in Section 12.2. New property groups have been added over time and more may follow.

- **The return type wrapper of `render()`.** The commitment that `render()` produces ANSI bytes accessible as a `Uint8Array` is normative. The wrapper type around those bytes is current implementation surface described in Section 12.3.

Future readers should not treat current implementation surface as identical to the contract boundary.

---

## 6. Core Invariants

*This section is normative.*

**INV-1. Zero IO.** The renderer MUST NOT perform any terminal input or output. It MUST NOT write to stdout, read from stdin, open file descriptors, or interact with the terminal device. The renderer produces bytes; the caller writes them.

**INV-2. Single transaction per frame.** Each frame MUST be rendered in a single transaction that crosses the TS→WASM boundary once. The caller provides the complete frame as a descriptor array and receives ANSI bytes in return.

**INV-3. Frame-snapshot independence.** The renderer MUST NOT require the caller to maintain or provide state across frames beyond calling `render()` on the same Term instance. Each descriptor array fully describes its frame.

**INV-4. ANSI byte output.** The output of a render transaction MUST be a byte sequence of valid UTF-8–encoded ANSI escape codes that is directly writable to a terminal output stream without further transformation or encoding.

**INV-5. Layout/render/diff ownership.** The renderer owns the layout computation, render-command walk, cell-buffer diffing, and ANSI byte generation stages. The caller MUST NOT need to perform any of these operations.

**INV-6. Internal lifecycle symmetry.** The renderer's internal layout lifecycle (begin-layout and end-layout calls to the underlying layout engine) MUST be symmetric: both calls occur within the same render transaction, in the same function scope.

**INV-7. Element identity disambiguation.** When multiple elements within a frame share the same tag name, the renderer MUST disambiguate their identities so that the layout engine does not conflate them. The disambiguation mechanism is an implementation detail, but the guarantee is normative: identical tag names MUST NOT cause layout corruption or element conflation.

**INV-8. Separation of concerns.** The rendering concern and the input-parsing concern MUST remain independent. Neither MUST depend on the other's state, types, or API surface. They MAY share a compiled WASM binary for loading efficiency, but this is an implementation convenience, not an architectural coupling.

---

## 7. Rendering Contract

*This section is normative.*

### 7.1 Inputs

The rendering transaction accepts:

- A **descriptor array**: an ordered array of descriptor objects constituting a complete frame. The array MUST contain balanced open/close pairs forming a valid tree structure.

The descriptor array is the sole required input to a render transaction.

### 7.2 Rendering transaction

When the caller invokes a render transaction:

1. The renderer accepts the descriptor array and transfers the frame description into the WASM module.
2. The WASM module processes the frame: it computes layout, walks render commands, populates the cell buffer, diffs against the previous frame, and writes ANSI bytes for changed cells.
3. Control returns to the caller with the ANSI byte output available.

The render transaction is synchronous from the caller's perspective once invoked. It MUST NOT yield, suspend, or require callbacks during execution.

### 7.3 Output

The render transaction produces ANSI bytes as a `Uint8Array`. These bytes:

- MUST be valid UTF-8
- MUST consist of ANSI escape sequences (CSI, SGR) and text content
- MUST be directly writable to a terminal file descriptor to produce the described visual output
- MUST represent only the cells that changed since the previous frame (on a Term instance that has rendered at least one prior frame)

The output reflects the complete visual state of the frame. The caller SHOULD write the output to the terminal without modification.

### 7.4 Lifecycle

A Term instance is created for specific terminal dimensions. The caller provides width and height at creation time.

To handle terminal resize, the caller creates a new Term with the new dimensions. The previous Term instance becomes stale and SHOULD NOT be used for further rendering.

Creation of a Term is asynchronous because it may involve WASM module preparation. A Term instance MAY be used for any number of render transactions. The Term retains its cell buffers across frames for diffing purposes.

---

## 8. Public Rendering API

*This section is normative. Only items with high confidence of stability are included. See Section 5 for what this section does and does not freeze.*

### 8.1 Term creation

```
createTerm(options: { width: number; height: number }): Promise<Term>
```

Creates a new Term instance bound to the specified terminal dimensions. The returned promise resolves when the renderer is ready. The `width` and `height` parameters specify the terminal dimensions in character cells.

### 8.2 Render invocation

```
term.render(ops: Op[]): <result containing ANSI bytes as Uint8Array>
```

Accepts an ordered array of descriptor objects and performs a render transaction as defined in Section 7. Returns the ANSI byte output as a `Uint8Array`.

The return type is specified here only to the extent that the ANSI bytes MUST be accessible as a `Uint8Array`. The precise shape of the return value — whether it is a bare `Uint8Array`, a wrapper object, or a structure carrying additional data — is part of the current implementation surface described in Section 12.3 and is not locked down by this specification.

### 8.3 Descriptor constructors

Descriptors are created using constructor functions that return plain objects. The caller assembles these into an array. This pattern — functions returning plain descriptors, composed into arrays — is normative. A builder, fluent, or mutation-based API is explicitly rejected.

#### 8.3.1 open

```
open(name: string, props?): OpenElement
```

Creates an element-open descriptor. The `name` parameter provides a tag name for the element. The optional `props` parameter carries configuration for layout, styling, and behavior.

Elements opened with `open()` MUST be closed with a corresponding `close()` descriptor later in the same descriptor array.

The set of properties accepted by `props` is part of the current implementation surface described in Section 12.2. This specification defines the existence and signature of `open()` normatively but does not freeze the complete property surface, which has been extended incrementally and may continue to grow.

#### 8.3.2 close

```
close(): CloseElement
```

Creates an element-close descriptor. Each `close()` MUST correspond to a preceding `open()`.

#### 8.3.3 text

```
text(content: string, props?): Text
```

Creates a text descriptor. The `content` parameter provides the text string to render. The optional `props` parameter carries text styling configuration.

Text descriptors MUST appear between a matching open/close pair.

The set of styling properties accepted by `props` is part of the current implementation surface and may be extended.

### 8.4 Sizing helpers

These functions produce sizing-axis values for use in element layout configuration:

```
grow(): SizingAxis
```
The element expands to fill available space in the parent along this axis.

```
fixed(value: number): SizingAxis
```
The element has a fixed size of `value` cells along this axis.

```
fit(min?: number, max?: number): SizingAxis
```
The element sizes to fit its content, optionally constrained by minimum and maximum bounds.

### 8.5 Color helper

```
rgba(r: number, g: number, b: number, a?: number): number
```

Packs color channel values (each 0–255) into a single 32-bit integer in ARGB format. Alpha defaults to 255 (fully opaque). The returned value is used wherever the descriptor model expects a color.

---

## 9. Descriptor Model

*This section is normative.*

### 9.1 Descriptor-array pattern

The rendering input is an ordered array of descriptor objects. Each descriptor is a plain JavaScript/TypeScript object created by a constructor function (Section 8.3). Descriptors are not classes, do not carry methods, and do not participate in a prototype chain. They MAY be spread, composed, stored, or inspected as ordinary objects.

The array is processed in order. Open and close descriptors form an implicit tree. The renderer processes them sequentially.

A descriptor array with unbalanced open/close pairs, or with close descriptors that do not match a preceding open, is invalid input. Callers SHOULD validate descriptor arrays before rendering. The renderer's behavior when given an invalid descriptor array is unspecified by this specification.

### 9.2 Transfer to the WASM module

As part of the render transaction, the descriptor array is transferred into a form that the WASM module can process. This transfer is handled internally by the renderer and is not an operation the caller performs or observes. The transfer mechanism is an implementation detail described in Section 12.1.

### 9.3 Descriptor identity

Each element descriptor is assigned an identity within the frame for use by the underlying layout engine. When multiple elements share the same tag name (the `name` parameter to `open()`), the renderer MUST disambiguate their identities automatically. The disambiguation mechanism is an implementation detail. The normative requirement is that the caller MUST NOT need to provide globally unique names; the renderer handles uniqueness internally.

---

## 10. Identity and Frame Semantics

*This section is normative.*

### 10.1 Frame completeness

A descriptor array provided to `render()` MUST represent a complete frame. The renderer does not support incremental updates, partial frames, or delta descriptions. Every frame fully specifies the desired UI state.

### 10.2 Descriptor ordering

Descriptors MUST be provided in depth-first tree order. An `open()` descriptor begins an element; its children (including nested open/close pairs and text descriptors) follow in order; a `close()` descriptor ends the element. The renderer processes descriptors in the order they appear in the array.

### 10.3 Element identity within a frame

Within a single frame, each element MUST have an unambiguous identity for the layout engine. As specified in Section 9.3, the renderer handles disambiguation. Two elements with the same tag name in the same frame MUST NOT cause layout corruption, hash collision, or identity conflation.

### 10.4 No cross-frame identity

The renderer does not track element identity across frames. An element named "sidebar" in frame N and an element named "sidebar" in frame N+1 are not related from the renderer's perspective. Cross-frame identity, if needed, is the responsibility of a higher-level framework.

---

## 11. Boundaries and Non-Responsibilities

*This section is normative.*

### 11.1 The renderer does not perform IO

The renderer MUST NOT write to any output stream. The renderer MUST NOT read from any input stream. The renderer produces bytes; the caller decides when and how to write them. This enables the renderer to operate in any environment where WebAssembly is available, including browsers, server-side runtimes, and embedded contexts.

### 11.2 The renderer does not manage terminal state

The renderer MUST NOT emit escape sequences for any of the following terminal-management operations:

- Entering or leaving the alternate screen buffer
- Hiding or showing the cursor
- Setting the cursor shape or blink state
- Enabling or disabling mouse reporting
- Enabling or disabling keyboard protocol modes (e.g., Kitty progressive enhancement)
- Enabling or disabling raw mode or similar terminal disciplines

These are the caller's responsibility. The renderer's output contains only the escape sequences needed to render the frame content (cursor positioning for cell writes, SGR attributes for styling, and UTF-8 text).

### 11.3 The renderer does not own application lifecycle

The renderer MUST NOT maintain a run loop, event loop, timer, or subscription mechanism. It does not schedule frames. It does not manage component state. It renders when asked and returns. The decision of when to render is entirely the caller's.

### 11.4 The renderer does not own input parsing

Input parsing (keyboard events, mouse events, escape sequence decoding) is an independent concern. It is not part of the rendering contract defined by this specification. The renderer MUST NOT depend on input-parsing state, types, or API.

Clayterm currently provides input-parsing functionality alongside the renderer in the same package. This co-location is an implementation detail, not an architectural coupling. Section 12.4 describes the current input surface.

### 11.5 The renderer does not own higher-level framework concerns

The renderer MUST NOT implement or depend on:

- Component models or component lifecycles
- Reconciliation or diffing of descriptor trees (the renderer diffs *cells*, not *trees*)
- State management or reactivity
- Event propagation through a component hierarchy

These are the domain of higher-level frameworks built on Clayterm.

---

## 12. Current Surface That Remains Elastic

*This entire section is non-normative. It describes the current implementation surface to aid consumers and future spec authors. The shapes described here are real, working, and in many cases deliberately designed, but they do not yet meet the stability threshold for normative specification. They MAY change in future versions without constituting a breaking change to the normative core defined above.*

### 12.1 Transfer encoding (command protocol)

The renderer currently serializes descriptors into a flat byte buffer using a command protocol based on fixed-width `Uint32` words. Each descriptor is encoded as an opcode word followed by descriptor-specific data. Element-open descriptors use a property mask to indicate which optional field groups (layout, border, corner radius, clip, floating, scroll) are present, followed by the data for each indicated group. Strings are encoded as length-prefixed UTF-8 byte sequences within the word stream. Floats are stored as bit-reinterpreted `Uint32` values.

This encoding has been extended incrementally (floating, clip, and scroll groups were added after the initial protocol) but has never been restructured. It is likely to remain stable in structure while continuing to grow. However, specific opcode values, mask definitions, and field layouts are implementation details and are not locked down by this specification.

### 12.2 Descriptor property groups

The `open()` constructor currently accepts the following property groups in its `props` parameter:

- **`layout`** — sizing (width and height, specified via sizing helpers), padding (per-side), alignment (currently numeric enum values, with a planned transition to string literals), direction (top-to-bottom or left-to-right), and gap
- **`border`** — per-side border widths and border color
- **`cornerRadius`** — per-corner radius values, producing rounded box-drawing characters
- **`clip`** — clip region configuration for scroll containers
- **`floating`** — floating-element configuration (offset, parent reference, attach points, z-index)
- **`scroll`** — scroll container configuration

The `text()` constructor currently accepts: `color`, `fontSize`, `letterSpacing`, `lineHeight`, and attribute flags (`bold`, `italic`, `underline`, `strikethrough`).

These property groups represent the current implementation surface. New groups and fields have been added incrementally and more may follow. Alignment values are expected to transition from numeric to string-literal form.

**Border width and layout interaction.** In the current underlying layout engine (Clay), border configuration does not affect layout computation. Borders are drawn as visual overlays within the element's bounding box. A bordered element with zero padding will have its borders drawn over its content. Callers must add padding equal to or greater than the border width to prevent overlap. This behavior has been explicitly discussed by the project; the current position is to document it rather than auto-compensate, but this decision may be revisited.

### 12.3 Render return type

The `render()` method currently returns a `RenderResult` object shaped as `{ output: Uint8Array, events: PointerEvent[] }`.

The `output` field is the ANSI byte output specified normatively in Section 7.3 and Section 8.2.

The `events` field contains pointer events (enter, leave, click) derived from the underlying layout engine's element hit-testing. This field was added during a pointer-events feature implementation. The pointer event model is functional but has acknowledged gaps (no modifier keys on click events) and its interaction protocol (calling `setPointer(x, y, down)` before rendering, then reading events from the return value) was arrived at through iteration rather than upfront design.

The return type of `render()` has changed twice since the project's inception (string, then `Uint8Array`, then `RenderResult`). While the ANSI bytes commitment (Section 7.3) is stable, the wrapper shape around those bytes is not. Future versions may restructure the return type.

### 12.4 Input parsing surface

Clayterm currently provides terminal input parsing alongside the renderer. The input API was designed by the project lead and has clear design intent, but it has undergone more revision than the rendering core and faces known upcoming forces that will reshape it (Kitty progressive enhancement field surfacing, terminfo binary parsing, possible package separation).

The current input surface includes:

**`createInput(options?): Promise<Input>`** — Creates an input parser instance. Options currently include `escLatency` (milliseconds to wait before resolving a lone ESC byte as the Escape key, default 25ms) and `terminfo` (a `Uint8Array` of raw terminfo binary, accepted but with C-side parsing not yet implemented).

**`input.scan(bytes?): ScanResult`** — Feeds raw terminal bytes into the parser and returns parsed events. The `bytes` parameter is optional; calling without arguments triggers a rescan for ESC timeout resolution.

**`ScanResult`** — Currently shaped as `{ events: InputEvent[], pending?: { delay: number, deadline: number } }`. The `events` array contains parsed events. The `pending` field, when present, indicates that an ambiguous ESC byte is buffered and provides both a relative delay and an absolute deadline for the caller to schedule a rescan.

**`InputEvent` discriminated union** — Currently discriminated on a `type` field with these variants: `CharEvent` (insertable character), `KeyEvent` (special/control key), `MouseEvent` (button press/release), `DragEvent` (motion with button held), `WheelEvent` (scroll tick), `ResizeEvent`. The discriminant values and the type splits are deliberate design decisions. However, the field sets within each variant are expected to grow when Kitty progressive enhancement types are surfaced in the TypeScript layer (the C struct has already been extended with fields that are not yet mapped to the TS types).

The input API is architecturally independent from the renderer (see INV-8). Whether it remains in the same package or becomes a separate module is an open question.

### 12.5 Pointer event model

Clayterm currently supports pointer hit-testing via the underlying layout engine's element-identification mechanism. The current surface includes:

- `setPointer(x, y, down)` — sets the pointer position and button state for the next render
- Pointer events returned as part of `RenderResult.events`: `pointerenter`, `pointerleave`, `pointerclick`

This surface is functional but should not be treated as stable contract. The calling convention was discovered through iteration, the event model has acknowledged gaps, and the approach may evolve.

### 12.6 Validation and packing

**`validate(ops)`** — A function that checks a descriptor array for structural errors (unbalanced open/close pairs, invalid field types). Currently exported and used in tests. Its intended status as public API versus internal utility is not established.

**`pack(ops, mem, offset)`** — A function that serializes a descriptor array into the transfer encoding described in Section 12.1. Currently exported and used internally by `render()`. Its exposure as public API is incidental; it was not explicitly designated as caller-facing.

---

## 13. Deferred / Future Areas

*This section is non-normative. These topics are explicitly excluded from this specification. Their omission is intentional, not an oversight.*

**Section / region rendering mode.** Rendering into a portion of the normal screen buffer rather than the alternate screen. Partially prototyped but not landed.

**Scroll container API.** The underlying layout engine supports scroll containers. No TypeScript-side API exists for providing scroll state to the renderer.

**Full Kitty progressive enhancement event types.** The C-side input parser struct has been extended for progressive enhancement fields. The TypeScript event types have not been updated to surface them.

**Terminfo binary parsing.** The input API accepts a `terminfo` option, but C-side parsing is not implemented.

**CSI helper for terminal setup.** A helper for generating paired apply/rollback byte arrays for terminal mode configuration was discussed but not implemented.

**Browser-specific adapter.** The renderer's zero-IO architecture makes browser portability possible. No adapter exists.

**`betweenChildren` border support.** The underlying layout engine supports this. It is not exposed in the descriptor model.

**Whether input parsing should be a separate package.** Architecturally independent (INV-8) but currently co-located. The distribution decision is open.

---

## 14. Implementation Notes

*This section is non-normative. These notes describe current implementation details that aid understanding but do not define contract. They may change without notice.*

**WASM module structure.** The renderer is implemented in C and compiled to WebAssembly as a single module. The module contains both rendering and input-parsing functionality; they share a binary but maintain independent state.

**WASM loading.** The current implementation loads the WASM binary relative to the module's location, compiles it once, and instantiates it per Term or Input with fresh memory. The loading mechanism has changed and may change again.

**WASM co-location.** The WASM binary file is expected to be co-located with the JavaScript module files. Both JSR and npm package builds include the artifact.

**Memory layout.** WASM linear memory is initialized with 256 pages (16MB). The renderer state struct and the transfer buffer are allocated in WASM linear memory. The specific layout is an implementation detail.

**Output buffer lifetime.** The ANSI byte output resides in WASM linear memory. The `Uint8Array` returned by `render()` is a view over this memory. The output is valid until the next `render()` call on the same Term instance, at which point the buffer may be reused. Callers who need to retain the output beyond the next render SHOULD copy it.

**Layout engine.** The underlying layout engine is Clay, included as a dependency. Clay provides flexbox-like layout computation with support for fixed, grow, and fit sizing; padding; alignment; direction; gap; floating elements; clip regions; and scroll containers.

**Text measurement.** Text width measurement uses `wcwidth`-based character width computation, supporting ASCII, CJK wide characters, and other Unicode codepoints.

**Cell representation.** Each cell in the buffer stores a Unicode codepoint, a foreground color (packed ARGB with attribute flags in the high byte), and a background color.

**Border junction resolution.** When bordered elements share edges, the renderer accumulates per-cell direction bitmasks and resolves them to correct box-drawing junction glyphs in a post-render pass.

---

## Appendix A. Confidence Notes

### Why the rendering core is specified more aggressively than other surfaces

The rendering architecture — `createTerm`, `render(ops)`, the descriptor constructors, the bytes-output commitment, and the core invariants — was designed at the project's inception and has been stable since. It has survived the addition of pointer events, border junction resolution, and the crankterm integration without revision to its fundamental shapes. Its key abstractions (flat descriptor arrays, single render transaction, ANSI byte output) were chosen over explicitly rejected alternatives (per-element FFI, protobuf, builder pattern, string output). This level of stability and intentionality justifies normative specification.

The input API arrived later, has been through significantly more design churn (rejected first draft, iterative event type splits, naming changes, ongoing Kitty progressive enhancement design), and faces known upcoming forces that will reshape it. It has clear design ownership from the project lead, which distinguishes it from purely implementation-driven features like the pointer event model, but design ownership is not the same as contract readiness.

The pointer event model and render return wrapper are the least settled of the currently shipping features. Both were introduced during feature implementation rather than designed as part of the core architecture. The return type of `render()` has changed twice. The pointer calling convention was discovered through iteration. These are working and useful, but they carry the lowest confidence of any feature currently in the codebase.

### How to interpret "currently exported"

Several symbols are currently accessible from Clayterm's module exports — including `pack()`, `validate()`, and numerous input-related types — without clear evidence that they were intended as stable public contract. Being exported may mean "needed by internal modules" or "not yet audited for public/internal boundary."

This specification does not treat the export list as a contract boundary. Instead, it uses stability over time, design ownership, survival of corrections, and absence of known reshaping forces as the criteria for normative inclusion.

---

## Open Decisions Intentionally Left Out of This Spec

The following decisions are open. This specification omits them deliberately. Future readers should not interpret their absence as oversight or implicit resolution.

1. **What is the normative return type of `render()`?** This specification commits to ANSI bytes as `Uint8Array` but does not lock down the wrapper type. The current `RenderResult` shape may evolve.

2. **Is pointer event detection part of the rendering contract?** The current implementation returns pointer events from `render()`. This specification does not include pointer events in the normative core. Whether pointer detection is intrinsic to the renderer or should be a separate concern is unresolved.

3. **Is the input API part of the Clayterm specification?** This specification describes it in Section 12.4 but does not specify it normatively. The input API may become a separate package or specification.

4. **Are `pack()` and `validate()` public API?** Both are currently exported. Neither is specified normatively here.

5. **What are the normative Kitty progressive enhancement event types?** The C-side struct has been extended. The TypeScript types have not been updated. This specification does not attempt to predict the final shapes.

6. **How should border widths interact with layout?** The current behavior (borders do not affect layout) is inherited from the underlying layout engine. The project has questioned whether this is the right design. This specification describes the current behavior in Section 12.2 without committing to it.

7. **Should the rendering and input concerns be distributed as separate packages?** They are architecturally independent (INV-8) but currently co-located.

8. **What is the specification for section / region rendering mode?** Partially prototyped but not ready for specification.

9. **What are the specific transfer encoding details?** The encoding structure is described in Section 12.1 as current implementation surface. Locking down opcode values would constrain future extensions unnecessarily.

10. **What is the complete set of descriptor properties?** The property groups available in `open()` and `text()` are described in Section 12.2 as current implementation surface. They have been extended incrementally and will continue to grow.

11. **What are the validation and error semantics?** How the renderer responds to invalid input is unspecified. Callers SHOULD validate, but the validation model is not yet settled enough to define normatively.
