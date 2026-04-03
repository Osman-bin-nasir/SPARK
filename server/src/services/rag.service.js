const { env } = require('../config/env');
const { callPythonGeneration } = require('../integrations/python-ai/python-ai.client');

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

function buildContextForGeneration(items, query) {
  const lines = [
    `query: ${query}`,
    `match_count: ${items.length}`
  ];

  for (const item of items.slice(0, env.ragMaxEvidenceItems)) {
    lines.push(
      `- tx_id=${item.id}, vendor=${item.vendor || ''}, category=${item.category || ''}, amount=${toNumber(item.amount).toFixed(2)}, date=${item.transaction_date || ''}, score=${toNumber(item.similarity_score).toFixed(4)}`
    );
  }

  return lines.join('\n');
}

function parseAnswerMode(value) {
  const mode = String(value || env.ragAnswerMode || 'deterministic').toLowerCase();
  return mode === 'sllm' ? 'sllm' : 'deterministic';
}

async function generateSllmAnswer({ query, items }) {
  const context = buildContextForGeneration(items, query);
  const sources = items.slice(0, env.ragMaxEvidenceItems).map((item) => ({
    transaction_id: item.id,
    document_id: item.document?.id || null,
    vendor: item.vendor,
    category: item.category,
    amount: item.amount,
    transaction_date: item.transaction_date,
    similarity_score: item.similarity_score,
    extracted_text: item.document?.extracted_text || null,
    text_content: item.document?.text_content || null
  }));

  const prompt = [
    'You are a startup finance assistant.',
    'Use only the provided context and avoid fabrication.',
    'If evidence is weak, say evidence is insufficient.',
    'Return a concise answer with no markdown tables.',
    '',
    context,
    '',
    `Question: ${query}`,
    'Answer:'
  ].join('\n');

  const response = await callPythonGeneration({
    prompt,
    query,
    context,
    sources
  });

  const generated = typeof response?.answer === 'string'
    ? response.answer.trim()
    : typeof response?.response === 'string'
      ? response.response.trim()
      : '';
  const responseConfidence = Number(response?.confidence);
  const citedIds = Array.isArray(response?.cited_transaction_ids)
    ? response.cited_transaction_ids.filter((value) => typeof value === 'string' && value.trim())
    : [];
  const answer = generated.slice(0, env.ragMaxAnswerChars);

  if (!answer) {
    throw new Error('Python AI generation returned an empty response');
  }

  const hasRequiredCitations = !env.ragRequireCitations || citedIds.length > 0;
  const meetsConfidence = Number.isFinite(responseConfidence) && responseConfidence >= env.ragMinGenerationConfidence;
  const refusal = Boolean(response?.refusal) || !hasRequiredCitations || !meetsConfidence;

  return {
    answer,
    confidence: Number.isFinite(responseConfidence) ? responseConfidence : 0,
    refusal,
    guardrail_reason: response?.guardrail_reason || (!hasRequiredCitations ? 'missing_citations' : (!meetsConfidence ? 'low_confidence' : null)),
    cited_transaction_ids: citedIds,
    raw_model_answer: generated,
    raw_model_response: response
  };
}

async function composeAnswer({ query, items, answerMode }) {
  const deterministic = composeDeterministicAnswer({ query, items });
  const resolvedMode = parseAnswerMode(answerMode);

  if (resolvedMode === 'deterministic') {
    return {
      ...deterministic,
      generation_mode: 'deterministic'
    };
  }

  try {
    const generated = await generateSllmAnswer({ query, items });

    if (generated.refusal || !generated.cited_transaction_ids.length || generated.confidence < env.ragMinGenerationConfidence) {
      return {
        ...deterministic,
        generation_mode: 'deterministic_fallback',
        generation_guardrail_refusal: true,
        generation_guardrail_reason: generated.guardrail_reason || 'guardrail_failed'
      };
    }

    return {
      ...deterministic,
      answer: generated.answer,
      confidence: generated.confidence,
      citations: generated.citations,
      generation_mode: 'sllm_local_model',
      generation_guardrail_refusal: generated.refusal,
      generation_guardrail_reason: generated.guardrail_reason,
      generation_cited_transaction_ids: generated.cited_transaction_ids,
      generation_raw_model_answer: generated.raw_model_answer
    };
  } catch (error) {
    return {
      ...deterministic,
      generation_mode: 'deterministic_fallback',
      generation_fallback_reason: error.message
    };
  }
}

module.exports = {
  composeAnswer,
  composeDeterministicAnswer
};
