const nlpQueryService = require('../services/nlp-query.service');

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }

  return false;
}

async function query(req, res, next) {
  try {
    const result = await nlpQueryService.planNaturalLanguageQuery({
      organizationId: req.organization.id,
      query: req.body?.query,
      topK: req.body?.top_k,
      minSimilarity: req.body?.min_similarity,
      minLexicalScore: req.body?.min_lexical_score,
      includePendingReview: parseBoolean(req.body?.include_pending_review),
      retrievalMode: req.body?.retrieval_mode,
      answerMode: req.body?.answer_mode
    });

    res.status(200).json({
      query: result.plan?.normalized_query || req.body?.query || '',
      plan: result.plan,
      intent: result.plan?.intent || null,
      mode: result.mode,
      answer: result.answer,
      confidence: result.confidence ?? null,
      citations: result.citations || [],
      summary: result.summary || null,
      search: result.search || null,
      current: result.current || null,
      previous: result.previous || null,
      delta: result.delta ?? null,
      percentage_change: result.percentage_change ?? null,
      comparison_label: result.comparison_label || null,
      trend_label: result.trend_label || null
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  query
};