import { describe, it, expect } from "vitest";
import { pickBackend } from "../src/render/pickBackend";

describe("pickBackend", () => {
  it("selects webgpu when the platform exposes it", () => {
    expect(pickBackend(true)).toBe("webgpu");
  });

  it("falls back to webgl2 when webgpu is unavailable", () => {
    expect(pickBackend(false)).toBe("webgl2");
  });
});
