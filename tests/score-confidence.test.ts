import { describe, it, expect } from "vitest";
import {
  greenfieldPopulationConfidence,
  reachConfidence,
  demandConditionalConfidence,
  sunConfidenceLabel,
} from "../src/score/confidence";

describe("score confidence", () => {
  it("greenfield population is high confidence", () => {
    expect(greenfieldPopulationConfidence().class).toBe("high");
  });

  it("reach confidence scales with the reached fraction", () => {
    expect(reachConfidence(0.98).class).toBe("high");
    expect(reachConfidence(0.8).class).toBe("medium");
    expect(reachConfidence(0.5).class).toBe("low");
  });

  it("partial catchment coverage caps reach confidence and says so", () => {
    const r = reachConfidence(0.98, "partial");
    expect(r.class).toBe("medium"); // capped down from high
    expect(r.note).toContain("dominant road component");
  });

  it("traffic is demand-conditional low confidence", () => {
    expect(demandConditionalConfidence("assumed scenario").class).toBe("low");
  });

  it("the sun label carries the ledger class and the shadow risk", () => {
    expect(sunConfidenceLabel("low", 0.8, 3.2).class).toBe("low");
    expect(sunConfidenceLabel("high", 0.1, 1.0).note).toContain("estimated-height");
  });
});
