import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createLearnerSnapshot,
  buildPracticePlan,
  updateWordMastery,
  createSessionRecord,
  buildReadingExercise,
  buildWritingExercise,
  recordSkillPractice,
} from '../src/data/user-learning.js';

test('buildPracticePlan keeps the app simple with speaking, reading, and writing tasks', () => {
  const snapshot = createLearnerSnapshot([
    { term: 'although', mastery: 35, mistakes: ['word order'], lastScore: 1 },
  ]);

  const plan = buildPracticePlan(snapshot);

  assert.equal(plan.level, 'A2');
  assert.deepEqual(plan.focusWords, ['although']);
  assert.equal(plan.tasks.length, 3);
  assert.deepEqual(plan.tasks.map((task) => task.type), ['speaking', 'reading', 'writing']);
  assert.match(plan.tasks[0].title, /Speaking/i);
});

test('updateWordMastery raises mastery when a word is used well', () => {
  const updated = updateWordMastery(
    { term: 'although', mastery: 40, attempts: 1, successes: 0, mistakes: [] },
    { score: 3, usedTargetWords: ['although'], missedTargetWords: [], mistakes: [] }
  );

  assert.equal(updated.mastery, 58);
  assert.equal(updated.attempts, 2);
  assert.equal(updated.successes, 1);
  assert.equal(updated.nextReviewLabel, '7 gün sonra');
});

test('updateWordMastery lowers/keeps mastery when the target word is missed and schedules soon', () => {
  const updated = updateWordMastery(
    { term: 'although', mastery: 40, attempts: 1, successes: 0, mistakes: [] },
    { score: 1, usedTargetWords: [], missedTargetWords: ['although'], mistakes: ['forgot connector'] }
  );

  assert.equal(updated.mastery, 30);
  assert.equal(updated.nextReviewLabel, 'yarın');
  assert.deepEqual(updated.mistakes, ['forgot connector']);
});

test('createSessionRecord normalizes Gemini tool output for the summary and roadmap', () => {
  const record = createSessionRecord({
    score: 2,
    feedback_pointers: ['Good effort'],
    used_target_words: ['although'],
    missed_target_words: ['however'],
    mistakes: ['tense'],
    next_practice: ['Write 3 sentences'],
    level_estimate: 'B1',
  });

  assert.equal(record.score, 2);
  assert.equal(record.levelEstimate, 'B1');
  assert.deepEqual(record.usedTargetWords, ['although']);
  assert.deepEqual(record.nextPractice, ['Write 3 sentences']);
  assert.ok(record.completedAt);
});

test('buildReadingExercise creates a short level-aware paragraph and comprehension question', () => {
  const exercise = buildReadingExercise(['although'], 'A2');

  assert.equal(exercise.type, 'reading');
  assert.match(exercise.paragraph, /although/i);
  assert.equal(exercise.questions.length, 2);
  assert.match(exercise.questions[0], /although/i);
});

test('buildWritingExercise asks for simple sentences using focus words', () => {
  const exercise = buildWritingExercise(['although', 'however'], 'A2');

  assert.equal(exercise.type, 'writing');
  assert.match(exercise.prompt, /although/i);
  assert.match(exercise.prompt, /however/i);
  assert.equal(exercise.minSentences, 3);
});

test('recordSkillPractice stores reading and writing attempts without changing app complexity', () => {
  const storage = new Map();
  const fakeStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  };

  const nextState = recordSkillPractice({
    type: 'writing',
    focusWords: ['although'],
    response: 'Although it was late, I studied English.',
  }, fakeStorage);

  assert.equal(nextState.skillPractice.length, 1);
  assert.equal(nextState.skillPractice[0].type, 'writing');
  assert.deepEqual(nextState.skillPractice[0].focusWords, ['although']);
});
