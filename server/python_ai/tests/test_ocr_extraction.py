import unittest

from python_ai.ocr import extract_document


class OcrExtractionTests(unittest.TestCase):
    def test_text_invoice_extraction_returns_structured_fields(self):
        content = """
        Acme Software LLC
        Invoice Number: INV-2026-0042
        Date: 2026-04-15
        Total: $1,250.50
        """.strip().encode('utf-8')

        result = extract_document(
            file_name='invoice.txt',
            mime_type='text/plain',
            file_bytes=content,
            fallback_text=None,
        )

        self.assertEqual(result.method, 'inline_text')
        self.assertIsNotNone(result.extraction_fields)
        self.assertEqual(result.extraction_fields.get('document_type'), 'invoice')
        self.assertEqual(result.extraction_fields.get('invoice_number'), 'INV-2026-0042')
        self.assertEqual(result.extraction_fields.get('total_amount'), 1250.5)
        self.assertEqual(result.extraction_fields.get('vendor'), 'Acme Software LLC')

    def test_text_burn_context_maps_category_hint(self):
        content = """
        Cloud Hosting Services
        Bill No: HST-99
        Date 2026-03-01
        Amount Due: 499.99
        AWS monthly hosting
        """.strip().encode('utf-8')

        result = extract_document(
            file_name='hosting_bill.txt',
            mime_type='text/plain',
            file_bytes=content,
            fallback_text=None,
        )

        self.assertEqual(result.method, 'inline_text')
        self.assertEqual(result.extraction_fields.get('document_type'), 'bill')
        self.assertEqual(result.extraction_fields.get('category_hint'), 'cloud_infra')
        self.assertEqual(result.extraction_fields.get('total_amount'), 499.99)


if __name__ == '__main__':
    unittest.main()
