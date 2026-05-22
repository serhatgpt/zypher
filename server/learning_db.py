import datetime as dt
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from pathlib import Path
from typing import Any, Optional


DEFAULT_DB_PATH = os.getenv('ZYPHER_DB_PATH', 'data/zypher.sqlite3')


def _utcnow() -> str:
    return dt.datetime.now(dt.UTC).isoformat()


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _parse_json(value: str | None, default: Any = None) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def _hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 120_000)
    return salt, digest.hex()


class LearningDB:
    def __init__(self, path: str = DEFAULT_DB_PATH):
        self.path = path
        if path != ':memory:':
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.init_schema()

    def connect(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys = ON')
        return conn

    def init_schema(self):
        with self.connect() as conn:
            conn.executescript(
                '''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT NOT NULL UNIQUE,
                    password_salt TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS auth_tokens (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS words (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    term TEXT NOT NULL,
                    meaning_tr TEXT NOT NULL DEFAULT '',
                    examples_json TEXT NOT NULL DEFAULT '[]',
                    common_mistakes_json TEXT NOT NULL DEFAULT '[]',
                    mastery_score INTEGER NOT NULL DEFAULT 25,
                    next_review_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(user_id, term)
                );

                CREATE TABLE IF NOT EXISTS roadmap_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    word_id INTEGER REFERENCES words(id) ON DELETE CASCADE,
                    type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    due_label TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'open',
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS practice_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    type TEXT NOT NULL,
                    score INTEGER NOT NULL DEFAULT 0,
                    used_target_words_json TEXT NOT NULL DEFAULT '[]',
                    missed_target_words_json TEXT NOT NULL DEFAULT '[]',
                    mistakes_json TEXT NOT NULL DEFAULT '[]',
                    feedback_json TEXT NOT NULL DEFAULT '[]',
                    next_practice_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL
                );
                '''
            )

    def create_user(self, email: str, password: str) -> dict[str, Any]:
        clean_email = email.strip().lower()
        if not clean_email or '@' not in clean_email:
            raise ValueError('Valid email is required')
        if len(password) < 6:
            raise ValueError('Password must be at least 6 characters')
        salt, password_hash = _hash_password(password)
        now = _utcnow()
        with self.connect() as conn:
            cur = conn.execute(
                'INSERT INTO users(email, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?)',
                (clean_email, salt, password_hash, now),
            )
            return {'id': cur.lastrowid, 'email': clean_email, 'created_at': now}

    def verify_user(self, email: str, password: str) -> Optional[dict[str, Any]]:
        clean_email = email.strip().lower()
        with self.connect() as conn:
            row = conn.execute('SELECT * FROM users WHERE email = ?', (clean_email,)).fetchone()
            if not row:
                return None
            _, candidate = _hash_password(password, row['password_salt'])
            if not hmac.compare_digest(candidate, row['password_hash']):
                return None
            return {'id': row['id'], 'email': row['email'], 'created_at': row['created_at']}

    def create_session_token(self, user_id: int) -> str:
        token = secrets.token_urlsafe(32)
        with self.connect() as conn:
            conn.execute(
                'INSERT INTO auth_tokens(token, user_id, created_at) VALUES (?, ?, ?)',
                (token, user_id, _utcnow()),
            )
        return token

    def get_user_by_token(self, token: str) -> Optional[dict[str, Any]]:
        with self.connect() as conn:
            row = conn.execute(
                '''SELECT users.id, users.email, users.created_at
                   FROM auth_tokens
                   JOIN users ON users.id = auth_tokens.user_id
                   WHERE auth_tokens.token = ?''',
                (token,),
            ).fetchone()
            return dict(row) if row else None

    def create_word(self, user_id: int, term: str, plan: dict[str, Any]) -> dict[str, Any]:
        now = _utcnow()
        clean_term = term.strip()
        card = plan.get('learning_card', {})
        with self.connect() as conn:
            cur = conn.execute(
                '''INSERT INTO words(user_id, term, meaning_tr, examples_json, common_mistakes_json, mastery_score, next_review_at, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(user_id, term) DO UPDATE SET
                     meaning_tr=excluded.meaning_tr,
                     examples_json=excluded.examples_json,
                     common_mistakes_json=excluded.common_mistakes_json,
                     updated_at=excluded.updated_at
                   RETURNING *''',
                (
                    user_id,
                    clean_term,
                    card.get('meaning_tr', ''),
                    _json(card.get('examples', [])),
                    _json(card.get('common_mistakes', [])),
                    25,
                    'bugün',
                    now,
                    now,
                ),
            )
            word = dict(cur.fetchone())
            conn.execute('DELETE FROM roadmap_items WHERE user_id = ? AND word_id = ?', (user_id, word['id']))
            for item in plan.get('roadmap_items', []):
                conn.execute(
                    '''INSERT INTO roadmap_items(user_id, word_id, type, title, due_label, status, created_at)
                       VALUES (?, ?, ?, ?, ?, 'open', ?)''',
                    (user_id, word['id'], item.get('type', 'review'), item.get('title', ''), item.get('due_label', 'bugün'), now),
                )
            return self._format_word(word)

    def list_words(self, user_id: int) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute('SELECT * FROM words WHERE user_id = ? ORDER BY updated_at DESC', (user_id,)).fetchall()
            return [self._format_word(dict(row)) for row in rows]

    def list_roadmap(self, user_id: int) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                '''SELECT roadmap_items.*, words.term
                   FROM roadmap_items
                   LEFT JOIN words ON words.id = roadmap_items.word_id
                   WHERE roadmap_items.user_id = ? AND roadmap_items.status = 'open'
                   ORDER BY roadmap_items.id ASC''',
                (user_id,),
            ).fetchall()
            return [dict(row) for row in rows]

    def complete_roadmap_item(self, user_id: int, item_id: int) -> dict[str, Any]:
        with self.connect() as conn:
            row = conn.execute(
                'SELECT * FROM roadmap_items WHERE id = ? AND user_id = ?',
                (item_id, user_id),
            ).fetchone()
            if not row:
                raise ValueError('Roadmap item not found')
            conn.execute(
                "UPDATE roadmap_items SET status = 'completed' WHERE id = ? AND user_id = ?",
                (item_id, user_id),
            )
            completed = dict(row)
            completed['status'] = 'completed'
            return completed

    def record_practice_session(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        now = _utcnow()
        score = int(payload.get('score') or 0)
        used_words = payload.get('used_target_words') or payload.get('usedTargetWords') or []
        missed_words = payload.get('missed_target_words') or payload.get('missedTargetWords') or []
        mistakes = payload.get('mistakes') or []
        feedback = payload.get('feedback') or payload.get('feedback_pointers') or []
        next_practice = payload.get('next_practice') or payload.get('nextPractice') or []

        with self.connect() as conn:
            cur = conn.execute(
                '''INSERT INTO practice_sessions(type, user_id, score, used_target_words_json, missed_target_words_json, mistakes_json, feedback_json, next_practice_json, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (
                    payload.get('type', 'speaking'),
                    user_id,
                    score,
                    _json(used_words),
                    _json(missed_words),
                    _json(mistakes),
                    _json(feedback),
                    _json(next_practice),
                    now,
                ),
            )
            for term in used_words + missed_words:
                row = conn.execute('SELECT * FROM words WHERE user_id = ? AND lower(term) = lower(?)', (user_id, term)).fetchone()
                if not row:
                    continue
                delta = 8 if term in used_words else -8
                if score >= 3:
                    delta += 8
                elif score <= 1:
                    delta -= 4
                mastery = max(0, min(100, int(row['mastery_score']) + delta))
                due = '7 gün sonra' if mastery >= 60 else '3 gün sonra' if mastery >= 45 else 'yarın'
                conn.execute(
                    'UPDATE words SET mastery_score = ?, next_review_at = ?, updated_at = ? WHERE id = ?',
                    (mastery, due, now, row['id']),
                )
            for title in next_practice:
                conn.execute(
                    '''INSERT INTO roadmap_items(user_id, word_id, type, title, due_label, status, created_at)
                       VALUES (?, NULL, 'review', ?, 'sıradaki', 'open', ?)''',
                    (user_id, title, now),
                )
            return {'id': cur.lastrowid, 'score': score, 'created_at': now}

    def _format_word(self, row: dict[str, Any]) -> dict[str, Any]:
        row['examples'] = _parse_json(row.pop('examples_json', None), [])
        row['common_mistakes'] = _parse_json(row.pop('common_mistakes_json', None), [])
        return row
