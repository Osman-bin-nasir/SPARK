from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import re
from typing import Any

import fitz
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


class OcrEngineUnavailable(RuntimeError):
    pass


class RapidOcrBackend:
    def __init__(self) -> None:
        if RapidOCR is None:
            raise OcrEngineUnavailable('rapidocr_onnxruntime is not installed')
        self._engine = RapidOCR()

    def recognize(self, image: Image.Image) -> tuple[str, float | None]:
        rgb_image = image.convert('RGB')
        image_array = np.array(rgb_image)
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


def _native_pdf_text(document: fitz.Document) -> list[OcrPageResult]:
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


def _ocr_pdf_pages(document: fitz.Document) -> list[OcrPageResult]:
    backend = get_ocr_backend()
    pages: list[OcrPageResult] = []

    for page_index in range(min(document.page_count, OCR_MAX_PAGES)):
        page = document.load_page(page_index)
        pixmap = page.get_pixmap(matrix=fitz.Matrix(OCR_RENDER_ZOOM, OCR_RENDER_ZOOM), alpha=False)
        with Image.open(BytesIO(pixmap.tobytes('png'))) as image:
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
            return OcrResult(
                text=text,
                confidence=1.0 if text else None,
                method='inline_text',
                version='text_passthrough',
                language='en',
                page_count=1,
                pages=[OcrPageResult(page_number=1, text=text, confidence=1.0 if text else None, method='inline_text')],
                word_count=len(text.split()) if text else 0,
                extraction_error=None
            )

        if mime == 'application/pdf' or name.endswith('.pdf'):
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
                    return OcrResult(
                        text=native_text,
                        confidence=confidence,
                        method='pdf_text',
                        version='pymupdf',
                        language='en',
                        page_count=document.page_count,
                        pages=native_pages,
                        word_count=len(native_text.split()) if native_text else 0,
                        extraction_error=extraction_error
                    )

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

                return OcrResult(
                    text=ocr_text,
                    confidence=confidence,
                    method='pdf_ocr',
                    version='pymupdf+rapidocr',
                    language='en',
                    page_count=document.page_count,
                    pages=ocr_pages,
                    word_count=len(ocr_text.split()) if ocr_text else 0,
                    extraction_error='low_confidence' if confidence is not None and confidence < OCR_MIN_CONFIDENCE else None
                )
            finally:
                document.close()

        if mime in SUPPORTED_IMAGE_MIME_TYPES or any(name.endswith(ext) for ext in ('.png', '.jpg', '.jpeg', '.webp', '.tiff', '.tif', '.bmp', '.gif')):
            ocr_pages = _ocr_image(file_bytes)
            ocr_text = compact_text('\n\n'.join(page.text for page in ocr_pages))
            confidence = ocr_pages[0].confidence if ocr_pages else None
            if not ocr_text:
                ocr_text = fallback
            return OcrResult(
                text=ocr_text,
                confidence=confidence,
                method='image_ocr',
                version='rapidocr',
                language='en',
                page_count=1,
                pages=ocr_pages,
                word_count=len(ocr_text.split()) if ocr_text else 0,
                extraction_error='low_confidence' if confidence is not None and confidence < OCR_MIN_CONFIDENCE else None
            )

        if fallback:
            return OcrResult(
                text=fallback,
                confidence=None,
                method='fallback_text',
                version=None,
                language=None,
                page_count=None,
                pages=[],
                word_count=len(fallback.split()) if fallback else 0,
                extraction_error='unsupported_mime_using_fallback'
            )

        raise OcrEngineUnavailable(f'unsupported mime type: {mime_type or "unknown"}')
    except Exception as exc:
        if fallback:
            return OcrResult(
                text=fallback,
                confidence=None,
                method='fallback_text',
                version=None,
                language=None,
                page_count=None,
                pages=[],
                word_count=len(fallback.split()) if fallback else 0,
                extraction_error=str(exc)
            )
        raise
