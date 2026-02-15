import { describe, expect, it } from "vitest";

import { stackLabelPositions, valueToPixelY } from "./endLabelLayout";

describe("stackLabelPositions", () => {
  it("preserves non-overlapping positions", () => {
    const positions = stackLabelPositions(
      [
        { id: "a", rawY: 20 },
        { id: "b", rawY: 50 },
        { id: "c", rawY: 90 },
      ],
      10,
      120,
      14,
    );

    expect(positions.a).toBe(20);
    expect(positions.b).toBe(50);
    expect(positions.c).toBe(90);
  });

  it("stacks overlapping labels while preserving vertical order", () => {
    const positions = stackLabelPositions(
      [
        { id: "top", rawY: 40 },
        { id: "mid", rawY: 43 },
        { id: "bot", rawY: 45 },
      ],
      10,
      120,
      14,
    );

    expect(positions.top).toBeLessThan(positions.mid);
    expect(positions.mid).toBeLessThan(positions.bot);
    expect(positions.mid - positions.top).toBeGreaterThanOrEqual(14);
    expect(positions.bot - positions.mid).toBeGreaterThanOrEqual(14);
  });


  it("uses deterministic ordering when two labels share the same raw position", () => {
    const positions = stackLabelPositions(
      [
        { id: "zeta", rawY: 40 },
        { id: "alpha", rawY: 40 },
      ],
      10,
      120,
      14,
    );

    expect(positions.alpha).toBeLessThan(positions.zeta);
    expect(positions.zeta - positions.alpha).toBeGreaterThanOrEqual(14);
  });
  it("keeps labels within bounds when dense labels are near bottom", () => {
    const positions = stackLabelPositions(
      [
        { id: "a", rawY: 104 },
        { id: "b", rawY: 105 },
        { id: "c", rawY: 106 },
      ],
      10,
      110,
      14,
    );

    expect(positions.a).toBeGreaterThanOrEqual(10);
    expect(positions.c).toBeLessThanOrEqual(110);
    expect(positions.b - positions.a).toBeGreaterThanOrEqual(14);
    expect(positions.c - positions.b).toBeGreaterThanOrEqual(14);
  });
});

describe("valueToPixelY", () => {
  it("maps higher values toward the top of the chart", () => {
    const top = valueToPixelY(100, 0, 100, 10, 210);
    const mid = valueToPixelY(50, 0, 100, 10, 210);
    const bottom = valueToPixelY(0, 0, 100, 10, 210);

    expect(top).toBe(10);
    expect(mid).toBe(110);
    expect(bottom).toBe(210);
  });
});
