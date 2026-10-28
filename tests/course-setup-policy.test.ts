import { describe, expect, it } from "vitest";

import {
  courseSetupReviewResult,
  courseSetupsMatch,
  normalizeCourseSetup,
  requiresCourseSetupReview,
  shouldInvalidateCourseSetupReview,
  type CourseSetupFields,
} from "@/lib/course-setup";

const generatedSetup: CourseSetupFields = {
  name: "Project Planning",
  description: "Build a practical project plan.",
  learningObjective: "Create a project plan.",
  audience: "New project managers",
  assetType: "lesson",
  duration: 900,
};

describe("course setup calibration policy", () => {
  it("normalizes the same text fields used by Kyron submission", () => {
    expect(
      normalizeCourseSetup({
        ...generatedSetup,
        name: "  Project Planning  ",
        audience: " New project managers\n",
      }),
    ).toEqual(generatedSetup);
  });

  it("detects approved-as-is reviews after trimming", () => {
    expect(
      courseSetupReviewResult(generatedSetup, {
        ...generatedSetup,
        description: ` ${generatedSetup.description} `,
      }),
    ).toBe("approved_as_is");
  });

  it("detects edited-and-approved reviews across all six fields", () => {
    for (const reviewed of [
      { ...generatedSetup, name: "Updated title" },
      { ...generatedSetup, description: "Updated description" },
      { ...generatedSetup, learningObjective: "Updated objective" },
      { ...generatedSetup, audience: "Experienced managers" },
      { ...generatedSetup, assetType: "practice" as const },
      { ...generatedSetup, duration: 1800 as const },
    ]) {
      expect(courseSetupReviewResult(generatedSetup, reviewed)).toBe(
        "edited_and_approved",
      );
    }
  });

  it("invalidates review when a reviewed setup changes", () => {
    const calibration = {
      reviewStatus: "reviewed" as const,
      reviewedSetup: generatedSetup,
    };

    expect(
      shouldInvalidateCourseSetupReview(calibration, {
        ...generatedSetup,
        audience: "Senior project managers",
      }),
    ).toBe(true);
    expect(shouldInvalidateCourseSetupReview(calibration, generatedSetup)).toBe(
      false,
    );
  });

  it("allows manual setups and blocks unreviewed AI setups", () => {
    expect(requiresCourseSetupReview(null, generatedSetup)).toBe(false);
    expect(
      requiresCourseSetupReview(
        { reviewStatus: "needs_review", reviewedSetup: null },
        generatedSetup,
      ),
    ).toBe(true);
    expect(
      requiresCourseSetupReview(
        { reviewStatus: "reviewed", reviewedSetup: generatedSetup },
        generatedSetup,
      ),
    ).toBe(false);
  });

  it("does not require review when the workflow keeps calibration optional", () => {
    expect(
      requiresCourseSetupReview(
        {
          reviewRequired: false,
          reviewStatus: "needs_review",
          reviewedSetup: null,
        },
        generatedSetup,
      ),
    ).toBe(false);
  });

  it("requires review again when the saved approval is stale", () => {
    expect(
      requiresCourseSetupReview(
        { reviewStatus: "reviewed", reviewedSetup: generatedSetup },
        { ...generatedSetup, duration: 1800 },
      ),
    ).toBe(true);
    expect(courseSetupsMatch(generatedSetup, generatedSetup)).toBe(true);
  });
});
