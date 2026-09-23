import { describe, expect, it } from "vitest";
import { isBo3Queue, queueLabel } from "./tracker";

describe("isBo3Queue — mirrors best_of_for_event in tracker.rs", () => {
  it("reads Bo3 queues Arena does not name Traditional_*", () => {
    expect(isBo3Queue("Traditional_Ladder")).toBe(true);
    expect(isBo3Queue("Standard_Bo3_EarlyAccess")).toBe(true);
    expect(isBo3Queue("Constructed_BestOf3")).toBe(true);
    expect(isBo3Queue("FRA_Trad_Draft")).toBe(true);
  });

  it("leaves Bo1 queues alone", () => {
    expect(isBo3Queue("Ladder")).toBe(false);
    expect(isBo3Queue("Standard_Bo1_EarlyAccess")).toBe(false);
    expect(isBo3Queue("FRA_Premier_Draft_EarlyAccess")).toBe(false);
    expect(isBo3Queue("Tradewinds_Cube")).toBe(false);
  });
});

describe("queueLabel", () => {
  it("keeps the known ladder labels", () => {
    expect(queueLabel("Ladder")).toBe("Standard Ranked");
    expect(queueLabel("Traditional_Ladder")).toBe("Standard Ranked · Bo3");
    expect(queueLabel("Traditional_Explorer_Ladder")).toBe("Explorer Ranked · Bo3");
  });

  it("names the Early Access events readably", () => {
    expect(queueLabel("Standard_Bo1_EarlyAccess")).toBe("Standard Early Access");
    expect(queueLabel("Standard_Bo3_EarlyAccess")).toBe("Standard Early Access · Bo3");
    expect(queueLabel("FRA_Premier_Draft_EarlyAccess")).toBe(
      "FRA Premier Draft Early Access",
    );
  });

  it("does not print the Bo tag twice", () => {
    expect(queueLabel("Constructed_BestOf3")).toBe("Constructed · Bo3");
    expect(queueLabel("FRA_Trad_Draft")).toBe("FRA Draft · Bo3");
  });
});
