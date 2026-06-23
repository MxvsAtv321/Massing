import { describe, it, expect, beforeEach } from "vitest";
import { selection } from "../src/render/selectionStore";

beforeEach(() => selection.clear());

describe("selection store", () => {
  it("starts cleared", () => {
    expect(selection.getSelected()).toBeNull();
  });

  it("selects and reads back a cluster", () => {
    selection.select("c3");
    expect(selection.getSelected()).toBe("c3");
    expect(selection.getSnapshot().selectedClusterId).toBe("c3");
  });

  it("clears back to null", () => {
    selection.select("c3");
    selection.clear();
    expect(selection.getSelected()).toBeNull();
  });

  it("notifies subscribers on each change, and not after unsubscribe", () => {
    let n = 0;
    const unsub = selection.subscribe(() => n++);
    selection.select("c1");
    selection.select("c2");
    unsub();
    selection.select("c3");
    expect(n).toBe(2);
  });

  it("does not notify when re-selecting the already-selected cluster", () => {
    selection.select("c1");
    let n = 0;
    const unsub = selection.subscribe(() => n++);
    selection.select("c1");
    unsub();
    expect(n).toBe(0);
  });

  it("publishes a fresh snapshot object on change", () => {
    const before = selection.getSnapshot();
    selection.select("c9");
    const after = selection.getSnapshot();
    expect(after).not.toBe(before);
    expect(after.selectedClusterId).toBe("c9");
  });
});
