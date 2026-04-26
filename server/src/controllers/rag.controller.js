const transactionService = require('../services/transaction.service');
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
    const searchResult = await transactionService.searchTransactions({
      organizationId: req.organization.id,
      payload: {
        ...req.body,
        include_pending_review: parseBoolean(req.body?.include_pending_review)
      }
    });

    const answerPayload = await ragService.composeAnswer({
      query: searchResult.query,
      items: searchResult.items
    });

    res.status(200).json({
      query: searchResult.query,
      retrieval: {
        mode: searchResult.mode,
        top_k: searchResult.top_k,
        include_pending_review: searchResult.include_pending_review,
        total: searchResult.total
      },
      items: searchResult.items,
      ...answerPayload
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  answer
};
