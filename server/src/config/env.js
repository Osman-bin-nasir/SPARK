require('dotenv').config();

const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || '',
  refreshJwtSecret: process.env.REFRESH_JWT_SECRET || process.env.JWT_SECRET || '',
  telegramJwtSecret: process.env.TELEGRAM_JWT_SECRET || process.env.JWT_SECRET || '',
  accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  telegramLoginExpiresIn: '10m',
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || 'osman80bot',
  appBaseUrl,
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || '',
  googleOauthStateSecret: process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.JWT_SECRET || '',
  googleOauthStateExpiresIn: process.env.GOOGLE_OAUTH_STATE_EXPIRES_IN || '10m',
  googleTokenEncryptionKey: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || '',
  googleDrivePostConnectUrl: process.env.GOOGLE_DRIVE_POST_CONNECT_URL || `${appBaseUrl.replace(/\/$/, '')}/integrations`,
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  ingestionMaxBodyBytes: Number(process.env.INGESTION_MAX_BODY_BYTES || 15728640),
  embeddingProvider: process.env.EMBEDDING_PROVIDER || 'local',
  embeddingApiUrl: process.env.EMBEDDING_API_URL || '',
  embeddingApiKey: process.env.EMBEDDING_API_KEY || '',
  embeddingWorkerIntervalMs: Number(process.env.EMBEDDING_WORKER_INTERVAL_MS || 30000),
  embeddingBackfillBatchSize: Number(process.env.EMBEDDING_BACKFILL_BATCH_SIZE || 0),
  orphanCleanupIntervalMs: Number(process.env.ORPHAN_CLEANUP_INTERVAL_MS || 60000),
  ocrApiUrl: process.env.OCR_API_URL || '',
  ocrApiKey: process.env.OCR_API_KEY || '',
  ocrRequestTimeoutMs: Number(process.env.OCR_REQUEST_TIMEOUT_MS || 10000),
  ocrConfidenceThreshold: Number(process.env.OCR_CONFIDENCE_THRESHOLD || 0.8),
  ocrMaxExtractedTextChars: Number(process.env.OCR_MAX_EXTRACTED_TEXT_CHARS || 12000),
  ragDefaultTopK: Number(process.env.RAG_DEFAULT_TOP_K || 5),
  ragMaxTopK: Number(process.env.RAG_MAX_TOP_K || 20),
  ragMinSimilarity: Number(process.env.RAG_MIN_SIMILARITY || 0.6),
  ragMinLexicalScore: Number(process.env.RAG_MIN_LEXICAL_SCORE || 0),
  ragRetrievalMode: process.env.RAG_RETRIEVAL_MODE || 'vector',
  ragAnswerMode: process.env.RAG_ANSWER_MODE || 'deterministic',
  ragUseLangchain: String(process.env.RAG_USE_LANGCHAIN || 'false').toLowerCase() === 'true',
  ragLlmTimeoutMs: Number(process.env.RAG_LLM_TIMEOUT_MS || 20000),
  ragMinGenerationConfidence: Number(process.env.RAG_MIN_GENERATION_CONFIDENCE || 0.65),
  ragMaxAnswerChars: Number(process.env.RAG_MAX_ANSWER_CHARS || 1200),
  ragMaxEvidenceItems: Number(process.env.RAG_MAX_EVIDENCE_ITEMS || 12),
  ragMaxQueryChars: Number(process.env.RAG_MAX_QUERY_CHARS || 512),
  ragRequireCitations: String(process.env.RAG_REQUIRE_CITATIONS || 'true').toLowerCase() === 'true',
  ragOllamaBaseUrl: process.env.RAG_OLLAMA_BASE_URL || '',
  ragOllamaModel: process.env.RAG_OLLAMA_MODEL || 'llama3.1:8b',
  pythonAiUrl: process.env.PYTHON_AI_URL || '',
  pythonAiEmbeddingModelId: process.env.PYTHON_AI_EMBED_MODEL_ID || 'sentence-transformers/all-MiniLM-L6-v2',
  pythonAiChatModelId: process.env.PYTHON_AI_CHAT_MODEL_ID || 'Qwen/Qwen2.5-1.5B-Instruct',
  pythonAiDevice: process.env.PYTHON_AI_DEVICE || 'cpu',
  pythonAiDtype: process.env.PYTHON_AI_DTYPE || 'auto',
  pythonAiMaxNewTokens: Number(process.env.PYTHON_AI_MAX_NEW_TOKENS || 256),
  pythonAiTemperature: Number(process.env.PYTHON_AI_TEMPERATURE || 0.2),
  pythonAiTopP: Number(process.env.PYTHON_AI_TOP_P || 0.9),
  pythonAiGenerationTimeoutMs: Number(process.env.PYTHON_AI_GENERATION_TIMEOUT_MS || 30000),
  pythonAiTimeoutMs: Number(process.env.PYTHON_AI_TIMEOUT_MS || 30000)
};

function validateEnv() {
  const missing = [];

  if (!env.databaseUrl) {
    missing.push('DATABASE_URL');
  }

  if (!env.jwtSecret) {
    missing.push('JWT_SECRET');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (env.ocrConfidenceThreshold < 0 || env.ocrConfidenceThreshold > 1) {
    throw new Error('OCR_CONFIDENCE_THRESHOLD must be between 0 and 1');
  }

  if (!Number.isInteger(env.ocrMaxExtractedTextChars) || env.ocrMaxExtractedTextChars <= 0) {
    throw new Error('OCR_MAX_EXTRACTED_TEXT_CHARS must be a positive integer');
  }

  if (!Number.isInteger(env.ocrRequestTimeoutMs) || env.ocrRequestTimeoutMs <= 0) {
    throw new Error('OCR_REQUEST_TIMEOUT_MS must be a positive integer');
  }

  if (!Number.isInteger(env.embeddingBackfillBatchSize) || env.embeddingBackfillBatchSize < 0) {
    throw new Error('EMBEDDING_BACKFILL_BATCH_SIZE must be a non-negative integer');
  }

  if (!Number.isInteger(env.ragDefaultTopK) || env.ragDefaultTopK <= 0) {
    throw new Error('RAG_DEFAULT_TOP_K must be a positive integer');
  }

  if (!Number.isInteger(env.ragMaxTopK) || env.ragMaxTopK <= 0) {
    throw new Error('RAG_MAX_TOP_K must be a positive integer');
  }

  if (env.ragDefaultTopK > env.ragMaxTopK) {
    throw new Error('RAG_DEFAULT_TOP_K cannot be greater than RAG_MAX_TOP_K');
  }

  if (env.ragMinSimilarity < 0 || env.ragMinSimilarity > 1) {
    throw new Error('RAG_MIN_SIMILARITY must be between 0 and 1');
  }

  if (!Number.isFinite(env.ragMinLexicalScore) || env.ragMinLexicalScore < 0) {
    throw new Error('RAG_MIN_LEXICAL_SCORE must be a non-negative number');
  }

  if (!['vector', 'vectorless', 'hybrid'].includes(String(env.ragRetrievalMode).toLowerCase())) {
    throw new Error('RAG_RETRIEVAL_MODE must be vector, vectorless, or hybrid');
  }

  if (!['deterministic', 'sllm'].includes(String(env.ragAnswerMode).toLowerCase())) {
    throw new Error('RAG_ANSWER_MODE must be deterministic or sllm');
  }

  if (!Number.isInteger(env.ragLlmTimeoutMs) || env.ragLlmTimeoutMs <= 0) {
    throw new Error('RAG_LLM_TIMEOUT_MS must be a positive integer');
  }

  if (env.ragMinGenerationConfidence < 0 || env.ragMinGenerationConfidence > 1) {
    throw new Error('RAG_MIN_GENERATION_CONFIDENCE must be between 0 and 1');
  }

  if (!Number.isInteger(env.ragMaxAnswerChars) || env.ragMaxAnswerChars <= 0) {
    throw new Error('RAG_MAX_ANSWER_CHARS must be a positive integer');
  }

  if (!Number.isInteger(env.ragMaxEvidenceItems) || env.ragMaxEvidenceItems <= 0) {
    throw new Error('RAG_MAX_EVIDENCE_ITEMS must be a positive integer');
  }

  if (!Number.isInteger(env.ragMaxQueryChars) || env.ragMaxQueryChars <= 0) {
    throw new Error('RAG_MAX_QUERY_CHARS must be a positive integer');
  }

  if (!Number.isInteger(env.pythonAiTimeoutMs) || env.pythonAiTimeoutMs <= 0) {
    throw new Error('PYTHON_AI_TIMEOUT_MS must be a positive integer');
  }

  if (!Number.isInteger(env.pythonAiGenerationTimeoutMs) || env.pythonAiGenerationTimeoutMs <= 0) {
    throw new Error('PYTHON_AI_GENERATION_TIMEOUT_MS must be a positive integer');
  }

  if (!Number.isInteger(env.pythonAiMaxNewTokens) || env.pythonAiMaxNewTokens <= 0) {
    throw new Error('PYTHON_AI_MAX_NEW_TOKENS must be a positive integer');
  }

  if (env.pythonAiTemperature < 0 || env.pythonAiTemperature > 2) {
    throw new Error('PYTHON_AI_TEMPERATURE must be between 0 and 2');
  }

  if (env.pythonAiTopP <= 0 || env.pythonAiTopP > 1) {
    throw new Error('PYTHON_AI_TOP_P must be between 0 and 1');
  }
}

function assertGoogleDriveEnv() {
  const missing = [];

  if (!env.googleClientId) {
    missing.push('GOOGLE_CLIENT_ID');
  }

  if (!env.googleClientSecret) {
    missing.push('GOOGLE_CLIENT_SECRET');
  }

  if (!env.googleRedirectUri) {
    missing.push('GOOGLE_REDIRECT_URI');
  }

  if (!env.googleTokenEncryptionKey) {
    missing.push('GOOGLE_TOKEN_ENCRYPTION_KEY');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required Google Drive environment variables: ${missing.join(', ')}`);
  }
}

function assertWebhookEnv() {
  if (!env.webhookSecret) {
    throw new Error('Missing required environment variable: WEBHOOK_SECRET');
  }
}

module.exports = {
  assertGoogleDriveEnv,
  assertWebhookEnv,
  env,
  validateEnv
};
