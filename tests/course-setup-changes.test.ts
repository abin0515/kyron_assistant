import { describe, expect, it } from "vitest";

import type { CourseSetupFields } from "@/lib/course-setup";
import { qaSetupValues, setupChanges } from "@/lib/course-setup-changes";
import type { QaContentChange, QaContentVersion } from "@/types/api";

const generated: CourseSetupFields = {
  name: "Project risk basics",
  description: "Spotting project risks early.",
  learningObjective: "Rate project risks by likelihood and impact.",
  audience: "New team leads",
  assetType: "lesson",
  duration: 900,
};

describe("telling the QA agent's setup fixes from a person's edits", () => {
  it("takes each field's newest applied change, and only the QA agent's", () => {
    const values = qaSetupValues([
      // Newest first. A later edit in the workspace takes the objective back from QA.
      version("Edited in the workspace", [change("setup.learningObjective", "Rate risks.")]),
      version("QA revision agent", [
        change("setup.description", "A concise introduction to project risks."),
        change("setup.learningObjective", "Rate risks and pick responses."),
      ]),
      version("QA revision agent, approved by a person", [change("setup.audience", "First-time team leads")]),
      version("QA revision agent", [change("setup.name", "Risk basics")], "proposed"),
      version("QA verifier", [change("setup.duration", "900")]),
      version("Workspace course setup", []),
    ]);

    expect(values).toEqual({
      description: "A concise introduction to project risks.",
      audience: "First-time team leads",
      duration: "900",
    });
  });

  it("says QA fixed the setup while its fixes stand, and edited once a person changes anything", () => {
    const qaValues = { description: "A concise introduction to project risks." };
    const fixedByQa = { ...generated, description: "A concise introduction to project risks." };

    expect(setupChanges(generated, generated, qaValues)).toEqual({ qaFixed: false, edited: false });
    expect(setupChanges(fixedByQa, generated, qaValues)).toEqual({ qaFixed: true, edited: false });
    // A person also changed the audience.
    expect(setupChanges({ ...fixedByQa, audience: "Managers" }, generated, qaValues)).toEqual({
      qaFixed: true,
      edited: true,
    });
    // A person rewrote the field QA had fixed.
    expect(setupChanges({ ...generated, description: "Something else." }, generated, qaValues)).toEqual({
      qaFixed: false,
      edited: true,
    });
    // Spacing alone is not a change, and the length compares as text.
    expect(setupChanges({ ...generated, name: " Project risk basics " }, generated, {})).toEqual({
      qaFixed: false,
      edited: false,
    });
    expect(setupChanges({ ...generated, duration: 1800 }, generated, { duration: "1800" })).toEqual({
      qaFixed: true,
      edited: false,
    });
  });
});

function version(
  author: string,
  changes: QaContentVersion["changes"],
  status: QaContentVersion["status"] = "applied",
): Pick<QaContentVersion, "status" | "author" | "changes"> {
  return { author, changes, status };
}

function change(fieldPath: string, after: string): QaContentChange {
  return { activityId: null, fieldPath, before: null, after, rationale: "", findingIds: [], criterionIds: [] };
}
