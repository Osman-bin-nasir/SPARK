from __future__ import annotations

import json
import re
from typing import Any

from python_ai.config import GENERATION_MAX_OUTPUT_CHARS, GENERATION_MAX_SOURCE_ITEMS, GENERATION_MIN_CONFIDENCE

MAX_SOURCE_ITEMS = GENERATION_MAX_SOURCE_ITEMS
MAX_SOURCE_TEXT_CHARS = 1000
MAX_PROMPT_CHARS = 12000
MAX_ANSWER_CHARS = GENERATION_MAX_OUTPUT_CHARS
MIN_GENERATION_CONFIDENCE = GENERATION_MIN_CONFIDENCE
REFUSAL_MARKERS = (
    'insufficient evidence',
    'not enough evidence',
    'cannot determine',
    'unable to determine',
    'i do not know',
    'cannot answer'
)


def compact_text(text: str | None, max_chars: int) -> str:
    if not text:
        return ''

    normalized = (
        str(text)
        .replace('\r\n', '\n')
        .replace('\r', '\n')
        .replace('\t', ' ')
        .replace('\f', ' ')
        .replace('\v', ' ')
        .replace('\u00a0', ' ')
    )
    normalized = re.sub(r'\n{3,}', '\n\n', normalized)
    normalized = re.sub(r' {2,}', ' ', normalized)
    return normalized.strip()[:max_chars]


def coerce_sources(sources: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not sources:
        return []

    cleaned: list[dict[str, Any]] = []
    for source in sources[:MAX_SOURCE_ITEMS]:
        cleaned.append(
            {
                'transaction_id': compact_text(source.get('transaction_id'), 128),
                'document_id': compact_text(source.get('document_id'), 128),
                'vendor': compact_text(source.get('vendor'), 128),
                'category': compact_text(source.get('category'), 128),
                'amount': source.get('amount'),
                'transaction_date': compact_text(source.get('transaction_date'), 32),
                'similarity_score': source.get('similarity_score'),
                'extracted_text': compact_text(source.get('extracted_text'), MAX_SOURCE_TEXT_CHARS),
                'text_content': compact_text(source.get('text_content'), MAX_SOURCE_TEXT_CHARS)
            }
        )
    return cleaned


def sources_to_context(sources: list[dict[str, Any]] | None) -> str:
    cleaned = coerce_sources(sources)
    if not cleaned:
        return ''

    lines: list[str] = []
    for index, source in enumerate(cleaned, start=1):
        lines.append(
            f"[{index}] tx_id={source['transaction_id']} document_id={source['document_id']} vendor={source['vendor']} "
            f"category={source['category']} amount={source['amount']} date={source['transaction_date']} score={source['similarity_score']}"
        )
        evidence = source['extracted_text'] or source['text_content']
        if evidence:
            lines.append(f'    evidence={evidence}')
    return '\n'.join(lines)


def clamp_confidence(value: Any) -> float | None:
    if value is None:
        return None

    try:
        numeric = float(value)
    except Exception:
        return None

    if numeric < 0:
        return 0.0
    if numeric > 1:
        return 1.0
    return round(numeric, 4)


def extract_json_candidate(text: str) -> dict[str, Any] | None:
    if not text:
        return None

    stripped = text.strip()
    if stripped.startswith('{') and stripped.endswith('}'):
        try:
            return json.loads(stripped)
        except Exception:
            return None

    match = re.search(r'\{.*\}', stripped, re.S)
    if not match:
        return None

    try:
        return json.loads(match.group(0))
    except Exception:
        return None


def normalize_generation_output(
    parsed: dict[str, Any] | None,
    raw_text: str,
    sources: list[dict[str, Any]] | None
) -> dict[str, Any]:
    cleaned_sources = coerce_sources(sources)
    allowed_ids = {source['transaction_id'] for source in cleaned_sources if source['transaction_id']}

    if not parsed:
        return {
            'answer': compact_text(raw_text, MAX_ANSWER_CHARS),
            'confidence': 0.0,
            'refusal': True,
            'guardrail_reason': 'invalid_json_output',
            'cited_transaction_ids': []
        }

    answer = compact_text(parsed.get('answer') or raw_text, MAX_ANSWER_CHARS)
    cited_ids: list[str] = []
    for item in parsed.get('cited_transaction_ids') or []:
        candidate = compact_text(item, 128)
        if candidate and candidate in allowed_ids and candidate not in cited_ids:
            cited_ids.append(candidate)

    confidence = clamp_confidence(parsed.get('confidence'))
    refusal = bool(parsed.get('refusal'))
    lower_answer = answer.lower()

    if any(marker in lower_answer for marker in REFUSAL_MARKERS):
        refusal = True

    if confidence is None:
        confidence = 0.0

    if not answer:
        refusal = True
        answer = 'Evidence was insufficient to generate a grounded answer.'

    if not cited_ids and cleaned_sources:
        refusal = True

    if confidence < MIN_GENERATION_CONFIDENCE:
        refusal = True

    guardrail_reason = parsed.get('guardrail_reason')
    if not guardrail_reason and refusal:
        guardrail_reason = 'low_confidence_or_missing_citations'

    return {
        'answer': answer,
        'confidence': confidence,
        'refusal': refusal,
        'guardrail_reason': guardrail_reason,
        'cited_transaction_ids': cited_ids
    }
