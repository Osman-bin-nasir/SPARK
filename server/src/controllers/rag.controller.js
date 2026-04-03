const semanticSearchService = require('../services/semantic-search.service');
const ragService = require('../services/rag.service');

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }

  return false;
}

async function answer(req, res, next) {
  try {
    const searchResult = await semanticSearchService.semanticSearch({
      organizationId: req.organization.id,
      query: req.body?.query,
      topK: req.body?.top_k,
      minSimilarity: req.body?.min_similarity,
      minLexicalScore: req.body?.min_lexical_score,
      includePendingReview: parseBoolean(req.body?.include_pending_review),
      retrievalMode: req.body?.retrieval_mode
    });

    const answerPayload = await ragService.composeAnswer({
      query: searchResult.query,
      items: searchResult.items,
      answerMode: req.body?.answer_mode
    });

    res.status(200).json({
      query: searchResult.query,
      retrieval: {
        mode: searchResult.retrieval_mode,
        top_k: searchResult.top_k,
        min_similarity: searchResult.min_similarity,
        min_lexical_score: searchResult.min_lexical_score,
        include_pending_review: searchResult.include_pending_review,
        total: searchResult.total
      },
      ...answerPayload
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  answer
};
