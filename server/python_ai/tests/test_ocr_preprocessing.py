import io
from PIL import Image

import python_ai.ocr as ocr


class FakeBackendSuccess:
    def recognize_with_preprocessing(self, image, attempts=3):
        # Simulate that the best strategy yields text with high confidence
        return ("SIMULATED_PREPROCESS_TEXT", 0.9)

    def recognize(self, image):
        return ("SIMULATED_BASIC_TEXT", 0.5)


class FakeBackendRaises:
    def recognize_with_preprocessing(self, image, attempts=3):
        raise RuntimeError("simulated preprocessing error")

    def recognize(self, image):
        return ("FALLBACK_TEXT", 0.42)


def make_test_image_bytes(text="hello"):
    buf = io.BytesIO()
    Image.new('RGB', (200, 60), color=(255, 255, 255)).save(buf, format='PNG')
    return buf.getvalue()


def test_ocr_preprocessing_selects_best():
    # Patch backend to our fake that returns a high-confidence preprocessing result
    ocr._BACKEND = FakeBackendSuccess()

    # Create a simple PNG image bytes
    buf = io.BytesIO()
    Image.new('RGB', (100, 30), color=(255, 255, 255)).save(buf, format='PNG')
    img_bytes = buf.getvalue()

    pages = ocr._ocr_image(img_bytes)

    assert pages[0].text == 'SIMULATED_PREPROCESS_TEXT'
    assert pages[0].confidence is not None and pages[0].confidence > 0.8


def test_ocr_preprocessing_falls_back_on_error():
    ocr._BACKEND = FakeBackendRaises()

    buf = io.BytesIO()
    Image.new('RGB', (100, 30), color=(255, 255, 255)).save(buf, format='PNG')
    img_bytes = buf.getvalue()

    pages = ocr._ocr_image(img_bytes)

    assert pages[0].text == 'FALLBACK_TEXT'
    assert pages[0].confidence == 0.42
