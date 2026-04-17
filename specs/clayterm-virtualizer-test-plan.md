# `@clayterm/virtualizer` Current-State Test Plan

**Status:** Current-state test plan for the implementation in this repository.

This document was imported from the draft virtualizer test plan in `~/Downloads` and updated to reflect the test suites, filenames, and assertion strategy that exist on `feat/virtualizer-v1`.

## 1. Scope

This plan covers:

- root renderer width-provider tests for `createDisplayWidth()`
- virtualizer conformance-style tests in [`virtualizer/test/`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test)
- golden fixtures
- real-world ANSI fixtures
- property-style randomized tests
- informational benchmark gates

Current suite count:

- root renderer width tests: 7
- virtualizer tests: 113

These counts reflect the current branch contents.

## 2. Test Inventory By File

Root package:

- [`test/width.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/test/width.test.ts): renderer width-provider tests for `createDisplayWidth()`

Virtualizer package:

- [`virtualizer/test/invariants.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/invariants.test.ts)
- [`virtualizer/test/width.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/width.test.ts)
- [`virtualizer/test/ansi.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/ansi.test.ts)
- [`virtualizer/test/append.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/append.test.ts)
- [`virtualizer/test/empty.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/empty.test.ts)
- [`virtualizer/test/viewport.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/viewport.test.ts)
- [`virtualizer/test/wrap-golden.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/wrap-golden.test.ts)
- [`virtualizer/test/ansi-golden.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/ansi-golden.test.ts)
- [`virtualizer/test/real-world-ansi.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/real-world-ansi.test.ts)
- [`virtualizer/test/scroll.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/scroll.test.ts)
- [`virtualizer/test/fraction.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/fraction.test.ts)
- [`virtualizer/test/eviction.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/eviction.test.ts)
- [`virtualizer/test/resize.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/resize.test.ts)
- [`virtualizer/test/exactness.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/exactness.test.ts)
- [`virtualizer/test/property.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/property.test.ts)
- [`virtualizer/test/bench.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/bench.test.ts)

## 3. Assertion Strategy

The current branch uses three broad test styles:

- deterministic conformance-style tests
- reference-behavior tests for exact formula/provider expectations
- informational benchmarks

Current observability surfaces used by tests:

- `appendLine()` return value
- read-only `Virtualizer` state getters
- `resolveViewport()` output
- `getLineDisplayWidth(lineIndex)`
- instrumented `measureWidth` mocks

The addition of `getLineDisplayWidth()` is important for current coverage because several width assertions now verify cached width directly rather than inferring it from row counts.

## 4. Traceability To Current Suites

### 4.1 Renderer width-provider

Covered in [`test/width.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/test/width.test.ts):

- `R.WIDTH.ascii`
- `R.WIDTH.cjk`
- `R.WIDTH.combining`
- `R.WIDTH.zwj-emoji`
- `R.WIDTH.additivity`
- `R.WIDTH.empty-string`
- `R.WIDTH.zero-width`

These validate `createDisplayWidth()` as the current reference provider.

### 4.2 Core identity and append behavior

Covered in:

- [`virtualizer/test/invariants.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/invariants.test.ts)
- [`virtualizer/test/append.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/append.test.ts)
- [`virtualizer/test/empty.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/empty.test.ts)

Current assertions include:

- monotonic line indices
- identity survival across eviction
- identity non-reuse
- empty-buffer semantics
- bottom-follow behavior
- append behavior while scrolled up
- wrap-cache stability across append

### 4.3 Width and ANSI handling

Covered in:

- [`virtualizer/test/width.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/width.test.ts)
- [`virtualizer/test/ansi.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/ansi.test.ts)
- [`virtualizer/test/ansi-golden.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/ansi-golden.test.ts)
- [`virtualizer/test/real-world-ansi.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/real-world-ansi.test.ts)

Current assertions include:

- `measureWidth` never sees recognized ANSI bytes
- cached display width excludes recognized CSI/OSC
- unrecognized escape forms are not skipped
- wrap points never land inside recognized sequences
- no ANSI state leaks across lines
- captured ANSI fixtures behave consistently at multiple widths

### 4.4 Viewport invariants and wrapping fixtures

Covered in:

- [`virtualizer/test/viewport.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/viewport.test.ts)
- [`virtualizer/test/wrap-golden.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/wrap-golden.test.ts)

Current assertions include:

- ordering and text preservation
- wrap-point monotonicity and bounds
- surrogate-pair safety
- visible row budget
- slice width within columns
- self-contained reconstruction

Current fixture note:

- the branch’s `G.WRAP.cjk-boundary` fixture uses `abc文d` at `columns = 4`, matching the corrected test expectation in code

### 4.5 Scroll, fraction, eviction, and resize

Covered in:

- [`virtualizer/test/scroll.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/scroll.test.ts)
- [`virtualizer/test/fraction.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/fraction.test.ts)
- [`virtualizer/test/eviction.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/eviction.test.ts)
- [`virtualizer/test/resize.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/resize.test.ts)

Current assertions include:

- top and bottom clamping
- `isAtBottom` transitions
- fractional jumps to top and bottom
- eviction anchor recovery
- viewport stability when eviction removes older lines
- cache invalidation across resize
- `displayWidth` stability across resize via `getLineDisplayWidth()`

## 5. Property And Benchmark Coverage

Property-style randomized coverage lives in [`virtualizer/test/property.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/property.test.ts):

- identity monotonicity and non-reuse
- eviction stability
- append independence from scroll position
- viewport invariants after random operations
- estimation-field constraints
- resize invariant preservation

Informational benchmark coverage lives in [`virtualizer/test/bench.test.ts`](/Users/tarasmankovski/Repositories/frontside/clayterm/virtualizer/test/bench.test.ts):

- Gate 1: width-provider overhead
- Gate 2: extended ANSI corpus
- Gate 3: estimate vs exact wrap-count match rate
- Gate 4: `scrollToFraction` performance
- Gate 5: skip-optimization comparison
- Gate 6: ANSI-heavy viewport resolution ratio
- Gate 7: resize performance

These are informational measurements, not conformance gates.

## 6. Commands

Run root width-provider tests:

```sh
deno test --allow-read test/width.test.ts
```

Run virtualizer tests:

```sh
cd virtualizer && deno test
```

## 7. Current-State Notes

This plan is intentionally aligned to the branch implementation, not the older Downloads draft verbatim.

Notable updates from the older draft:

- width assertions now use `getLineDisplayWidth()` directly where the branch exposes it
- the renderer width-provider surface is `createDisplayWidth()` rather than a direct synchronous export
- the current suite count is lower than the draft’s projected count because the implementation consolidates multiple properties into fewer files and parameterized tests
- the `wrap-golden` boundary fixture has been corrected to the current checked-in test case

## 8. Maintenance

This file should be updated when:

- the `Virtualizer` public API changes
- test files are renamed or reorganized
- current assertion strategy changes
- additional real-world fixtures or benchmark gates are added

The in-repo `specs/` directory is now the canonical location for these virtualizer docs.
