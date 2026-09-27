import { describe, expect, it } from "vitest";
import { missingUploadRequirements } from "@/lib/social/publish-form";

const complete = { hasVideo: true, title: "My video", kids: "no", synthetic: "yes", consent: true, mode: "now", scheduled: "" };

describe("YouTube upload form guidance", () => {
  it("identifies the unanswered AI disclosure from the user's recording", () => {
    expect(missingUploadRequirements({ ...complete, synthetic: "" })).toEqual([
      { id: "youtube-synthetic", message: "Choose Yes or No for realistic altered / AI-generated content." },
    ]);
  });
  it("accepts either explicit disclosure choice without choosing one automatically", () => {
    for (const kids of ["yes", "no"]) for (const synthetic of ["yes", "no"]) {
      expect(missingUploadRequirements({ ...complete, kids, synthetic })).toEqual([]);
    }
    expect(missingUploadRequirements({ ...complete, synthetic: "anything" })[0].id).toBe("youtube-synthetic");
  });
  it("lists all missing decisions in form order", () => {
    expect(missingUploadRequirements({ ...complete, hasVideo: false, title: " ", kids: "", synthetic: "", consent: false }).map((item) => item.id))
      .toEqual(["youtube-video", "youtube-title", "youtube-kids", "youtube-synthetic", "youtube-consent"]);
  });
  it("still requires upload permission with all other fields completed", () => {
    expect(missingUploadRequirements({ ...complete, consent: false }).map((item) => item.id)).toEqual(["youtube-consent"]);
  });
  it("requires a valid date for scheduling but not a private upload now", () => {
    for (const scheduled of ["", "invalid"]) {
      expect(missingUploadRequirements({ ...complete, mode: "schedule", scheduled }).map((item) => item.id)).toEqual(["youtube-scheduled"]);
    }
    expect(missingUploadRequirements({ ...complete, mode: "schedule", scheduled: "2030-01-01T10:30" })).toEqual([]);
    expect(missingUploadRequirements(complete)).toEqual([]);
  });
});
