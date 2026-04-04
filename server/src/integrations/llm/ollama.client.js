const { env } = require('../../config/env');

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer)
  };
}

async function generateWithOllama({ prompt, temperature = 0.1 }) {
  if (!env.ragOllamaBaseUrl) {
    throw new Error('RAG_OLLAMA_BASE_URL is not configured');
  }

  const { signal, cleanup } = createTimeoutSignal(env.ragLlmTimeoutMs);

  try {
    const response = await fetch(`${env.ragOllamaBaseUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: env.ragOllamaModel,
        prompt,
        stream: false,
        options: {
          temperature
        }
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (typeof data?.response !== 'string' || !data.response.trim()) {
      throw new Error('Ollama returned an empty response');
    }

    return data.response.trim();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Ollama request timeout');
    }

    throw error;
  } finally {
    cleanup();
  }
}

module.exports = {
  generateWithOllama
};
