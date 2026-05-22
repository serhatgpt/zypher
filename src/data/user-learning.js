const STORAGE_KEY = 'zypher_learning_state';

const DEFAULT_STATE = {
  words: [],
  sessions: [],
  skillPractice: [],
};

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const normalizeArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

function normalizeDate(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatReviewLabel(date, now = new Date()) {
  const due = normalizeDate(date);
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startOfDue = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const diffDays = Math.round((startOfDue - startOfToday) / 86400000);
  if (diffDays <= 0) return 'bugün';
  if (diffDays === 1) return 'yarın';
  return due.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function calculateReviewIntervalDays(mastery, score, used, missed) {
  if (missed || score <= 1) return 1;
  if (mastery >= 75 && score >= 3 && used) return 7;
  if ((mastery >= 45 && score >= 2 && used) || (score >= 4 && used)) return 3;
  return 1;
}

export function getDueWords(words = [], now = new Date()) {
  return normalizeArray(words)
    .filter((word) => normalizeDate(word.nextReviewAt || word.next_review_at, now) <= now)
    .sort((a, b) => {
      const aDate = normalizeDate(a.nextReviewAt || a.next_review_at, now).getTime();
      const bDate = normalizeDate(b.nextReviewAt || b.next_review_at, now).getTime();
      return (aDate - bDate) || ((a.mastery || a.mastery_score || 0) - (b.mastery || b.mastery_score || 0));
    });
}

export function createWord(term, extra = {}) {
  const cleanTerm = String(term || '').trim();
  return {
    id: extra.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    term: cleanTerm,
    note: extra.note || '',
    mastery: Number.isFinite(extra.mastery) ? clamp(extra.mastery) : 25,
    attempts: extra.attempts || 0,
    successes: extra.successes || 0,
    mistakes: normalizeArray(extra.mistakes),
    lastScore: extra.lastScore || 0,
    reviewIntervalDays: Number.isFinite(extra.reviewIntervalDays) ? extra.reviewIntervalDays : 0,
    nextReviewAt: extra.nextReviewAt || new Date().toISOString(),
    nextReviewLabel: extra.nextReviewLabel || formatReviewLabel(extra.nextReviewAt || new Date()),
    isDue: Boolean(extra.isDue ?? (normalizeDate(extra.nextReviewAt) <= new Date())),
    createdAt: extra.createdAt || new Date().toISOString(),
    updatedAt: extra.updatedAt || new Date().toISOString(),
  };
}

export function createLearnerSnapshot(words = [], sessions = []) {
  const normalizedWords = words
    .map((word) => typeof word === 'string' ? createWord(word) : createWord(word.term, word))
    .filter((word) => word.term);

  const averageMastery = normalizedWords.length
    ? Math.round(normalizedWords.reduce((sum, word) => sum + word.mastery, 0) / normalizedWords.length)
    : 25;

  const lastScore = sessions.length
    ? Number(sessions[sessions.length - 1].score || 0)
    : Math.round(normalizedWords.reduce((max, word) => Math.max(max, word.lastScore || 0), 0));

  let level = 'A1';
  if (averageMastery >= 75 && lastScore >= 3) level = 'B1';
  else if (averageMastery >= 35 || lastScore >= 2) level = 'A2';

  const dueWords = getDueWords(normalizedWords);
  const weakWords = (dueWords.length ? dueWords : [...normalizedWords])
    .sort((a, b) => {
      if (dueWords.length) {
        return normalizeDate(a.nextReviewAt).getTime() - normalizeDate(b.nextReviewAt).getTime();
      }
      return (a.mastery - b.mastery) || (b.mistakes.length - a.mistakes.length);
    })
    .slice(0, 3);

  return {
    level,
    averageMastery,
    words: normalizedWords,
    weakWords,
  };
}

export function buildPracticePlan(snapshot) {
  const focusWords = snapshot.weakWords.length
    ? snapshot.weakWords.map((word) => word.term)
    : ['daily English'];
  const primary = focusWords[0];
  const level = snapshot.level || 'A1';

  return {
    level,
    focusWords,
    tasks: [
      {
        type: 'speaking',
        title: `Speaking: use “${primary}” in a short conversation`,
        description: '2-4 dakikalık canlı roleplay. Amaç kelimeyi doğal cümlede kullanmak.',
      },
      {
        type: 'reading',
        title: `Reading: notice “${primary}” in context`,
        description: 'Kısa bir paragraf oku, kelimenin cümledeki görevini yakala.',
      },
      {
        type: 'writing',
        title: `Writing: write 3 simple sentences with “${primary}”`,
        description: '3 cümle yaz. AI yanlışlarını roadmap’e geri işler.',
      },
    ],
  };
}

export function buildReadingExercise(focusWords = ['daily English'], level = 'A1') {
  const words = normalizeArray(focusWords).length ? normalizeArray(focusWords) : ['daily English'];
  const primary = words[0];
  const second = words[1] || 'because';
  const paragraphByLevel = {
    A1: `I study English every day. I try to use ${primary} in one simple sentence. This helps me remember it.`,
    A2: `I wanted to speak more naturally, although I still made small mistakes. I practiced ${primary} in a short conversation and used ${second} to connect my ideas.`,
    B1: `Although learning English can feel slow, consistent practice makes progress visible. When I use ${primary} in speaking, reading, and writing, I remember it more easily.`,
  };

  return {
    type: 'reading',
    level,
    focusWords: words,
    paragraph: paragraphByLevel[level] || paragraphByLevel.A2,
    questions: [
      `What does “${primary}” do in this paragraph?`,
      'Write one similar sentence about your own life.',
    ],
  };
}

export function buildWritingExercise(focusWords = ['daily English'], level = 'A1') {
  const words = normalizeArray(focusWords).length ? normalizeArray(focusWords) : ['daily English'];
  const minSentences = level === 'A1' ? 2 : 3;

  return {
    type: 'writing',
    level,
    focusWords: words,
    minSentences,
    prompt: `${words.join(', ')} kelimelerini kullanarak en az ${minSentences} kısa İngilizce cümle yaz. Basit, doğal ve kendi hayatından olsun.`,
  };
}

export function updateWordMastery(word, session, now = new Date()) {
  const term = word.term;
  const used = normalizeArray(session.usedTargetWords).some((item) => item.toLowerCase() === term.toLowerCase());
  const missed = normalizeArray(session.missedTargetWords).some((item) => item.toLowerCase() === term.toLowerCase());
  const score = Number(session.score || 0);

  let delta = 0;
  if (used) delta += 8;
  if (score >= 3) delta += 10;
  if (score === 2) delta += 4;
  if (score <= 1) delta -= 5;
  if (missed) delta -= 5;

  const mastery = clamp((word.mastery || 25) + delta);
  const reviewIntervalDays = calculateReviewIntervalDays(mastery, score, used, missed);
  const nextReviewAt = addDays(now, reviewIntervalDays).toISOString();

  return {
    ...word,
    mastery,
    attempts: (word.attempts || 0) + 1,
    successes: (word.successes || 0) + (used && score >= 2 ? 1 : 0),
    mistakes: [...new Set([...normalizeArray(word.mistakes), ...normalizeArray(session.mistakes)])].slice(-6),
    lastScore: score,
    reviewIntervalDays,
    nextReviewAt,
    nextReviewLabel: formatReviewLabel(nextReviewAt, now),
    isDue: false,
    updatedAt: now.toISOString(),
  };
}

export function createSessionRecord(args = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    completedAt: new Date().toISOString(),
    score: Number(args.score || 0),
    notes: normalizeArray(args.feedback_pointers || args.notes),
    usedTargetWords: normalizeArray(args.used_target_words || args.usedTargetWords),
    missedTargetWords: normalizeArray(args.missed_target_words || args.missedTargetWords),
    mistakes: normalizeArray(args.mistakes),
    nextPractice: normalizeArray(args.next_practice || args.nextPractice),
    levelEstimate: args.level_estimate || args.levelEstimate || 'A2',
  };
}

export function loadLearningState(storage = globalThis.localStorage) {
  if (!storage) return { ...DEFAULT_STATE };
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    return {
      words: normalizeArray(parsed?.words),
      sessions: normalizeArray(parsed?.sessions),
      skillPractice: normalizeArray(parsed?.skillPractice),
    };
  } catch (error) {
    console.warn('Failed to load learning state', error);
    return { ...DEFAULT_STATE };
  }
}

export function saveLearningState(state, storage = globalThis.localStorage) {
  if (!storage) return state;
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

export function addWord(term, note = '', storage = globalThis.localStorage) {
  const state = loadLearningState(storage);
  const cleanTerm = String(term || '').trim();
  if (!cleanTerm) return state;

  const exists = state.words.some((word) => word.term.toLowerCase() === cleanTerm.toLowerCase());
  const nextState = exists
    ? state
    : { ...state, words: [createWord(cleanTerm, { note }), ...state.words] };

  return saveLearningState(nextState, storage);
}

export function recordCompletedSession(args, storage = globalThis.localStorage) {
  const state = loadLearningState(storage);
  const session = createSessionRecord(args);
  const nextWords = state.words.map((word) => updateWordMastery(word, session));
  const nextState = {
    words: nextWords,
    sessions: [...state.sessions, session].slice(-30),
    skillPractice: state.skillPractice,
  };
  return saveLearningState(nextState, storage);
}

export function recordSkillPractice(practice, storage = globalThis.localStorage) {
  const state = loadLearningState(storage);
  const record = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    completedAt: new Date().toISOString(),
    type: practice.type,
    focusWords: normalizeArray(practice.focusWords),
    response: String(practice.response || '').trim(),
  };
  const nextState = {
    ...state,
    skillPractice: [...state.skillPractice, record].slice(-30),
  };
  return saveLearningState(nextState, storage);
}

export function syncLearningStateFromDb(dbState = {}, storage = globalThis.localStorage) {
  const localState = loadLearningState(storage);
  const dbWords = normalizeArray(dbState.words).map((word) => createWord(word.term, {
    id: `db-${word.id}`,
    note: word.meaning_tr || word.note || '',
    mastery: word.mastery_score ?? word.mastery,
    mistakes: word.common_mistakes || word.mistakes || [],
    nextReviewAt: word.next_review_at || word.nextReviewAt,
    reviewIntervalDays: word.review_interval_days ?? word.reviewIntervalDays,
    nextReviewLabel: word.next_review_label || word.nextReviewLabel,
    isDue: word.is_due ?? word.isDue,
    createdAt: word.created_at || word.createdAt,
    updatedAt: word.updated_at || word.updatedAt,
  }));

  const mergedByTerm = new Map();
  [...localState.words, ...dbWords].forEach((word) => {
    if (!word.term) return;
    mergedByTerm.set(word.term.toLowerCase(), word);
  });

  return saveLearningState({
    ...localState,
    words: [...mergedByTerm.values()],
  }, storage);
}

export function getLearningDashboard(storage = globalThis.localStorage) {
  const state = loadLearningState(storage);
  const snapshot = createLearnerSnapshot(state.words, state.sessions);
  const plan = buildPracticePlan(snapshot);
  const readingExercise = buildReadingExercise(plan.focusWords, plan.level);
  const writingExercise = buildWritingExercise(plan.focusWords, plan.level);
  return { state, snapshot, plan, readingExercise, writingExercise };
}
