const OCR_CONFIDENCE_THRESHOLD_DEFAULT = 0.8;
const OCR_MAX_EXTRACTED_TEXT_CHARS_DEFAULT = 12000;

const OCR_STORAGE_INPUT_TYPES = {
  DOCUMENT: 'document',
  INLINE_TEXT: 'inline_text'
};

const OCR_EXTRACTION_METHODS = {
  PADDLE_OCR: 'paddleocr',
  PDF_PARSER: 'pdf_parser',
  INLINE_TEXT_PASSTHROUGH: 'inline_text_passthrough',
  MANUAL: 'manual',
  UNKNOWN: 'unknown'
};

const OCR_FAILURE_CODES = {
  EXTRACTOR_TIMEOUT: 'extractor_timeout',
  EXTRACTOR_UNAVAILABLE: 'extractor_unavailable',
  UNSUPPORTED_FILE_TYPE: 'unsupported_file_type',
  INVALID_PAYLOAD: 'invalid_payload',
  TEXT_TOO_LONG: 'text_too_long',
  UNKNOWN: 'unknown'
};

function clampConfidence(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

function normalizeExtractedText(text, maxChars = OCR_MAX_EXTRACTED_TEXT_CHARS_DEFAULT) {
  if (typeof text !== 'string') {
    return '';
  }

  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim();

  return normalized.slice(0, Math.max(0, maxChars));
}

function shouldRouteToPendingReview(confidence, threshold = OCR_CONFIDENCE_THRESHOLD_DEFAULT) {
  const safeConfidence = clampConfidence(confidence);

  if (safeConfidence === null) {
    return true;
  }

  return safeConfidence < threshold;
}

module.exports = {
  OCR_CONFIDENCE_THRESHOLD_DEFAULT,
  OCR_EXTRACTION_METHODS,
  OCR_FAILURE_CODES,
  OCR_MAX_EXTRACTED_TEXT_CHARS_DEFAULT,
  OCR_STORAGE_INPUT_TYPES,
  clampConfidence,
  normalizeExtractedText,
  shouldRouteToPendingReview
};
