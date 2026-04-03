const test = require('node:test');
const assert = require('node:assert/strict');

const { env } = require('../src/config/env');
const semanticSearchService = require('../src/services/semantic-search.service');
const ragService = require('../src/services/rag.service');

const originalEnv = {
  ragMaxQueryChars: env.ragMaxQueryChars,
  ragRequireCitations: env.ragRequireCitations,
  ragMinGenerationConfidence: env.ragMinGenerationConfidence,
  ragMaxAnswerChars: env.ragMaxAnswerChars,
  ragMaxEvidenceItems: env.ragMaxEvidenceItems,
  ragAnswerMode: env.ragAnswerMode
};

test('semantic search rejects oversized queries', async () => {
  env.ragMaxQueryChars = 10;

  await assert.rejects(
    () => semanticSearchService.semanticSearch({
      organizationId: 'org-1',
      query: 'this query is too long',
      topK: 5,
      minSimilarity: 0.6,
      includePendingReview: false,
      retrievalMode: 'vector'
    }),
    /must be at most 10 characters/
  );
});

test('deterministic answer remains stable for empty results', async () => {
  const result = ragService.composeDeterministicAnswer({
    query: 'coffee',
    items: []
  });

  assert.equal(result.answer, 'No matching transactions were found for this query.');
  assert.equal(result.citations.length, 0);
  assert.equal(result.confidence, 0);
});

test('rag answer falls back when sllm is unavailable', async () => {
  env.ragAnswerMode = 'sllm';
  env.ragRequireCitations = true;
  env.ragMinGenerationConfidence = 0.65;
  env.ragMaxAnswerChars = 1200;
  env.ragMaxEvidenceItems = 12;

  const result = await ragService.composeAnswer({
    query: 'coffee',
    items: [
      {
        id: 'tx-1',
        amount: 10,
        vendor: 'Cafe',
        category: 'Meals',
        transaction_date: '2026-04-01',
        similarity_score: 0.9,
        document: {
          id: 'doc-1',
          extracted_text: 'Coffee receipt'
        }
      }
    ],
    answerMode: 'sllm'
  });

  assert.equal(result.generation_mode, 'deterministic_fallback');
});

test.after(() => {
  env.ragMaxQueryChars = originalEnv.ragMaxQueryChars;
  env.ragRequireCitations = originalEnv.ragRequireCitations;
  env.ragMinGenerationConfidence = originalEnv.ragMinGenerationConfidence;
  env.ragMaxAnswerChars = originalEnv.ragMaxAnswerChars;
  env.ragMaxEvidenceItems = originalEnv.ragMaxEvidenceItems;
  env.ragAnswerMode = originalEnv.ragAnswerMode;
});
