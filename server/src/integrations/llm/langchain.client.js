const { env } = require('../../config/env');

function withTimeout(promise, timeoutMs) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('LangChain generation timeout')), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

async function generateWithLangChain({ question, context }) {
  let ChatOllama;
  let HumanMessage;
  let SystemMessage;

  try {
    ({ ChatOllama } = require('@langchain/ollama'));
    ({ HumanMessage, SystemMessage } = require('@langchain/core/messages'));
  } catch (_error) {
    throw new Error('LangChain dependencies are missing. Install @langchain/ollama and @langchain/core.');
  }

  if (!env.ragOllamaBaseUrl) {
    throw new Error('RAG_OLLAMA_BASE_URL is not configured');
  }

  const llm = new ChatOllama({
    baseUrl: env.ragOllamaBaseUrl,
    model: env.ragOllamaModel,
    temperature: 0.1
  });

  const systemPrompt = 'You are a finance assistant. Use only provided context. If evidence is insufficient, say so explicitly.';
  const userPrompt = `Question: ${question}\n\nContext:\n${context}\n\nReturn a concise factual answer.`;

  const response = await withTimeout(
    llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ]),
    env.ragLlmTimeoutMs
  );

  const content = typeof response?.content === 'string'
    ? response.content
    : Array.isArray(response?.content)
      ? response.content.map((entry) => (typeof entry?.text === 'string' ? entry.text : '')).join(' ').trim()
      : '';

  if (!content) {
    throw new Error('LangChain returned an empty response');
  }

  return content.trim();
}

module.exports = {
  generateWithLangChain
};
