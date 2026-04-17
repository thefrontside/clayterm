# AGENTS.md

## Spec-driven development

- Specs in `specs/` are the source of truth. Code conforms to specs, not the
  other way around.

- Never add, remove, or change a public API in code without first updating the
  relevant spec and getting explicit approval from the user. This includes
  changes to `Term`, `createTerm`, `render()`, directive constructors (`open`,
  `close`, `text`), sizing helpers (`grow`, `fixed`, `fit`), and any future
  spec'd interfaces.

- The workflow is: propose the spec change, wait for approval, then implement.
  Do not combine spec changes with implementation in a single step.

- The renderer and input parser are specified separately (`renderer-spec.md` and
  `input-spec.md`). They are architecturally independent. Do not introduce
  dependencies between them.

- Each test file tests exactly one spec. Do not put tests for one spec into
  another spec's test file.

## Rendering invariants

- The renderer MUST NOT perform IO. It produces bytes; the caller writes them.

- The renderer MUST NOT manage terminal state (alternate buffer, cursor
  visibility, mouse reporting, keyboard protocol modes).

- Each frame is a complete snapshot. The renderer carries no UI tree state
  between frames — only cell buffers for diffing.

- Directives are plain objects. No classes, no methods, no prototype chains. The
  flat array pattern is normative.
