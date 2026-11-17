'use strict';

const { createHash } = require('node:crypto');

function isLevel(value) {
  return Number.isInteger(value) && value >= 1 && value <= 3;
}

function createQuiz({ questions, seed = 'default', limit, startingLevel = 2 } = {}) {
  if (!Array.isArray(questions) || !questions.length) {
    throw new TypeError('Provide a nonempty questions array.');
  }
  if (typeof seed !== 'string' || !seed.trim()) {
    throw new TypeError('seed must be a nonempty string.');
  }
  if (!isLevel(startingLevel)) {
    throw new RangeError('startingLevel must be 1, 2, or 3.');
  }

  const maxAnswers = limit ?? questions.length;
  if (!Number.isSafeInteger(maxAnswers) || maxAnswers < 1) {
    throw new RangeError('limit must be a positive safe integer.');
  }

  const bank = [];
  const ids = new Set();
  const topics = new Map();

  for (const question of questions) {
    if (!question || typeof question.id !== 'string' || !question.id.trim() ||
        typeof question.topic !== 'string' || !question.topic.trim() ||
        !isLevel(question.level)) {
      throw new TypeError('Each question needs a nonempty id and topic, and a level from 1 to 3.');
    }
    const { id, topic, level } = question;
    if (ids.has(id)) throw new Error(`Duplicate question ID: ${id}.`);
    ids.add(id);
    bank.push({ id, topic, level });
    if (!topics.has(topic)) {
      topics.set(topic, { score: 50, targetLevel: startingLevel, recent: [] });
    }
  }

  // Sorting makes a tie independent of how the caller orders the question bank.
  bank.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const used = new Set();
  const trail = [];
  let pending = null;

  function nextQuestion() {
    if (pending) return structuredClone(pending);
    if (trail.length >= maxAnswers || used.size === bank.length) return null;

    let best = [];
    let weakestScore = Infinity;
    let closestLevel = Infinity;
    for (const question of bank) {
      if (used.has(question.id)) continue;

      const { score, targetLevel } = topics.get(question.topic);
      const distance = Math.abs(question.level - targetLevel);
      if (score < weakestScore || (score === weakestScore && distance < closestLevel)) {
        weakestScore = score;
        closestLevel = distance;
        best = [question];
      } else if (score === weakestScore && distance === closestLevel) {
        best.push(question);
      }
    }

    const position = trail.length + 1;
    const hash = createHash('sha256').update(JSON.stringify([seed, position])).digest();
    const question = best[hash.readUInt32BE(0) % best.length];
    const { score, targetLevel } = topics.get(question.topic);
    pending = {
      ...question,
      position,
      scoreBefore: score,
      targetLevel,
      selection: question.level === targetLevel ? 'EXACT_LEVEL' : 'NEAREST_AVAILABLE'
    };
    return structuredClone(pending);
  }

  function recordAnswer({ questionId, correct } = {}) {
    if (typeof correct !== 'boolean') throw new TypeError('correct must be a boolean.');
    if (!pending || questionId !== pending.id) {
      throw new Error('The answer must match the currently offered question.');
    }

    const state = topics.get(pending.topic);
    const recent = [...state.recent, correct].slice(-3);
    const wrong = recent.filter(answer => !answer).length;
    const previousLevel = state.targetLevel;
    if (recent.length === 3 && wrong === 0) {
      state.targetLevel = Math.min(3, previousLevel + 1);
    } else if (wrong >= 2) {
      state.targetLevel = Math.max(1, previousLevel - 1);
    }
    state.recent = state.targetLevel === previousLevel ? recent : [];

    let reason = 'HOLD';
    if (state.targetLevel > previousLevel) reason = 'THREE_CORRECT';
    else if (state.targetLevel < previousLevel) reason = 'TWO_INCORRECT';
    else if (recent.length === 3 && wrong === 0) reason = 'AT_HIGHEST';
    else if (wrong >= 2) reason = 'AT_LOWEST';

    state.score = Math.round((state.score * 0.7 + (correct ? 30 : 0)) * 100) / 100;
    const entry = { ...pending, correct, scoreAfter: state.score, nextTargetLevel: state.targetLevel, reason };
    used.add(questionId);
    trail.push(entry);
    pending = null;
    return structuredClone(entry);
  }

  function report() {
    const correctCount = trail.filter(entry => entry.correct).length;
    const status = trail.length >= maxAnswers ? 'LIMIT_REACHED'
      : used.size === bank.length ? 'BANK_EXHAUSTED' : 'IN_PROGRESS';
    return {
      status,
      answered: trail.length,
      correct: correctCount,
      accuracy: trail.length ? Math.round(correctCount / trail.length * 10000) / 100 : 0,
      events: trail.map(entry => ({ questionId: entry.id, correct: entry.correct })),
      trail: structuredClone(trail)
    };
  }

  return { nextQuestion, recordAnswer, report };
}

function replayQuiz(options, events) {
  if (!Array.isArray(events)) throw new TypeError('events must be an array.');
  const quiz = createQuiz(options);
  for (const [index, event] of events.entries()) {
    const expected = quiz.nextQuestion();
    if (!expected || !event || event.questionId !== expected.id) {
      throw new Error(`Replay question mismatch at answer ${index + 1}.`);
    }
    quiz.recordAnswer(event);
  }
  return quiz.report();
}

module.exports = { createQuiz, replayQuiz };
