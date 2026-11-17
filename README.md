# Quiz Trace Replay

An adaptive quiz can make a sensible choice and still leave a teacher wondering why. This dependency-free Node.js library returns the question it selected, the reason for any difficulty change, and a replayable record. Give it the same bank, settings, and answer events to reproduce a completed or partial attempt.

## Use it

Requires Node.js 22 or later. Once published, install it with `npm install quiz-trace-replay`. For a local preview, run `npm pack` in this folder and install the resulting tarball in a separate Node.js project.

```js
const { createQuiz, replayQuiz } = require('quiz-trace-replay');

const settings = {
  seed: 'class-demo',
  limit: 1,
  questions: [{ id: 'a1', topic: 'Algebra', level: 2 }]
};

const quiz = createQuiz(settings);
const question = quiz.nextQuestion();
quiz.recordAnswer({ questionId: question.id, correct: true });

const report = quiz.report();
console.log(report.trail[0].reason); // HOLD
console.log(replayQuiz(settings, report.events).accuracy); // 100
```

## How it works

- Each topic starts with a proficiency of 50 and a target difficulty of Medium. Pass `startingLevel` to override the initial target.
- The next item comes from the weakest topic with unused questions. Among candidates tied on proficiency, the closest difficulty to its topic's target wins. The seed and question position break remaining ties reproducibly. Levels are 1 (Easy), 2 (Medium), and 3 (Hard).
- After grading, the new proficiency is 70% of the previous score plus 30 points for a correct answer, or zero additional points for an incorrect answer. Three consecutive correct answers raise the topic's target. Two incorrect answers in its most recent three lower it. The answer window clears when the target changes.
- The report separates the target level from the item actually served. If a Hard item is unavailable, it can explain why an Easy or Medium item was used. A quiz can finish at the requested limit or when the bank runs out.

## API

| Call | Returns |
| --- | --- |
| `createQuiz({ questions, seed?, limit?, startingLevel? })` | An in-memory session. Each question needs a unique string `id`, string `topic`, and numeric `level`. |
| `quiz.nextQuestion()` | The outstanding item and its selection details. Returns the same item until graded, or `null` at the end. |
| `quiz.recordAnswer({ questionId, correct })` | The graded item's trail entry. The app supplies the boolean grading outcome. |
| `quiz.report()` | Status, counts, accuracy, ordered answer events, and the decision trail. |
| `replayQuiz(settings, events)` | Reconstructed report. Throws if an event ID does not match what the selector expected. |

Keep the bank metadata, seed, starting level, limit, and package version alongside any saved events you plan to replay. A report describes the answered questions. The host application supplies prompts, checks answer keys, and handles persistence.

## Run tests

Run `npm test` from this folder. The tests cover promotion, demotion, fallback, exhausted banks, repeated requests, invalid data, and deterministic replay. The separate demo project imports the package by name and grades real sample questions.
