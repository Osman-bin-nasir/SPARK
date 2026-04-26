const DEFAULT_EXTRACTION_CONFIDENCE_THRESHOLD = 0.8;
const DEFAULT_MAX_EXTRACTED_TEXT_CHARS = 12000;

const EXTRACTION_METHODS = {
  EXTERNAL: 'external',
  INLINE_TEXT: 'inline_text',
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

function normalizeExtractedText(text, maxChars = DEFAULT_MAX_EXTRACTED_TEXT_CHARS) {
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

function shouldRouteToPendingReview(confidence, threshold = DEFAULT_EXTRACTION_CONFIDENCE_THRESHOLD) {
  const safeConfidence = clampConfidence(confidence);

  if (safeConfidence === null) {
    return true;
  }

  return safeConfidence < threshold;
}

module.exports = {
  DEFAULT_EXTRACTION_CONFIDENCE_THRESHOLD,
  DEFAULT_MAX_EXTRACTED_TEXT_CHARS,
  EXTRACTION_METHODS,
  clampConfidence,
  normalizeExtractedText,
  shouldRouteToPendingReview
};
