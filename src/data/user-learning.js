const STORAGE_KEY = 'zypher_learning_state';

const DEFAULT_STATE = {
  words: [],
  sessions: [],
};

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const normalizeArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

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
    nextReviewLabel: extra.nextReviewLabel || 'bugün',
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

  const weakWords = [...normalizedWords]
    .sort((a, b) => (a.mastery - b.mastery) || (b.mistakes.length - a.mistakes.length))
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

export function updateWordMastery(word, session) {
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
  let nextReviewLabel = 'yarın';
  if (mastery >= 58) nextReviewLabel = '7 gün sonra';
  else if (mastery >= 45) nextReviewLabel = '3 gün sonra';

  return {
    ...word,
    mastery,
    attempts: (word.attempts || 0) + 1,
    successes: (word.successes || 0) + (used && score >= 2 ? 1 : 0),
    mistakes: [...new Set([...normalizeArray(word.mistakes), ...normalizeArray(session.mistakes)])].slice(-6),
    lastScore: score,
    nextReviewLabel,
    updatedAt: new Date().toISOString(),
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
  };
  return saveLearningState(nextState, storage);
}

export function getLearningDashboard(storage = globalThis.localStorage) {
  const state = loadLearningState(storage);
  const snapshot = createLearnerSnapshot(state.words, state.sessions);
  const plan = buildPracticePlan(snapshot);
  return { state, snapshot, plan };
}
