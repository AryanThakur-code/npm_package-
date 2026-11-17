'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createQuiz, replayQuiz } = require('./index');

const mediumItems = Array.from({ length: 4 }, (_, i) => ({
  id: `M${i}`, topic: 'Algebra', level: 2
}));
const questions = [
  ...mediumItems,
  { id: 'E1', topic: 'Algebra', level: 1 },
  { id: 'H1', topic: 'Algebra', level: 3 }
];
const options = { questions, seed: 'test', limit: 5 };
function answer(quiz, correct) {
  const { id } = quiz.nextQuestion();
  return quiz.recordAnswer({ questionId: id, correct });
}

test('upgrades after three correct answers and selects a Hard question next', () => {
  const quiz = createQuiz(options);
  assert.equal(answer(quiz, true).scoreAfter, 65);
  assert.equal(answer(quiz, true).scoreAfter, 75.5);
  const entry = answer(quiz, true);
  assert.equal(entry.scoreAfter, 82.85);
  assert.equal(entry.reason, 'THREE_CORRECT');
  assert.equal(quiz.nextQuestion().level, 3);
});

test('downgrades after two wrong answers and uses the new level', () => {
  const quiz = createQuiz(options);
  assert.equal(answer(quiz, false).reason, 'HOLD');
  assert.equal(answer(quiz, false).reason, 'TWO_INCORRECT');
  assert.equal(quiz.nextQuestion().level, 1);
});

test('selects the weaker topic even if it needs a fallback', () => {
  const quiz = createQuiz({
    questions: [
      { id: 'M1', topic: 'A', level: 2 },
      { id: 'E1', topic: 'A', level: 1 },
      { id: 'H1', topic: 'B', level: 3 }
    ]
  });
  assert.equal(quiz.nextQuestion().topic, 'A');
  answer(quiz, false);
  const question = quiz.nextQuestion();
  assert.equal(question.topic, 'A');
  assert.equal(question.selection, 'NEAREST_AVAILABLE');
});

test('falls back from Hard all the way to Easy when necessary', () => {
  const quiz = createQuiz({ questions: [{ id: 'E', topic: 'A', level: 1 }], startingLevel: 3 });
  assert.equal(quiz.nextQuestion().selection, 'NEAREST_AVAILABLE');
  assert.equal(quiz.nextQuestion().level, 1);
});

test('pending reads and exported reports are isolated from changes by callers', () => {
  const quiz = createQuiz(options);
  const first = quiz.nextQuestion();
  const id = first.id;
  first.id = 'changed';
  assert.equal(quiz.nextQuestion().id, id);
  assert.throws(() => quiz.recordAnswer({ questionId: 'wrong', correct: true }), /currently offered/);
  answer(quiz, true);
  assert.throws(() => quiz.recordAnswer({ questionId: id, correct: true }), /currently offered/);
  quiz.report().trail[0].id = 'edited';
  assert.equal(quiz.report().trail[0].id, id);
});

test('replays a JSON-roundtripped attempt with a reordered bank', () => {
  const quiz = createQuiz(options);
  for (const correct of [true, true, true, false, false]) answer(quiz, correct);
  const report = quiz.report();
  assert.equal(report.status, 'LIMIT_REACHED');
  assert.equal(report.accuracy, 60);
  assert.equal(new Set(report.events.map(event => event.questionId)).size, 5);
  const events = JSON.parse(JSON.stringify(report.events));
  assert.deepEqual(replayQuiz({ ...options, questions: [...questions].reverse() }, events), report);
  assert.throws(() => replayQuiz(options, [{ questionId: 'unexpected', correct: true }]), /answer 1/);
});

test('reports bank exhaustion and rejects duplicate bank IDs', () => {
  const quiz = createQuiz({ questions: mediumItems, limit: 9 });
  for (const _question of mediumItems) answer(quiz, false);
  assert.equal(quiz.nextQuestion(), null);
  assert.equal(quiz.report().status, 'BANK_EXHAUSTED');
  assert.throws(() => createQuiz({ questions: [mediumItems[0], mediumItems[0]] }), /Duplicate/);
});

test('validates inputs and handles the level boundaries', () => {
  assert.throws(() => createQuiz({ questions: [] }), /nonempty/);
  assert.throws(() => createQuiz({ questions, limit: 0 }), /limit/);
  assert.throws(() => createQuiz({ questions, seed: '' }), /seed/);
  for (const [startingLevel, correct, reason, count] of [
    [1, false, 'AT_LOWEST', 2],
    [3, true, 'AT_HIGHEST', 3]
  ]) {
    const quiz = createQuiz({ questions, startingLevel });
    for (let i = 1; i < count; i++) answer(quiz, correct);
    assert.equal(answer(quiz, correct).reason, reason);
  }
});
