import { beforeEach, describe, expect, it } from "./suite.ts";
import { createTerm, type Term } from "../term.ts";
import { close, fixed, grow, open, text } from "../ops.ts";

function box(id: string, width: number, height: number) {
  return open(id, {
    layout: { width: fixed(width), height: fixed(height) },
  });
}

// ┌─root (40x10, ltr)──────────────────┐
// │┌─left (20x10)─┐┌─right (20x10)──┐│
// ││L              ││R               ││
// ││               ││                ││
// ││               ││                ││
// ││               ││                ││
// ││               ││                ││
// ││               ││                ││
// ││               ││                ││
// │└───────────────┘└────────────────┘│
// └───────────────────────────────────┘
function layout() {
  return [
    open("root", {
      layout: { width: grow(), height: grow(), direction: "ltr" },
    }),
    box("left", 20, 10),
    text("L"),
    close(),
    box("right", 20, 10),
    text("R"),
    close(),
    close(),
  ];
}

describe("pointer events", () => {
  let term: Term;

  beforeEach(async () => {
    term = await createTerm({ width: 40, height: 10 });
  });

  it("returns no events when pointer is not provided", () => {
    let result = term.render(layout());
    expect(result.events).toEqual([]);
  });

  it("returns no events when pointer is outside all elements", () => {
    let result = term.render(layout(), {
      pointer: { x: 100, y: 100, down: false },
    });
    expect(result.events).toEqual([]);
  });

  it("fires pointerenter when pointer moves over an element", () => {
    let result = term.render(layout(), {
      pointer: { x: 5, y: 5, down: false },
    });
    let enters = result.events.filter((e) => e.type === "pointerenter");
    expect(enters.some((e) => e.id === "left")).toBe(true);
  });

  it("does not fire pointerenter again on subsequent frames", () => {
    term.render(layout(), {
      pointer: { x: 5, y: 5, down: false },
    });
    let result = term.render(layout(), {
      pointer: { x: 5, y: 5, down: false },
    });
    let enters = result.events.filter((e) => e.type === "pointerenter");
    expect(enters.some((e) => e.id === "left")).toBe(false);
  });

  it("fires pointerleave when pointer moves off an element", () => {
    term.render(layout(), {
      pointer: { x: 5, y: 5, down: false },
    });
    let result = term.render(layout(), {
      pointer: { x: 25, y: 5, down: false },
    });
    let leaves = result.events.filter((e) => e.type === "pointerleave");
    expect(leaves.some((e) => e.id === "left")).toBe(true);
  });

  it("fires pointerenter and pointerleave when moving between elements", () => {
    term.render(layout(), {
      pointer: { x: 5, y: 5, down: false },
    });
    let result = term.render(layout(), {
      pointer: { x: 25, y: 5, down: false },
    });
    expect(result.events).toContainEqual({ type: "pointerleave", id: "left" });
    expect(result.events).toContainEqual({ type: "pointerenter", id: "right" });
  });

  it("fires pointerclick on press then release over same element", () => {
    term.render(layout(), {
      pointer: { x: 5, y: 5, down: true },
    });
    let result = term.render(layout(), {
      pointer: { x: 5, y: 5, down: false },
    });
    expect(result.events).toContainEqual({ type: "pointerclick", id: "left" });
  });

  it("does not fire pointerclick if released over a different element", () => {
    term.render(layout(), {
      pointer: { x: 5, y: 5, down: true },
    });
    let result = term.render(layout(), {
      pointer: { x: 25, y: 5, down: false },
    });
    let clicks = result.events.filter((e) => e.type === "pointerclick");
    expect(clicks.some((e) => e.id === "left")).toBe(false);
    expect(clicks.some((e) => e.id === "right")).toBe(false);
  });

  it("fires pointerleave for all hovered elements when pointer is removed", () => {
    term.render(layout(), {
      pointer: { x: 5, y: 5, down: false },
    });
    let result = term.render(layout());
    let leaves = result.events.filter((e) => e.type === "pointerleave");
    expect(leaves.some((e) => e.id === "left")).toBe(true);
  });

  it("does not fire pointerleave on parent when moving to child", () => {
    // pointer starts on root but outside both children (if layout allows),
    // or we just verify that moving within a parent's bounds doesn't leave it
    term.render(layout(), {
      pointer: { x: 5, y: 5, down: false },
    });
    // move to a different spot still inside "root" and "left"
    let result = term.render(layout(), {
      pointer: { x: 10, y: 5, down: false },
    });
    let leaves = result.events.filter((e) => e.type === "pointerleave");
    expect(leaves.some((e) => e.id === "root")).toBe(false);
    expect(leaves.some((e) => e.id === "left")).toBe(false);
  });

  it("includes parent element in enter/leave events", () => {
    let result = term.render(layout(), {
      pointer: { x: 5, y: 5, down: false },
    });
    let enters = result.events.filter((e) => e.type === "pointerenter");
    expect(enters.some((e) => e.id === "root")).toBe(true);
    expect(enters.some((e) => e.id === "left")).toBe(true);
  });
});
