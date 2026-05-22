# Zypher Adaptive Vocabulary Roadmap Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Transform Zypher from a live roleplay demo into a voice-first English learning app where Turkish-speaking users add vocabulary, practice it in live AI conversations, and receive an adaptive roadmap based on mistakes.

**Architecture:** Keep the current Vite + vanilla Web Components frontend and FastAPI + Gemini Live backend. Build the MVP local-first using `localStorage` so the product can be tested without auth/database setup, then add backend persistence in a later phase. Extend the existing Gemini Live tool-call flow (`complete_mission`) instead of introducing a second LLM pipeline.

**Tech Stack:** Vite, vanilla JavaScript Web Components, FastAPI, Gemini Live API, WebSocket audio streaming, browser `localStorage`, later SQLite/Supabase.

---

## Product decision defaults

No further clarification is needed before implementation. Use these defaults:

- Product name: **Zypher**.
- Learner native language: **Turkish**.
- Target language: **English**.
- MVP storage: **browser localStorage**.
- MVP persona: keep existing mission personas, but add vocabulary objectives.
- MVP mode priority: **Teacher Mode first**, then Immersive Mode.
- Auth/database: skip for MVP; add later.
- Merge policy: never push to `main`; use feature branches and PRs only.

## Existing foundation

Repository: `serhatgpt/zypher`, forked from `ZackAkil/immersive-language-learning-with-live-api`.

Important files:

- `src/components/app-root.js` — top-level view routing/state.
- `src/components/view-splash.js` — initial language/mode setup.
- `src/components/view-missions.js` — mission list screen.
- `src/components/view-chat.js` — Gemini Live session, prompt construction, audio, tool calls.
- `src/components/view-summary.js` — post-mission result screen.
- `src/components/live-transcript.js` — transcript UI in Teacher Mode.
- `src/data/missions.json` — static mission definitions.
- `src/lib/gemini-live/geminilive.js` — WebSocket client, setup message, tools/function declarations.
- `server/main.py` — FastAPI app, auth endpoint, WebSocket endpoint.
- `server/gemini_live.py` — server-side Gemini Live bridge.

Current strengths:

- Real-time voice conversation already works.
- Gemini Live audio streaming is already wired.
- Teacher Mode and Immersive Mode prompts already exist.
- Existing tool-call path calls `complete_mission` and navigates to summary.
- Teacher Mode can enable input/output transcription.

Current constraints:

- Frontend is not Next.js; it is Vite + vanilla JS. Do not migrate in MVP.
- No persistent user accounts yet.
- No database yet.
- Tool call result is currently small: score + feedback only.

---

## MVP acceptance criteria

The first complete MVP is done when:

1. User can add one or more target English words/phrases before starting a mission.
2. Selected vocabulary appears in the chat screen before the mission starts.
3. Gemini prompt includes target vocabulary and asks the AI to guide the user to use it naturally.
4. `complete_mission` returns structured vocabulary feedback:
   - used target words
   - missed target words
   - mistakes
   - next practice tasks
   - mastery delta
5. Summary screen displays the structured feedback cleanly.
6. Vocabulary progress is saved in `localStorage`.
7. A Roadmap screen shows Today / Tomorrow / 3 Days / 7 Days tasks computed from saved progress.
8. `npm run build` passes.
9. All changes are in feature branches and PRs; `main` is never pushed directly.

---

## Data model for local MVP

Create `src/data/user-vocabulary.js` with these localStorage keys:

```js
const STORAGE_KEYS = {
  vocabulary: "zypher:vocabulary",
  sessions: "zypher:practiceSessions",
  roadmap: "zypher:roadmapTasks",
};
```

Vocabulary item shape:

```js
{
  id: "uuid",
  term: "commitment",
  meaning: "bağlılık / taahhüt",
  targetLanguage: "English",
  nativeLanguage: "Turkish",
  createdAt: "2026-05-22T...Z",
  updatedAt: "2026-05-22T...Z",
  mastery: 0,
  attempts: 0,
  correctUses: 0,
  missedUses: 0,
  mistakes: [
    {
      type: "grammar",
      original: "I am commitment to this",
      correction: "I am committed to this",
      explanation: "Use adjective 'committed', not noun 'commitment', after 'am'.",
      createdAt: "2026-05-22T...Z"
    }
  ]
}
```

Practice session shape:

```js
{
  id: "uuid",
  missionId: 5,
  missionTitle: "Order a Coffee",
  mode: "immergo_teacher",
  targetWords: ["commitment", "receipt"],
  result: {
    score: 2,
    level: "Proficiens",
    used_target_words: ["receipt"],
    missed_target_words: ["commitment"],
    mistakes: [],
    next_practice: []
  },
  createdAt: "2026-05-22T...Z"
}
```

Roadmap task shape:

```js
{
  id: "uuid",
  title: "Use commitment in 3 spoken sentences",
  dueLabel: "Today",
  dueOffsetDays: 0,
  targetWords: ["commitment"],
  type: "speaking",
  reason: "Missed in last mission",
  completed: false,
  createdAt: "2026-05-22T...Z"
}
```

Mastery scoring:

- Start at `0`.
- Correctly used target word: `+15`.
- Missed target word: `-5`.
- Grammar mistake involving word: `-10`.
- Clamp score between `0` and `100`.
- Mastery label:
  - `0-29`: New
  - `30-59`: Practicing
  - `60-84`: Strong
  - `85-100`: Mastered

---

# Phase 1 — Local vocabulary storage

### Task 1: Create localStorage vocabulary module

**Objective:** Add reusable functions for vocabulary, sessions, and roadmap storage.

**Files:**
- Create: `src/data/user-vocabulary.js`

**Implementation:**

Create these exports:

```js
export function getVocabularyItems() {}
export function saveVocabularyItems(items) {}
export function addVocabularyItem({ term, meaning, targetLanguage, nativeLanguage }) {}
export function updateVocabularyItem(id, patch) {}
export function removeVocabularyItem(id) {}
export function getPracticeSessions() {}
export function addPracticeSession(session) {}
export function applyMissionResultToVocabulary({ mission, mode, targetWords, result }) {}
export function buildRoadmapTasks(vocabularyItems, sessions) {}
export function getMasteryLabel(score) {}
```

Implementation rules:

- Use `crypto.randomUUID()` when available.
- Fallback to `Date.now().toString(36)` when not available.
- Guard all JSON parsing with try/catch.
- Return empty arrays when storage is corrupted.
- Never throw from storage helpers during UI flows.

**Verification:**

Run:

```bash
npm run build
```

Expected: build passes.

**Commit:**

```bash
git add src/data/user-vocabulary.js
git commit -m "feat: add local vocabulary storage"
```

---

### Task 2: Add lightweight tests for storage helpers

**Objective:** Verify localStorage parsing, add/update behavior, and mastery labels.

**Files:**
- Modify: `package.json`
- Create: `src/data/user-vocabulary.test.js`

**Implementation:**

Add Vitest:

```bash
npm install -D vitest jsdom
```

Add script to `package.json`:

```json
"test": "vitest run"
```

Tests:

- `getVocabularyItems()` returns `[]` when storage is empty.
- `addVocabularyItem()` trims term and saves it.
- `getVocabularyItems()` returns `[]` when localStorage contains invalid JSON.
- `getMasteryLabel(0)` returns `New`.
- `getMasteryLabel(50)` returns `Practicing`.
- `getMasteryLabel(75)` returns `Strong`.
- `getMasteryLabel(95)` returns `Mastered`.

**Verification:**

Run:

```bash
npm test
npm run build
```

Expected: tests and build pass.

**Commit:**

```bash
git add package.json package-lock.json src/data/user-vocabulary.test.js
git commit -m "test: cover vocabulary storage helpers"
```

---

# Phase 2 — Vocabulary input in mission flow

### Task 3: Inspect app-root mission navigation state

**Objective:** Confirm how selected mission, language, native language, and mode are passed between screens.

**Files:**
- Read: `src/components/app-root.js`
- Read: `src/components/view-missions.js`
- Read: `src/components/view-chat.js`

**Implementation:**

No code change unless needed. Document the state flow in a short comment inside `docs/adaptive-vocab-roadmap-plan.md` only if the actual code differs from this plan.

**Verification:**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

**Commit:**

Only commit if documentation was updated.

---

### Task 4: Add target vocabulary input to mission selection

**Objective:** Let the user add target words before starting a mission.

**Files:**
- Modify: `src/components/view-missions.js`
- Modify: `src/style.css` if shared styles are cleaner than inline styles

**UI behavior:**

Add a compact panel above the mission cards:

- Title: `Practice target words`
- Helper: `Add words you want to use in the conversation.`
- Input placeholder: `e.g. commitment, receipt, negotiate`
- Optional meaning input placeholder: `Turkish meaning (optional)`
- Button: `Add word`
- Show selected words as removable chips.

Default language values:

- `targetLanguage`: current selected language or `English`.
- `nativeLanguage`: current from-language or `Turkish`.

**Implementation:**

Use `addVocabularyItem()` and `getVocabularyItems()` from `src/data/user-vocabulary.js`.

The selected words for the current mission should be stored in component state as an array of vocabulary item objects. When a mission is clicked, include them in the navigation event detail:

```js
this.dispatchEvent(new CustomEvent("navigate", {
  bubbles: true,
  detail: {
    view: "chat",
    mission,
    targetWords: this.selectedVocabularyItems
  }
}));
```

**Verification:**

Run:

```bash
npm run build
```

Manual:

- Add `commitment`.
- See chip appear.
- Remove chip.
- Add it again.
- Click a mission.

Expected: no console errors.

**Commit:**

```bash
git add src/components/view-missions.js src/style.css src/data/user-vocabulary.js
git commit -m "feat: add target vocabulary selection"
```

---

### Task 5: Pass target vocabulary through app-root

**Objective:** Ensure selected vocabulary reaches `view-chat`.

**Files:**
- Modify: `src/components/app-root.js`
- Modify: `src/components/view-chat.js`

**Implementation:**

In app root, store `targetWords` from navigation detail.

When rendering chat, set:

```js
chat.targetWords = this._targetWords || [];
```

In `ViewChat`, add:

```js
set targetWords(value) {
  this._targetWords = Array.isArray(value) ? value : [];
}
```

**Verification:**

Temporarily log target words in `view-chat.js`, verify manually, then remove the log before commit.

Run:

```bash
npm run build
```

Expected: build passes.

**Commit:**

```bash
git add src/components/app-root.js src/components/view-chat.js
git commit -m "feat: pass target vocabulary into chat"
```

---

# Phase 3 — Prompt injection and tool schema

### Task 6: Show target vocabulary on chat screen

**Objective:** Make the selected words visible before the user starts speaking.

**Files:**
- Modify: `src/components/view-chat.js`

**UI behavior:**

Under mission description, show:

- `Target words:` label
- Chips for selected terms
- If no terms selected, show `No target words selected. Practice freely.`

**Verification:**

Run:

```bash
npm run build
```

Manual:

- Select target words.
- Open mission.
- Confirm chips are visible.

**Commit:**

```bash
git add src/components/view-chat.js
git commit -m "feat: display target words in live mission"
```

---

### Task 7: Inject vocabulary objectives into Gemini prompt

**Objective:** Instruct Gemini to guide and evaluate selected vocabulary usage.

**Files:**
- Modify: `src/components/view-chat.js`

**Implementation:**

Before system prompt construction, add:

```js
const targetVocabulary = (this._targetWords || [])
  .map((item) => `- ${item.term}${item.meaning ? ` (${item.meaning})` : ""}`)
  .join("\n");

const vocabularyInstruction = targetVocabulary
  ? `
TARGET VOCABULARY:
The learner wants to practice these English words/phrases:
${targetVocabulary}

VOCABULARY COACHING RULES:
1. Create natural opportunities for the learner to use these words.
2. Do not force every word into every sentence.
3. If the learner uses a word incorrectly, keep the conversation flowing, then give a short correction in ${fromLanguage}.
4. At mission completion, evaluate which target words were used correctly, missed, or used with mistakes.
`
  : "";
```

Then include `${vocabularyInstruction}` inside both Teacher Mode and Immersive Mode prompts before `MISSION COMPLETION`.

**Verification:**

Run:

```bash
npm run build
```

Manual:

- Start mission with a word.
- Use browser devtools/logging or code inspection to confirm prompt includes `TARGET VOCABULARY`.

**Commit:**

```bash
git add src/components/view-chat.js
git commit -m "feat: inject vocabulary goals into live prompt"
```

---

### Task 8: Extend complete_mission tool schema

**Objective:** Collect structured adaptive learning feedback from Gemini.

**Files:**
- Modify: `src/components/view-chat.js`

**Implementation:**

Extend `completeMissionTool` parameters with:

```js
used_target_words: {
  type: "ARRAY",
  items: { type: "STRING" },
  description: "Target words the learner used correctly."
},
missed_target_words: {
  type: "ARRAY",
  items: { type: "STRING" },
  description: "Target words the learner did not use or avoided."
},
mistakes: {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      type: { type: "STRING" },
      original: { type: "STRING" },
      correction: { type: "STRING" },
      explanation: { type: "STRING" }
    }
  },
  description: "Specific mistakes, corrections, and explanations."
},
next_practice: {
  type: "ARRAY",
  items: { type: "STRING" },
  description: "Recommended next practice tasks in the learner's native language."
},
mastery_delta: {
  type: "INTEGER",
  description: "Suggested mastery change from -20 to +20 based on this session."
}
```

Keep only `score` and `feedback_pointers` as required for backwards compatibility. Normalize missing arrays to `[]` when constructing `result`.

**Verification:**

Run:

```bash
npm run build
```

Expected: build passes.

**Commit:**

```bash
git add src/components/view-chat.js
git commit -m "feat: extend mission completion feedback schema"
```

---

# Phase 4 — Persist session results and adaptive summary

### Task 9: Save mission result to localStorage

**Objective:** Persist practice session feedback and update vocabulary mastery.

**Files:**
- Modify: `src/components/view-chat.js`
- Modify: `src/data/user-vocabulary.js`

**Implementation:**

Inside `completeMissionTool.functionToCall`, after `result` is built and before navigation:

```js
const adaptiveResult = applyMissionResultToVocabulary({
  mission: this._mission,
  mode: this._mode,
  targetWords: this._targetWords || [],
  result,
});

result.updatedVocabulary = adaptiveResult.updatedVocabulary;
result.roadmapTasks = adaptiveResult.roadmapTasks;
```

`applyMissionResultToVocabulary()` should:

- Add a practice session.
- Increase attempts for selected vocabulary.
- Increase correctUses for used words.
- Increase missedUses for missed words.
- Append mistake objects to related vocabulary where possible.
- Update mastery with scoring rules.
- Generate roadmap tasks.
- Return updated vocabulary and roadmap tasks.

**Verification:**

Run:

```bash
npm test
npm run build
```

Manual:

- Complete a mission.
- Inspect localStorage keys.
- Confirm practice session saved.

**Commit:**

```bash
git add src/components/view-chat.js src/data/user-vocabulary.js src/data/user-vocabulary.test.js
git commit -m "feat: persist adaptive mission results"
```

---

### Task 10: Update summary screen for adaptive feedback

**Objective:** Show vocabulary learning feedback after each mission.

**Files:**
- Modify: `src/components/view-summary.js`

**UI sections:**

1. Score / existing level.
2. `Words used well`.
3. `Words to practice again`.
4. `Corrections`.
5. `Next practice plan`.
6. Button: `Back to missions`.
7. Button: `View roadmap`.

**Implementation:**

Handle missing fields gracefully:

```js
const used = result.used_target_words || [];
const missed = result.missed_target_words || [];
const mistakes = result.mistakes || [];
const nextPractice = result.next_practice || [];
```

If arrays are empty, show friendly empty states.

**Verification:**

Run:

```bash
npm run build
```

Manual:

- Complete mission with mocked result if live API is unavailable.
- Confirm summary renders without crashing.

**Commit:**

```bash
git add src/components/view-summary.js
git commit -m "feat: show adaptive vocabulary summary"
```

---

# Phase 5 — Roadmap screen

### Task 11: Create roadmap view component

**Objective:** Add a screen showing upcoming practice tasks.

**Files:**
- Create: `src/components/view-roadmap.js`
- Modify: `src/components/app-root.js`
- Modify: `src/components/view-summary.js`
- Modify: `src/main.js` if component imports are centralized there

**UI behavior:**

Roadmap columns/sections:

- Today
- Tomorrow
- In 3 days
- In 7 days

Each task card shows:

- title
- target words
- task type
- reason
- completion checkbox

**Implementation:**

Use `buildRoadmapTasks()` and saved roadmap tasks from `src/data/user-vocabulary.js`.

Navigation:

- Summary button dispatches `navigate` with `{ view: "roadmap" }`.
- Roadmap has `Back to missions` button.

**Verification:**

Run:

```bash
npm run build
```

Manual:

- Complete a mission.
- Click `View roadmap`.
- Confirm tasks appear.

**Commit:**

```bash
git add src/components/view-roadmap.js src/components/app-root.js src/components/view-summary.js src/main.js
git commit -m "feat: add adaptive roadmap view"
```

---

### Task 12: Add mission generation from target word

**Objective:** Let a vocabulary word create a focused speaking mission.

**Files:**
- Modify: `src/components/view-missions.js`
- Modify: `src/data/missions.json` only if adding static templates

**MVP behavior:**

When user adds a word, show a button:

`Practice this word now`

Clicking it creates a dynamic mission object:

```js
{
  id: `vocab-${item.id}`,
  title: `Use "${item.term}" in conversation`,
  difficulty: "Adaptive",
  desc: `Have a short conversation where you naturally use "${item.term}" at least twice.`,
  target_role: "Friendly English Coach",
  generated: true
}
```

Then navigate to chat with this mission and that target word selected.

**Verification:**

Run:

```bash
npm run build
```

Manual:

- Add `commitment`.
- Click `Practice this word now`.
- Chat screen opens with generated mission.

**Commit:**

```bash
git add src/components/view-missions.js
git commit -m "feat: generate speaking missions from vocabulary"
```

---

# Phase 6 — Polish and safety

### Task 13: Turkish-first copy pass

**Objective:** Make the MVP clearer for Turkish-speaking learners.

**Files:**
- Modify: `src/components/view-missions.js`
- Modify: `src/components/view-chat.js`
- Modify: `src/components/view-summary.js`
- Modify: `src/components/view-roadmap.js`

**Copy defaults:**

- `Practice target words` → `Pratik yapmak istediğin kelimeler`
- `Add word` → `Kelime ekle`
- `Target words` → `Hedef kelimeler`
- `Words used well` → `İyi kullandığın kelimeler`
- `Words to practice again` → `Tekrar çalışman gereken kelimeler`
- `Next practice plan` → `Sıradaki pratik planı`
- `View roadmap` → `Yol haritasını gör`

Keep language-learning content bilingual where useful.

**Verification:**

Run:

```bash
npm run build
```

Manual: inspect screens for obvious copy/layout issues.

**Commit:**

```bash
git add src/components/*.js
git commit -m "feat: localize adaptive learning UI for Turkish learners"
```

---

### Task 14: Add error-proofing and empty states

**Objective:** Prevent crashes when Gemini returns partial tool-call data.

**Files:**
- Modify: `src/components/view-chat.js`
- Modify: `src/components/view-summary.js`
- Modify: `src/data/user-vocabulary.js`

**Rules:**

- Missing arrays become `[]`.
- Missing strings become `""`.
- Invalid mastery delta becomes `0`.
- localStorage failures are caught.
- Summary works even when no target words were selected.

**Verification:**

Run:

```bash
npm test
npm run build
```

Expected: tests and build pass.

**Commit:**

```bash
git add src/components/view-chat.js src/components/view-summary.js src/data/user-vocabulary.js src/data/user-vocabulary.test.js
git commit -m "fix: harden adaptive feedback handling"
```

---

# Phase 7 — PR and review

### Task 15: Open implementation PR

**Objective:** Push implementation branch and open PR.

**Branch:**

```bash
git checkout -b feat/adaptive-vocab-mvp
```

**Verification before push:**

```bash
npm test
npm run build
git status --short
```

**Push:**

```bash
git push -u origin feat/adaptive-vocab-mvp
```

**PR title:**

```text
feat: add adaptive vocabulary roadmap MVP
```

**PR body:**

```md
## Summary
- Adds local vocabulary storage and target word selection.
- Injects vocabulary goals into Gemini Live missions.
- Extends mission completion feedback for mistakes and next practice.
- Saves adaptive progress locally and adds roadmap UI.

## Test Plan
- npm test
- npm run build
- Manual: add target word → start mission → complete mission → view adaptive summary → view roadmap
```

---

# Phase 8 — Post-MVP backend persistence

Do this only after the local MVP works.

### Task 16: Add SQLite persistence

**Objective:** Persist vocabulary and sessions server-side without Supabase complexity.

**Files:**
- Create: `server/storage.py`
- Modify: `server/main.py`
- Create: `server/tests/test_storage.py` if pytest is added

**Tables:**

- `vocabulary_items`
- `practice_sessions`
- `mistakes`
- `roadmap_tasks`

**Endpoints:**

- `GET /api/vocabulary`
- `POST /api/vocabulary`
- `PATCH /api/vocabulary/{id}`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/roadmap`

**Keep localStorage fallback** if backend is unavailable.

---

# Phase 9 — Later product ideas

Do not implement before MVP:

- User accounts.
- Supabase migration.
- Stripe/payment.
- Daily streaks.
- Admin dashboard.
- AI-generated full curriculum.
- Mobile app.
- Next.js migration.

---

## Final verification checklist

Before marking MVP complete:

```bash
npm test
npm run build
```

Manual checklist:

- Add target word.
- Start Teacher Mode mission.
- Confirm target word appears in chat screen.
- Complete mission.
- Summary shows used/missed words, mistakes, and next practice.
- Roadmap screen shows tasks.
- Refresh page.
- Vocabulary progress persists.

## Implementation order summary

1. `src/data/user-vocabulary.js`
2. Storage tests
3. Mission vocabulary input
4. App-root state plumbing
5. Chat vocabulary display
6. Prompt injection
7. Extended `complete_mission` schema
8. Persist adaptive results
9. Summary UI
10. Roadmap UI
11. Generated vocabulary mission
12. Turkish copy pass
13. Hardening
14. PR
