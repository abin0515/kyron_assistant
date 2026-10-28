export type CourseSetupFields = {
  name: string;
  description: string;
  learningObjective: string;
  audience: string;
  assetType: "lesson" | "practice" | "scenario";
  duration: 480 | 900 | 1800 | 3600;
};

export function normalizeCourseSetup(
  setup: CourseSetupFields,
): CourseSetupFields {
  return {
    name: setup.name.trim(),
    description: setup.description.trim(),
    learningObjective: setup.learningObjective.trim(),
    audience: setup.audience.trim(),
    assetType: setup.assetType,
    duration: setup.duration,
  };
}

export function courseSetupsMatch(
  first: CourseSetupFields,
  second: CourseSetupFields,
): boolean {
  const left = normalizeCourseSetup(first);
  const right = normalizeCourseSetup(second);

  return (
    left.name === right.name &&
    left.description === right.description &&
    left.learningObjective === right.learningObjective &&
    left.audience === right.audience &&
    left.assetType === right.assetType &&
    left.duration === right.duration
  );
}

export function courseSetupReviewResult(
  generated: CourseSetupFields,
  reviewed: CourseSetupFields,
): "approved_as_is" | "edited_and_approved" {
  return courseSetupsMatch(generated, reviewed)
    ? "approved_as_is"
    : "edited_and_approved";
}

export function requiresCourseSetupReview(
  calibration: {
    reviewRequired?: boolean;
    reviewStatus: "needs_review" | "reviewed";
    reviewedSetup: CourseSetupFields | null;
  } | null,
  currentSetup: CourseSetupFields,
): boolean {
  return Boolean(
    calibration &&
      calibration.reviewRequired !== false &&
      (calibration.reviewStatus !== "reviewed" ||
        !calibration.reviewedSetup ||
        !courseSetupsMatch(currentSetup, calibration.reviewedSetup)),
  );
}

export function shouldInvalidateCourseSetupReview(
  calibration: {
    reviewStatus: "needs_review" | "reviewed";
    reviewedSetup: CourseSetupFields | null;
  } | null,
  currentSetup: CourseSetupFields,
): boolean {
  return Boolean(
    calibration?.reviewStatus === "reviewed" &&
      calibration.reviewedSetup &&
      !courseSetupsMatch(currentSetup, calibration.reviewedSetup),
  );
}
