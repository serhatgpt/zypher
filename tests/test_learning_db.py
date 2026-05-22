import datetime as dt
import tempfile

from server.learning_db import LearningDB
from server.openai_planner import build_fallback_learning_plan


def test_user_register_login_and_token_lookup():
    with tempfile.NamedTemporaryFile() as tmp:
        db = LearningDB(tmp.name)
        user = db.create_user('serhat@example.com', 'secret123')
        assert user['email'] == 'serhat@example.com'

        logged_in = db.verify_user('serhat@example.com', 'secret123')
        assert logged_in['id'] == user['id']
        assert db.verify_user('serhat@example.com', 'wrong') is None

        token = db.create_session_token(user['id'])
        assert len(token) >= 24
        assert db.get_user_by_token(token)['email'] == 'serhat@example.com'


def test_word_creation_generates_learning_card_and_roadmap_items():
    with tempfile.NamedTemporaryFile() as tmp:
        db = LearningDB(tmp.name)
        user = db.create_user('serhat@example.com', 'secret123')
        plan = build_fallback_learning_plan('although', 'A2')
        word = db.create_word(user['id'], 'although', plan)

        words = db.list_words(user['id'])
        roadmap = db.list_roadmap(user['id'])

        assert words[0]['term'] == 'although'
        assert words[0]['meaning_tr']
        assert word['id'] == words[0]['id']
        assert [item['type'] for item in roadmap] == ['speaking', 'reading', 'writing', 'review']
        assert roadmap[0]['title']


def test_roadmap_completion_hides_item_from_open_roadmap():
    with tempfile.NamedTemporaryFile() as tmp:
        db = LearningDB(tmp.name)
        user = db.create_user('serhat@example.com', 'secret123')
        db.create_word(user['id'], 'although', build_fallback_learning_plan('although', 'A2'))
        roadmap = db.list_roadmap(user['id'])

        completed = db.complete_roadmap_item(user['id'], roadmap[0]['id'])
        remaining = db.list_roadmap(user['id'])

        assert completed['status'] == 'completed'
        assert roadmap[0]['id'] not in [item['id'] for item in remaining]
        assert len(remaining) == len(roadmap) - 1


def test_practice_session_updates_mastery_and_adds_next_items():
    with tempfile.NamedTemporaryFile() as tmp:
        db = LearningDB(tmp.name)
        user = db.create_user('serhat@example.com', 'secret123')
        db.create_word(user['id'], 'although', build_fallback_learning_plan('although', 'A2'))

        session = db.record_practice_session(user['id'], {
            'type': 'speaking',
            'score': 3,
            'used_target_words': ['although'],
            'missed_target_words': [],
            'mistakes': [],
            'feedback': ['Good job'],
            'next_practice': ['Write 3 sentences with although'],
        })

        words = db.list_words(user['id'])
        roadmap = db.list_roadmap(user['id'])

        assert session['score'] == 3
        assert words[0]['mastery_score'] > 25
        assert any('Write 3 sentences' in item['title'] for item in roadmap)


def test_words_use_real_iso_review_dates_and_due_filtering():
    with tempfile.NamedTemporaryFile() as tmp:
        db = LearningDB(tmp.name)
        user = db.create_user('serhat@example.com', 'secret123')
        db.create_word(user['id'], 'although', build_fallback_learning_plan('although', 'A2'))

        word = db.list_words(user['id'])[0]
        created_due = dt.datetime.fromisoformat(word['next_review_at'])
        assert created_due.tzinfo is not None
        assert word['is_due'] is True

        db.record_practice_session(user['id'], {
            'type': 'speaking',
            'score': 4,
            'used_target_words': ['although'],
            'missed_target_words': [],
        })

        reviewed_word = db.list_words(user['id'])[0]
        next_review_at = dt.datetime.fromisoformat(reviewed_word['next_review_at'])
        assert next_review_at > dt.datetime.now(dt.UTC) + dt.timedelta(days=2)
        assert reviewed_word['review_interval_days'] == 3
        assert reviewed_word['is_due'] is False
        assert db.list_due_words(user['id']) == []

        with db.connect() as conn:
            conn.execute(
                'UPDATE words SET next_review_at = ? WHERE id = ?',
                ((dt.datetime.now(dt.UTC) - dt.timedelta(minutes=1)).isoformat(), reviewed_word['id']),
            )
        assert [item['term'] for item in db.list_due_words(user['id'])] == ['although']
