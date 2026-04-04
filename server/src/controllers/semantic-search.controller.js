const semanticSearchService = require('../services/semantic-search.service');

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }

  return false;
}

async function search(req, res, next) {
  try {
    const result = await semanticSearchService.semanticSearch({
      organizationId: req.organization.id,
      query: req.body?.query,
      topK: req.body?.top_k,
      minSimilarity: req.body?.min_similarity,
      minLexicalScore: req.body?.min_lexical_score,
      includePendingReview: parseBoolean(req.body?.include_pending_review),
      retrievalMode: req.body?.retrieval_mode
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  search
};
