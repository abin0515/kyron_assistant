// A short lesson with deliberately seeded defects, based on the overfitting
// example in the QA proposal. Useful for trying the agent end to end.
export const EXAMPLE_LESSON_PACKET = {
  lesson: {
    title: "Why models overfit",
    description: "A short lesson on recognizing and reducing overfitting.",
    audience: "High-school students (grades 10–12) who are new to machine learning",
    learningObjectives: [
      "Explain what overfitting is and recognize it from training and test accuracy.",
      "Name two ways to reduce overfitting.",
    ],
    durationSeconds: 480,
    assetType: "lesson",
  },
  activities: [
    {
      id: "intro",
      type: "instruction",
      title: "Training accuracy",
      narration:
        "Training accuracy measures how well a model fits the examples it learned from. Increasing training accuracy always improves performance on unseen data.",
      onScreenText: "Training accuracy = how well the model fits its training examples",
    },
    {
      id: "check-1",
      type: "question",
      title: "Spot the problem",
      question: {
        prompt:
          "A model scores 99% on its training data but only 62% on new data. What is the most likely explanation?",
        options: [
          { id: "A", text: "The model is underfitting." },
          { id: "B", text: "The model is overfitting." },
          { id: "C", text: "The new data must be mislabeled." },
          { id: "D", text: "The model needs more layers." },
        ],
        answerKey: ["A"],
        rationale:
          "High training accuracy with much lower accuracy on new data is the classic sign of overfitting.",
      },
    },
    {
      id: "talk-1",
      type: "conversation",
      title: "Explain it back",
      narration:
        "Explain in your own words why a model can do well on its training data but poorly on new data.",
      tutorGuidance:
        "Accept answers that mention memorizing the training examples or learning noise. If the learner says that more training accuracy always helps, agree and move on.",
    },
    {
      id: "fixes",
      type: "instruction",
      title: "Reducing overfitting",
      narration:
        "To reduce overfitting, you can [insert technique list]. Validation data helps you notice overfitting early.",
    },
  ],
  references: [
    {
      title: "Approved reference: Overfitting",
      text: "Overfitting happens when a model learns patterns that are specific to its training data, including noise, instead of patterns that generalize. An overfit model shows high accuracy on training data but noticeably lower accuracy on new, unseen data. Increasing training accuracy does not always improve performance on unseen data; past a point, it often makes generalization worse. Common ways to reduce overfitting include collecting more training data, simplifying the model, regularization, and early stopping based on validation performance. Validation data is held out from training and is used to estimate how the model will perform on new data.",
    },
  ],
};
