import { describe, expect, it } from "vitest";
import { FEEDBACK_URL, appFeedbackUrl } from "./site";

describe("appFeedbackUrl", () => {
  it("stamps the app as the source and includes the version", () => {
    const url = appFeedbackUrl("3.1.5");
    expect(url.startsWith(`${FEEDBACK_URL}?`)).toBe(true);
    expect(url).toContain("from=app");
    expect(url).toContain("v=3.1.5");
  });
});
