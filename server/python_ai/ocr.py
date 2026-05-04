from __future__ import annotations

from dataclasses import dataclass, replace
from io import BytesIO
import re
from typing import Any

try:
    import fitz
except Exception:  # pragma: no cover
    fitz = None
import numpy as np
from PIL import Image

from python_ai.config import OCR_MAX_FILE_BYTES, OCR_MAX_PAGES, OCR_MIN_CONFIDENCE, OCR_MIN_OUTPUT_CHARS, OCR_MIN_TEXT_LENGTH, OCR_RENDER_ZOOM

try:
    from rapidocr_onnxruntime import RapidOCR
except Exception:  # pragma: no cover
    RapidOCR = None


SUPPORTED_IMAGE_MIME_TYPES = {
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/tiff',
    'image/bmp',
    'image/gif'
}


@dataclass(frozen=True)
class OcrPageResult:
    page_number: int
    text: str
    confidence: float | None
    method: str


@dataclass(frozen=True)
class OcrResult:
    text: str
    confidence: float | None
    method: str
    version: str | None
    language: str | None
    page_count: int | None
    pages: list[OcrPageResult]
    word_count: int | None
    extraction_error: str | None = None
    extraction_fields: dict[str, Any] | None = None


class OcrEngineUnavailable(RuntimeError):
    pass


from PIL import Image, ImageEnhance, ImageOps

class RapidOcrBackend:
    def __init__(self) -> None:
        if RapidOCR is None:
            raise OcrEngineUnavailable('rapidocr_onnxruntime is not installed')
        self._engine = RapidOCR()

    def recognize(self, image: Image.Image) -> tuple[str, float | None]:
        # 1. Convert to RGB
        rgb_image = image.convert('RGB')
        
        # 2. Enhance image for better OCR accuracy
        # Contrast enhancement (makes text pop)
        enhancer = ImageEnhance.Contrast(rgb_image)
        enhanced_image = enhancer.enhance(1.5)
        
        # Sharpness enhancement (reduces blur)
        enhancer = ImageEnhance.Sharpness(enhanced_image)
        enhanced_image = enhancer.enhance(1.2)
        
        # 3. Convert to grayscale array for RapidOCR
        image_array = np.array(enhanced_image)
        result, _elapsed = self._engine(image_array)

        if not result:
            return '', None

        texts: list[str] = []
        confidences: list[float] = []

        for item in result:
            if len(item) >= 3:
                text = str(item[1]).strip()
                score = item[2]
            else:
                text = str(item[1]).strip() if len(item) > 1 else ''
                score = None

            if text:
                texts.append(text)
                if score is not None:
                    try:
                        confidences.append(float(score))
                    except Exception:
                        pass

        confidence = round(sum(confidences) / len(confidences), 4) if confidences else None
        return '\n'.join(texts).strip(), confidence

    def recognize_with_preprocessing(self, image: Image.Image, attempts: int = 3) -> tuple[str, float | None]:
        """Try multiple preprocessing strategies to improve OCR on noisy images.

        Strategies: original enhanced, autocontrast + sharpen, grayscale+binarize, resized upscale.
        """
        strategies = []

        # baseline enhanced (existing)
        strategies.append(lambda img: img)

        # autocontrast + slight sharpen
        def autocontrast_sharpen(img: Image.Image) -> Image.Image:
            img2 = ImageOps.autocontrast(img)
            enhancer = ImageEnhance.Sharpness(img2)
            return enhancer.enhance(1.3)

        strategies.append(autocontrast_sharpen)

        # grayscale + adaptive binarize
        def binarize(img: Image.Image) -> Image.Image:
            gray = img.convert('L')
            # simple global threshold based on mean
            arr = np.array(gray)
            thresh = max(10, int(arr.mean()))
            bw = gray.point(lambda p: 255 if p > thresh else 0)
            return bw.convert('RGB')

        strategies.append(binarize)

        # upscale then autocontrast
        def upscale_contrast(img: Image.Image) -> Image.Image:
            w, h = img.size
            img2 = img.resize((min(3000, w * 2), min(3000, h * 2)), Image.LANCZOS)
            return ImageOps.autocontrast(img2)

        strategies.append(upscale_contrast)

        best_text = ''
        best_conf: float | None = None

        for idx, strat in enumerate(strategies[:attempts]):
            try:
                with Image.Image.convert(image, 'RGB') if False else image:
                    proc = strat(image.copy())
                text, conf = self.recognize(proc)
            except Exception:
                text, conf = '', None

            if text and (not best_text or (conf or 0) > (best_conf or 0)):
                best_text = text
                best_conf = conf

            # quick exit if confidence is comfortably high
            if best_conf is not None and best_conf >= 0.85:
                break

        return best_text.strip(), best_conf


_BACKEND: RapidOcrBackend | None = None


def get_ocr_backend() -> RapidOcrBackend:
    global _BACKEND

    if _BACKEND is None:
        _BACKEND = RapidOcrBackend()

    return _BACKEND


def normalize_text(text: str) -> str:
    normalized = (
        text.replace('\r\n', '\n')
        .replace('\r', '\n')
        .replace('\t', ' ')
        .replace('\f', ' ')
        .replace('\v', ' ')
        .replace('\u00a0', ' ')
    )
    normalized = re.sub(r'\n{3,}', '\n\n', normalized)
    normalized = re.sub(r' {2,}', ' ', normalized)
    return normalized


def compact_text(text: str, max_chars: int = 12000) -> str:
    collapsed = normalize_text(text)
    while '\n\n\n' in collapsed:
        collapsed = collapsed.replace('\n\n\n', '\n\n')
    while '  ' in collapsed:
        collapsed = collapsed.replace('  ', ' ')
    return collapsed.strip()[:max_chars]


def infer_document_type(text: str, file_name: str | None, mime_type: str | None) -> str:
    normalized_text = normalize_text(text).lower()
    normalized_name = (file_name or '').lower()
    normalized_mime = (mime_type or '').lower()

    if 'invoice' in normalized_text or 'invoice' in normalized_name:
        return 'invoice'

    if 'receipt' in normalized_text or 'receipt' in normalized_name:
        return 'receipt'

    if 'bill' in normalized_text or 'bill' in normalized_name:
        return 'bill'

    if 'income statement' in normalized_text or 'profit and loss' in normalized_text:
        return 'income_statement'

    if normalized_mime == 'text/plain' or normalized_name.endswith('.txt'):
        return 'text_note'

    return 'unknown'


def _parse_amount(value: str) -> float | None:
    cleaned = value.replace(',', '').strip()

    try:
        return round(float(cleaned), 2)
    except Exception:
        return None


def extract_finance_fields(text: str, document_type: str) -> dict[str, Any]:
    normalized_text = normalize_text(text)
    lines = [line.strip() for line in normalized_text.split('\n') if line.strip()]
    lower_text = normalized_text.lower()

    amount_matches = re.findall(
        r'(?:grand\s+total|amount\s+due|total\s+amount|total|amount)\s*[:\-]?\s*(?:usd|eur|gbp|inr|rs\.?|\$|€|£)?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)',
        lower_text,
        flags=re.IGNORECASE
    )
    parsed_amounts = [_parse_amount(value) for value in amount_matches]
    parsed_amounts = [value for value in parsed_amounts if value is not None]

    if not parsed_amounts:
        fallback_amounts = re.findall(r'(?:\$|€|£|rs\.?\s*)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)', lower_text, flags=re.IGNORECASE)
        parsed_amounts = [_parse_amount(value) for value in fallback_amounts]
        parsed_amounts = [value for value in parsed_amounts if value is not None]

    date_match = re.search(
        r'\b(\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\b',
        normalized_text
    )
    invoice_match = re.search(
        r'\b(?:invoice\s*(?:no|number|#)?|bill\s*(?:no|number|#)?)\s*[:#\-]?\s*([A-Za-z0-9\-_/]{3,})',
        normalized_text,
        flags=re.IGNORECASE
    )

    vendor = None
    for line in lines[:5]:
        line_lower = line.lower()
        if any(token in line_lower for token in ('invoice', 'receipt', 'bill', 'date', 'total', 'amount', 'tax', 'gst', 'vat')):
            continue
        if len(line) >= 3:
            vendor = line[:120]
            break

    category_hint = None
    category_keywords = {
        'software': 'software',
        'hosting': 'cloud_infra',
        'aws': 'cloud_infra',
        'gcp': 'cloud_infra',
        'azure': 'cloud_infra',
        'salary': 'payroll',
        'payroll': 'payroll',
        'rent': 'rent',
        'travel': 'travel',
        'marketing': 'marketing',
        'ads': 'marketing',
        'meal': 'meals'
    }

    for keyword, mapped in category_keywords.items():
        if keyword in lower_text:
            category_hint = mapped
            break

    fields: dict[str, Any] = {
        'document_type': document_type,
        'vendor': vendor,
        'invoice_number': invoice_match.group(1) if invoice_match else None,
        'transaction_date': date_match.group(1) if date_match else None,
        'total_amount': max(parsed_amounts) if parsed_amounts else None,
        'category_hint': category_hint
    }

    return {key: value for key, value in fields.items() if value is not None}


def enrich_result_with_fields(result: OcrResult, file_name: str | None, mime_type: str | None) -> OcrResult:
    if not result.text:
        return result

    document_type = infer_document_type(result.text, file_name, mime_type)
    extraction_fields = extract_finance_fields(result.text, document_type)
    return replace(result, extraction_fields=extraction_fields)


def _native_pdf_text(document: Any) -> list[OcrPageResult]:
    pages: list[OcrPageResult] = []

    for page_index in range(min(document.page_count, OCR_MAX_PAGES)):
        page = document.load_page(page_index)
        native_text = compact_text(page.get_text('text'))

        if native_text:
            pages.append(
                OcrPageResult(
                    page_number=page_index + 1,
                    text=native_text,
                    confidence=0.98,
                    method='pdf_text'
                )
            )
        else:
            pages.append(
                OcrPageResult(
                    page_number=page_index + 1,
                    text='',
                    confidence=None,
                    method='pdf_text_empty'
                )
            )

    return pages


def _ocr_pdf_pages(document: Any) -> list[OcrPageResult]:
    backend = get_ocr_backend()
    pages: list[OcrPageResult] = []

    for page_index in range(min(document.page_count, OCR_MAX_PAGES)):
        page = document.load_page(page_index)
        pixmap = page.get_pixmap(matrix=fitz.Matrix(OCR_RENDER_ZOOM, OCR_RENDER_ZOOM), alpha=False)
        with Image.open(BytesIO(pixmap.tobytes('png'))) as image:
            # try stronger preprocessing for scanned PDFs
            try:
                text, confidence = backend.recognize_with_preprocessing(image.copy(), attempts=4)
            except Exception:
                text, confidence = backend.recognize(image.copy())
        pages.append(
            OcrPageResult(
                page_number=page_index + 1,
                text=compact_text(text),
                confidence=confidence,
                method='rapidocr'
            )
        )

    return pages


def _ocr_image(image_bytes: bytes) -> list[OcrPageResult]:
    backend = get_ocr_backend()
    with Image.open(BytesIO(image_bytes)) as image:
        try:
            text, confidence = backend.recognize_with_preprocessing(image.copy(), attempts=4)
        except Exception:
            text, confidence = backend.recognize(image.copy())
    return [
        OcrPageResult(
            page_number=1,
            text=compact_text(text),
            confidence=confidence,
            method='rapidocr'
        )
    ]


def extract_document(file_name: str | None, mime_type: str | None, file_bytes: bytes, fallback_text: str | None = None) -> OcrResult:
    fallback = compact_text(fallback_text or '')
    mime = (mime_type or '').lower().strip()
    name = (file_name or '').lower().strip()

    if len(file_bytes) > OCR_MAX_FILE_BYTES:
        return OcrResult(
            text=fallback,
            confidence=None,
            method='file_too_large',
            version=None,
            language=None,
            page_count=None,
            pages=[],
            word_count=len(fallback.split()) if fallback else 0,
            extraction_error='file_too_large'
        )

    if not file_bytes:
        return OcrResult(
            text=fallback,
            confidence=None,
            method='fallback_text',
            version=None,
            language=None,
            page_count=None,
            pages=[],
            word_count=len(fallback.split()) if fallback else 0,
            extraction_error='empty_file'
        )

    try:
        if mime == 'text/plain' or name.endswith('.txt'):
            text = compact_text(file_bytes.decode('utf-8', errors='ignore'))
            if not text:
                text = fallback
            return enrich_result_with_fields(OcrResult(
                text=text,
                confidence=1.0 if text else None,
                method='inline_text',
                version='text_passthrough',
                language='en',
                page_count=1,
                pages=[OcrPageResult(page_number=1, text=text, confidence=1.0 if text else None, method='inline_text')],
                word_count=len(text.split()) if text else 0,
                extraction_error=None
            ), file_name, mime_type)

        if mime == 'application/pdf' or name.endswith('.pdf'):
            if fitz is None:
                raise OcrEngineUnavailable('pymupdf (fitz) is not installed')

            document = fitz.open(stream=file_bytes, filetype='pdf')
            try:
                native_pages = _native_pdf_text(document)
                native_text = compact_text('\n\n'.join(page.text for page in native_pages))

                if len(native_text) >= OCR_MIN_TEXT_LENGTH:
                    confidence = 0.98
                    if fallback and len(native_text) < len(fallback):
                        native_text = native_text or fallback
                    extraction_error = None
                    if len(native_text) < OCR_MIN_OUTPUT_CHARS:
                        extraction_error = 'output_too_short'
                    return enrich_result_with_fields(OcrResult(
                        text=native_text,
                        confidence=confidence,
                        method='pdf_text',
                        version='pymupdf',
                        language='en',
                        page_count=document.page_count,
                        pages=native_pages,
                        word_count=len(native_text.split()) if native_text else 0,
                        extraction_error=extraction_error
                    ), file_name, mime_type)

                ocr_pages = _ocr_pdf_pages(document)
                ocr_text = compact_text('\n\n'.join(page.text for page in ocr_pages))
                ocr_confidences = [page.confidence for page in ocr_pages if page.confidence is not None]
                confidence = round(sum(ocr_confidences) / len(ocr_confidences), 4) if ocr_confidences else None

                if not ocr_text:
                    ocr_text = fallback

                if not ocr_text:
                    return OcrResult(
                        text='',
                        confidence=None,
                        method='pdf_ocr_failed',
                        version='pymupdf+rapidocr',
                        language='en',
                        page_count=document.page_count,
                        pages=ocr_pages,
                        word_count=0,
                        extraction_error='no_text_extracted'
                    )

                return enrich_result_with_fields(OcrResult(
                    text=ocr_text,
                    confidence=confidence,
                    method='pdf_ocr',
                    version='pymupdf+rapidocr',
                    language='en',
                    page_count=document.page_count,
                    pages=ocr_pages,
                    word_count=len(ocr_text.split()) if ocr_text else 0,
                    extraction_error='low_confidence' if confidence is not None and confidence < OCR_MIN_CONFIDENCE else None
                ), file_name, mime_type)
            finally:
                document.close()

        if mime in SUPPORTED_IMAGE_MIME_TYPES or any(name.endswith(ext) for ext in ('.png', '.jpg', '.jpeg', '.webp', '.tiff', '.tif', '.bmp', '.gif')):
            ocr_pages = _ocr_image(file_bytes)
            ocr_text = compact_text('\n\n'.join(page.text for page in ocr_pages))
            confidence = ocr_pages[0].confidence if ocr_pages else None
            if not ocr_text:
                ocr_text = fallback
            return enrich_result_with_fields(OcrResult(
                text=ocr_text,
                confidence=confidence,
                method='image_ocr',
                version='rapidocr',
                language='en',
                page_count=1,
                pages=ocr_pages,
                word_count=len(ocr_text.split()) if ocr_text else 0,
                extraction_error='low_confidence' if confidence is not None and confidence < OCR_MIN_CONFIDENCE else None
            ), file_name, mime_type)

        if fallback:
            return enrich_result_with_fields(OcrResult(
                text=fallback,
                confidence=None,
                method='fallback_text',
                version=None,
                language=None,
                page_count=None,
                pages=[],
                word_count=len(fallback.split()) if fallback else 0,
                extraction_error='unsupported_mime_using_fallback'
            ), file_name, mime_type)

        raise OcrEngineUnavailable(f'unsupported mime type: {mime_type or "unknown"}')
    except Exception as exc:
        if fallback:
            return enrich_result_with_fields(OcrResult(
                text=fallback,
                confidence=None,
                method='fallback_text',
                version=None,
                language=None,
                page_count=None,
                pages=[],
                word_count=len(fallback.split()) if fallback else 0,
                extraction_error=str(exc)
            ), file_name, mime_type)
        raise
