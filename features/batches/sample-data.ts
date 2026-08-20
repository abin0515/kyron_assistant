import type {
  BatchCourseSetup,
  BatchDraftItem,
} from "@/features/batches/types";

const SAMPLE_BATCH: BatchDraftItem[] = [
  {
    id: "sample-phishing",
    fileName: "phishing-awareness-handbook.pdf",
    fileSize: 2_842_624,
    status: "ready",
    statusMessage: "Course setup is ready to review.",
    setup: {
      title: "Recognizing and Reporting Phishing Emails",
      description:
        "A practical introduction to identifying suspicious messages, checking links safely, and reporting possible phishing attempts.",
      learningObjective:
        "Learners will identify common phishing warning signs and follow the correct reporting process.",
      audience: "New university faculty and staff",
      assetType: "lesson",
      duration: 900,
    },
  },
  {
    id: "sample-student-support",
    fileName: "student-support-scenarios.pptx",
    fileSize: 5_693_440,
    status: "needs_review",
    statusMessage: "Confirm the audience before creating this draft.",
    setup: {
      title: "Responding to Student Support Requests",
      description:
        "Scenario practice for responding consistently and empathetically when students ask for academic support.",
      learningObjective:
        "Learners will choose an appropriate response and connect students with the right support resource.",
      audience: "",
      assetType: "scenario",
      duration: 900,
    },
  },
  {
    id: "sample-lab-safety",
    fileName: "laboratory-safety-overview.pdf",
    fileSize: 3_407_872,
    status: "processing",
    statusMessage: "Analyzing source material and suggesting course fields.",
    setup: emptySetup("Laboratory Safety Overview"),
  },
  {
    id: "sample-data-privacy",
    fileName: "data-privacy-reference.pdf",
    fileSize: 1_925_120,
    status: "error",
    statusMessage: "Not enough readable source text was found.",
    setup: emptySetup("Data Privacy Reference"),
  },
];

export function createSampleBatch(): BatchDraftItem[] {
  return SAMPLE_BATCH.map((item) => ({
    ...item,
    setup: { ...item.setup },
  }));
}

export function createSetupFromFileName(fileName: string): BatchCourseSetup {
  const title = titleFromFileName(fileName);

  return {
    title,
    description: `A short course based on the source material in ${fileName}.`,
    learningObjective: `Learners will explain the key ideas from ${title.toLowerCase()} and apply them in their work.`,
    audience: "CPE learners and staff",
    assetType: "lesson",
    duration: 900,
  };
}

function emptySetup(title: string): BatchCourseSetup {
  return {
    title,
    description: "",
    learningObjective: "",
    audience: "",
    assetType: "lesson",
    duration: 900,
  };
}

function titleFromFileName(fileName: string): string {
  const nameWithoutExtension = fileName.replace(/\.[^.]+$/, "");

  return nameWithoutExtension
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
