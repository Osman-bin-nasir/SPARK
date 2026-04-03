const { env } = require('../config/env');
const transactionsRepository = require('../db/transactions.repository');
const { generateEmbedding } = require('../integrations/embeddings/embedding.client');
const { HttpError } = require('../utils/http-error');

const SUPPORTED_RETRIEVAL_MODES = ['vector', 'vectorless', 'hybrid'];

function parseSimilarity(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new HttpError(400, 'min_similarity must be a number between 0 and 1');
  }

  return parsed;
}

function parseTopK(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, 'top_k must be a positive integer');
  }

  return Math.min(parsed, env.ragMaxTopK);
}

function parseRetrievalMode(value) {
  const mode = String(value || env.ragRetrievalMode || 'vector').toLowerCase();

  if (!SUPPORTED_RETRIEVAL_MODES.includes(mode)) {
    throw new HttpError(400, 'retrieval_mode must be vector, vectorless, or hybrid');
  }

  return mode;
}

function parseLexicalScore(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, 'min_lexical_score must be a non-negative number');
  }

  return parsed;
}

function mergeHybridResults(vectorItems, lexicalItems, topK) {
  const merged = new Map();
  const maxLexical = lexicalItems.reduce((max, item) => Math.max(max, Number(item.lexical_score || 0)), 0) || 1;

  for (const item of vectorItems) {
    merged.set(item.id, {
      ...item,
      score_vector: Number(item.similarity_score || 0),
      score_lexical: 0
    });
  }

  for (const item of lexicalItems) {
    const existing = merged.get(item.id);
    const lexicalNormalized = Number(item.lexical_score || 0) / maxLexical;

    if (!existing) {
      merged.set(item.id, {
        ...item,
        score_vector: 0,
        score_lexical: lexicalNormalized
      });
      continue;
    }

    merged.set(item.id, {
      ...existing,
      score_lexical: Math.max(existing.score_lexical || 0, lexicalNormalized)
    });
  }

  return [...merged.values()]
    .map((item) => {
      const hybridScore = Number(((0.7 * (item.score_vector || 0)) + (0.3 * (item.score_lexical || 0))).toFixed(6));
      return {
        ...item,
        similarity_score: hybridScore,
        retrieval_signal: {
          vector: Number((item.score_vector || 0).toFixed(6)),
          lexical: Number((item.score_lexical || 0).toFixed(6)),
          hybrid: hybridScore
        }
      };
    })
    .sort((left, right) => right.similarity_score - left.similarity_score)
    .slice(0, topK);
}

async function semanticSearch({
  organizationId,
  query,
  topK,
  minSimilarity,
  minLexicalScore,
  includePendingReview,
  retrievalMode
}) {
  const normalizedQuery = String(query || '').trim();

  if (!normalizedQuery) {
    throw new HttpError(400, 'query is required');
  }

  if (normalizedQuery.length > env.ragMaxQueryChars) {
    throw new HttpError(400, `query must be at most ${env.ragMaxQueryChars} characters`);
  }

  const resolvedTopK = parseTopK(topK, env.ragDefaultTopK);
  const resolvedMinSimilarity = parseSimilarity(minSimilarity, env.ragMinSimilarity);
  const resolvedMinLexicalScore = parseLexicalScore(minLexicalScore, env.ragMinLexicalScore);
  const resolvedRetrievalMode = parseRetrievalMode(retrievalMode);
  let items = [];

  if (resolvedRetrievalMode === 'vector') {
    const queryEmbedding = await generateEmbedding(normalizedQuery);
    items = await transactionsRepository.findTransactionsBySimilarity({
      organizationId,
      queryEmbedding,
      topK: resolvedTopK,
      minSimilarity: resolvedMinSimilarity,
      includePendingReview: Boolean(includePendingReview)
    });
  } else if (resolvedRetrievalMode === 'vectorless') {
    items = await transactionsRepository.findTransactionsByKeywordSearch({
      organizationId,
      query: normalizedQuery,
      topK: resolvedTopK,
      minLexicalScore: resolvedMinLexicalScore,
      includePendingReview: Boolean(includePendingReview)
    });
  } else {
    const queryEmbedding = await generateEmbedding(normalizedQuery);
    const [vectorItems, lexicalItems] = await Promise.all([
      transactionsRepository.findTransactionsBySimilarity({
        organizationId,
        queryEmbedding,
        topK: resolvedTopK,
        minSimilarity: resolvedMinSimilarity,
        includePendingReview: Boolean(includePendingReview)
      }),
      transactionsRepository.findTransactionsByKeywordSearch({
        organizationId,
        query: normalizedQuery,
        topK: resolvedTopK,
        minLexicalScore: resolvedMinLexicalScore,
        includePendingReview: Boolean(includePendingReview)
      })
    ]);

    items = mergeHybridResults(vectorItems, lexicalItems, resolvedTopK);
  }

  return {
    query: normalizedQuery,
    retrieval_mode: resolvedRetrievalMode,
    top_k: resolvedTopK,
    min_similarity: resolvedMinSimilarity,
    min_lexical_score: resolvedMinLexicalScore,
    include_pending_review: Boolean(includePendingReview),
    total: items.length,
    items
  };
}

module.exports = {
  semanticSearch
};
