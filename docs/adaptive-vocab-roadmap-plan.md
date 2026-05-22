# Zypher Adaptive Vocabulary Roadmap Plan

Goal: turn the existing live roleplay language app into a voice-first adaptive English learning product where users can add vocabulary, practice it in live scenarios, and receive a changing roadmap based on mistakes.

## Current foundation

- Frontend: Vite + vanilla JavaScript web components.
- Backend: FastAPI + Gemini Live API over WebSocket.
- Existing strengths:
  - Real-time voice conversation.
  - Mission/roleplay selection.
  - Teacher and immersive modes.
  - Gemini Live tool call support through `complete_mission`.
  - Input/output transcription support in teacher mode.

## MVP product direction

Working title: Zypher

Core promise: “Learn a word by actually using it in live conversations. Zypher adapts your next practice based on your mistakes.”

## Phase 1: Local-first vocabulary and adaptive summary

### 1. Add vocabulary capture

Files:
- Create: `src/data/user-vocabulary.js`
- Modify: `src/components/view-missions.js`
- Modify: `src/components/view-chat.js`

Behavior:
- User can add a target word or phrase before starting a mission.
- Store words in `localStorage` for MVP.
- Pass selected target words into the mission prompt.

Data shape:

```js
{
  id: crypto.randomUUID(),
  term: "commitment",
  meaning: "bağlılık / taahhüt",
  targetLanguage: "English",
  nativeLanguage: "Turkish",
  createdAt: new Date().toISOString(),
  mastery: 0,
  mistakes: []
}
```

### 2. Make Gemini evaluate vocabulary usage

Modify the existing `complete_mission` tool schema in `src/components/view-chat.js`.

Add fields:
- `used_target_words`: array of strings
- `missed_target_words`: array of strings
- `mistakes`: array of objects `{ type, original, correction, explanation }`
- `next_practice`: array of strings

The model should call this tool when the mission ends and return structured feedback.

### 3. Improve system prompt

Inject target vocabulary into both Teacher Mode and Immersive Mode prompts.

Rules:
- Encourage the learner to use the selected words naturally.
- Do not over-correct during live flow.
- At mission completion, evaluate whether the words were used correctly.
- Produce next-practice tasks based on repeated mistakes.

### 4. Add adaptive summary UI

Modify `src/components/view-summary.js`.

Show:
- Words used correctly.
- Words missed.
- Mistakes and corrections.
- Recommended next practice.
- Updated mastery score.

## Phase 2: Roadmap screen

Create a new screen:
- `src/components/view-roadmap.js`

Roadmap sections:
- Today: active speaking task.
- Tomorrow: recall + sentence production.
- 3 days later: roleplay with same vocabulary.
- 7 days later: review mission.

For MVP, compute roadmap client-side from localStorage:
- More mistakes => more frequent review.
- Correct use => increase mastery.
- Missed word => add a short target exercise.

## Phase 3: Backend persistence

Add simple backend storage after local MVP works.

Options:
1. SQLite in FastAPI for quick self-hosted MVP.
2. Supabase for product/SaaS path.

Recommended next step: SQLite first, Supabase later.

Entities:
- users
- vocabulary_items
- practice_sessions
- mistakes
- roadmap_tasks

## Phase 4: Product polish

- Turkish-native onboarding.
- English learning defaults.
- Daily streaks.
- Mission generation from a word.
- Analytics dashboard.
- Optional account/login.

## First implementation branch

Branch: `feat/adaptive-vocab-roadmap`

Initial deliverable:
- LocalStorage vocabulary module.
- Target word input on mission selection.
- Prompt injection.
- Extended mission completion tool.
- Summary UI showing mistakes and next practice.

## Verification

Run:

```bash
npm install
npm run build
```

Expected:
- Vite build succeeds.
- No syntax errors.

Manual check:
- Start app.
- Add target word.
- Start Teacher Mode.
- Confirm prompt includes the target word.
- End mission.
- Summary displays structured vocabulary feedback.
