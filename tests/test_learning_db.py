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
