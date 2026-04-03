const { env } = require('../../config/env');
const {
  OCR_EXTRACTION_METHODS,
  OCR_FAILURE_CODES,
  clampConfidence,
  normalizeExtractedText
} = require('../../contracts/ocr.contract');

const SUPPORTED_MIME_PREFIXES = ['image/'];
const SUPPORTED_MIME_TYPES = ['application/pdf', 'text/plain'];

function isSupportedMimeType(mimeType) {
  if (!mimeType) {
    return false;
  }

  return SUPPORTED_MIME_TYPES.includes(mimeType) || SUPPORTED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
}

function inferFallbackMethod(mimeType) {
  if (mimeType === 'text/plain') {
    return OCR_EXTRACTION_METHODS.INLINE_TEXT_PASSTHROUGH;
  }

  return OCR_EXTRACTION_METHODS.UNKNOWN;
}

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer)
  };
}

function sanitizeExtractionResult(data, fallbackText) {
  const text = normalizeExtractedText(
    typeof data?.text === 'string' ? data.text : fallbackText,
    env.ocrMaxExtractedTextChars
  );

  return {
    text,
    confidence: clampConfidence(data?.confidence),
    method: data?.method || OCR_EXTRACTION_METHODS.UNKNOWN,
    version: data?.version || null
  };
}

function buildLocalFallbackResult({ mimeType, fallbackText }) {
  return {
    text: normalizeExtractedText(fallbackText, env.ocrMaxExtractedTextChars),
    confidence: null,
    method: inferFallbackMethod(mimeType),
    version: null
  };
}

async function extractTextFromDocument({ fileName, mimeType, buffer, fallbackText = '' }) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error(`${OCR_FAILURE_CODES.INVALID_PAYLOAD}: file buffer is required`);
  }

  if (!isSupportedMimeType(mimeType)) {
    throw new Error(`${OCR_FAILURE_CODES.UNSUPPORTED_FILE_TYPE}: mimeType=${mimeType || 'unknown'}`);
  }

  if (!env.ocrApiUrl) {
    return buildLocalFallbackResult({ mimeType, fallbackText });
  }

  const { signal, cleanup } = createTimeoutSignal(env.ocrRequestTimeoutMs);

  try {
    const payload = {
      file_name: fileName,
      mime_type: mimeType,
      file_base64: buffer.toString('base64'),
      fallback_text: fallbackText
    };

    const response = await fetch(`${env.ocrApiUrl.replace(/\/$/, '')}/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.ocrApiKey ? { Authorization: `Bearer ${env.ocrApiKey}` } : {})
      },
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      throw new Error(`${OCR_FAILURE_CODES.EXTRACTOR_UNAVAILABLE}: request failed with status ${response.status}`);
    }

    const data = await response.json();
    return sanitizeExtractionResult(data, fallbackText);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`${OCR_FAILURE_CODES.EXTRACTOR_TIMEOUT}: OCR request timeout`);
    }

    throw error;
  } finally {
    cleanup();
  }
}

module.exports = {
  extractTextFromDocument
};
