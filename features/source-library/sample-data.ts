import type {
  SourceFileRecord,
} from "@/features/source-library/types";

const SAMPLE_SOURCE_FILES: SourceFileRecord[] = [
  {
    id: "source-cybersecurity-handbook",
    name: "Employee Cybersecurity Handbook.pdf",
    size: 3_284_992,
    type: "pdf",
    uploadedAt: "2026-08-22T13:15:00.000Z",
    workspaceCount: 2,
    usages: [
      {
        workspaceId: "workspace-phishing-lesson",
        state: "historical",
        workspaceTitle: "Recognizing and Reporting Phishing Emails",
        purpose: "ai_input",
      },
      {
        workspaceId: "workspace-phishing-lesson",
        state: "historical",
        workspaceTitle: "Recognizing and Reporting Phishing Emails",
        purpose: "kyron_attachment",
      },
      {
        workspaceId: "workspace-security-practice",
        state: "active",
        workspaceTitle: "Cybersecurity Refresher Practice",
        purpose: "ai_input",
      },
    ],
  },
  {
    id: "source-faculty-onboarding",
    name: "Faculty Onboarding Slides.pptx",
    size: 8_941_568,
    type: "pptx",
    uploadedAt: "2026-08-21T16:40:00.000Z",
    workspaceCount: 1,
    usages: [
      {
        workspaceId: "workspace-faculty-orientation",
        state: "active",
        workspaceTitle: "New Faculty Orientation",
        purpose: "ai_input",
      },
    ],
  },
  {
    id: "source-assessment-guidelines",
    name: "Assessment Design Guidelines.docx",
    size: 1_257_472,
    type: "docx",
    uploadedAt: "2026-08-20T11:05:00.000Z",
    workspaceCount: 1,
    usages: [
      {
        workspaceId: "workspace-assessment-basics",
        state: "historical",
        workspaceTitle: "Writing Effective Assessments",
        purpose: "ai_input",
      },
    ],
  },
  {
    id: "source-course-template",
    name: "Course Planning Template.pptx",
    size: 2_097_152,
    type: "pptx",
    uploadedAt: "2026-08-18T09:30:00.000Z",
    workspaceCount: 0,
    usages: [],
  },
  {
    id: "source-project-management",
    name: "Project Management Reference.pdf",
    size: 4_608_000,
    type: "pdf",
    uploadedAt: "2026-08-17T15:45:00.000Z",
    workspaceCount: 0,
    usages: [],
  },
];

export function createSampleSourceFiles(): SourceFileRecord[] {
  return SAMPLE_SOURCE_FILES.map((file) => ({
    ...file,
    usages: file.usages.map((usage) => ({ ...usage })),
  }));
}
