function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function summarizeByKey(items, key) {
  const counts = new Map();

  for (const item of items) {
    const raw = item?.[key];
    const normalized = typeof raw === 'string' ? raw.trim() : '';

    if (!normalized) {
      continue;
    }

    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

function buildCitations(items) {
  return items.map((item) => ({
    transaction_id: item.id,
    document_id: item.document?.id || null,
    vendor: item.vendor,
    amount: toNumber(item.amount),
    category: item.category,
    transaction_date: item.transaction_date,
    similarity_score: toNumber(item.similarity_score)
  }));
}

function composeDeterministicAnswer({ query, items }) {
  if (!items.length) {
    return {
      answer: 'No matching transactions were found for this query.',
      confidence: 0,
      stats: {
        total_matches: 0,
        total_amount: 0,
        average_similarity: 0
      },
      citations: []
    };
  }

  const totalAmount = items.reduce((sum, item) => sum + toNumber(item.amount), 0);
  const averageSimilarity = items.reduce((sum, item) => sum + toNumber(item.similarity_score), 0) / items.length;
  const topVendors = summarizeByKey(items, 'vendor').slice(0, 3);
  const topCategories = summarizeByKey(items, 'category').slice(0, 3);

  const answerParts = [
    `Found ${items.length} matching transaction(s) for query "${query}".`,
    `Total amount across matches is ${totalAmount.toFixed(2)}.`,
    topVendors.length > 0
      ? `Most frequent vendor is ${topVendors[0][0]} (${topVendors[0][1]} match(es)).`
      : 'No vendor signal was identified in the matches.',
    topCategories.length > 0
      ? `Top category is ${topCategories[0][0]} (${topCategories[0][1]} match(es)).`
      : 'No category signal was identified in the matches.'
  ];

  return {
    answer: answerParts.join(' '),
    confidence: Number(averageSimilarity.toFixed(4)),
    stats: {
      total_matches: items.length,
      total_amount: Number(totalAmount.toFixed(2)),
      average_similarity: Number(averageSimilarity.toFixed(4)),
      top_vendors: topVendors.map(([name, count]) => ({ name, count })),
      top_categories: topCategories.map(([name, count]) => ({ name, count }))
    },
    citations: buildCitations(items)
  };
}

async function composeAnswer({ query, items }) {
  const deterministic = composeDeterministicAnswer({ query, items });
  return {
    ...deterministic,
    generation_mode: 'deterministic'
  };
}

module.exports = {
  composeAnswer,
  composeDeterministicAnswer
};
