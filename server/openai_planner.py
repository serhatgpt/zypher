import json
import os
from typing import Any

import requests


OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'


def build_fallback_learning_plan(term: str, level: str = 'A2') -> dict[str, Any]:
    clean = term.strip()
    return {
        'level_estimate': level,
        'learning_card': {
            'term': clean,
            'meaning_tr': f'“{clean}” kelimesini/konusunu bağlam içinde öğren.',
            'examples': [
                f'I can use {clean} in a simple sentence.',
                f'Today I practiced {clean} while speaking English.',
                f'{clean.capitalize()} helps me express my idea more clearly.',
            ],
            'common_mistakes': [
                'Kelimeyi tek başına ezberlemek yerine cümle içinde kullan.',
                'Türkçe cümle yapısını birebir İngilizceye çevirmemeye dikkat et.',
            ],
        },
        'roadmap_items': [
            {
                'type': 'speaking',
                'title': f'Use “{clean}” in a short live conversation',
                'due_label': 'bugün',
            },
            {
                'type': 'reading',
                'title': f'Read a short paragraph containing “{clean}”',
                'due_label': 'bugün',
            },
            {
                'type': 'writing',
                'title': f'Write 3 simple sentences with “{clean}”',
                'due_label': 'yarın',
            },
            {
                'type': 'review',
                'title': f'Review “{clean}” in a new context',
                'due_label': '3 gün sonra',
            },
        ],
    }


def create_learning_plan(term: str, level: str = 'A2') -> dict[str, Any]:
    """Use OpenAI for roadmap planning when configured; otherwise deterministic fallback."""
    api_key = os.getenv('OPENAI_API_KEY')
    model = os.getenv('OPENAI_PLANNER_MODEL', 'gpt-4.1-mini')
    if not api_key:
        return build_fallback_learning_plan(term, level)

    prompt = f"""
You are Zypher, a practical English tutor for Turkish speakers.
Create a compact JSON learning card and roadmap for this word/topic: {term}
Learner level: {level}
Keep it simple: speaking, reading, writing, and review. Turkish explanations.
Return only valid JSON with keys: level_estimate, learning_card, roadmap_items.
learning_card keys: term, meaning_tr, examples, common_mistakes.
roadmap_items array items: type, title, due_label.
""".strip()

    try:
        response = requests.post(
            OPENAI_API_URL,
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            },
            json={
                'model': model,
                'messages': [{'role': 'user', 'content': prompt}],
                'response_format': {'type': 'json_object'},
                'temperature': 0.3,
            },
            timeout=20,
        )
        response.raise_for_status()
        content = response.json()['choices'][0]['message']['content']
        parsed = json.loads(content)
        if 'learning_card' not in parsed or 'roadmap_items' not in parsed:
            return build_fallback_learning_plan(term, level)
        return parsed
    except Exception:
        return build_fallback_learning_plan(term, level)
