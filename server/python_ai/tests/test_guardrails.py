import unittest

from python_ai.guardrails import (
    clamp_confidence,
    coerce_sources,
    compact_text,
    extract_json_candidate,
    normalize_generation_output,
    sources_to_context,
)


class GuardrailTests(unittest.TestCase):
    def test_compact_text_normalizes_and_limits(self):
        text = 'Hello\r\n\r\nWorld\t  !'
        result = compact_text(text, 12)
        self.assertEqual(result, 'Hello\n\nWorld')

    def test_clamp_confidence_bounds(self):
        self.assertEqual(clamp_confidence(-1), 0.0)
        self.assertEqual(clamp_confidence(2), 1.0)
        self.assertEqual(clamp_confidence('bad'), None)
        self.assertEqual(clamp_confidence(0.67891), 0.6789)

    def test_coerce_sources_caps_count_and_text(self):
        sources = [
            {
                'transaction_id': 'tx-1',
                'document_id': 'doc-1',
                'vendor': 'Acme',
                'category': 'Ops',
                'amount': 10,
                'transaction_date': '2026-04-01',
                'similarity_score': 0.9,
                'extracted_text': 'A' * 1500,
                'text_content': 'B' * 1500,
            }
        ] + [{'transaction_id': f'tx-{index}'} for index in range(2, 20)]

        cleaned = coerce_sources(sources)
        self.assertEqual(len(cleaned), 12)
        self.assertEqual(len(cleaned[0]['extracted_text']), 1000)
        self.assertTrue(cleaned[0]['extracted_text'].startswith('A'))

    def test_sources_to_context_includes_evidence(self):
        context = sources_to_context([
            {
                'transaction_id': 'tx-1',
                'document_id': 'doc-1',
                'vendor': 'Acme',
                'category': 'Ops',
                'amount': 42,
                'transaction_date': '2026-04-01',
                'similarity_score': 0.93,
                'extracted_text': 'Office supplies receipt'
            }
        ])
        self.assertIn('tx_id=tx-1', context)
        self.assertIn('evidence=Office supplies receipt', context)

    def test_extract_json_candidate(self):
        parsed = extract_json_candidate('before {"answer": "ok", "confidence": 0.9} after')
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed['answer'], 'ok')

    def test_normalize_generation_output_requires_citations_and_confidence(self):
        sources = [{'transaction_id': 'tx-1', 'vendor': 'Acme'}]
        normalized = normalize_generation_output(
            {
                'answer': 'Grounded answer',
                'confidence': 0.91,
                'refusal': False,
                'cited_transaction_ids': ['tx-1']
            },
            'raw',
            sources,
        )
        self.assertFalse(normalized['refusal'])
        self.assertEqual(normalized['cited_transaction_ids'], ['tx-1'])

    def test_normalize_generation_output_refuses_without_citations(self):
        sources = [{'transaction_id': 'tx-1', 'vendor': 'Acme'}]
        normalized = normalize_generation_output(
            {
                'answer': 'Grounded answer',
                'confidence': 0.91,
                'refusal': False,
                'cited_transaction_ids': []
            },
            'raw',
            sources,
        )
        self.assertTrue(normalized['refusal'])
        self.assertEqual(normalized['guardrail_reason'], 'low_confidence_or_missing_citations')

    def test_normalize_generation_output_refuses_low_confidence(self):
        sources = [{'transaction_id': 'tx-1', 'vendor': 'Acme'}]
        normalized = normalize_generation_output(
            {
                'answer': 'Grounded answer',
                'confidence': 0.1,
                'refusal': False,
                'cited_transaction_ids': ['tx-1']
            },
            'raw',
            sources,
        )
        self.assertTrue(normalized['refusal'])
        self.assertEqual(normalized['guardrail_reason'], 'low_confidence_or_missing_citations')


if __name__ == '__main__':
    unittest.main()
