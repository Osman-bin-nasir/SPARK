const { env } = require('../../config/env');

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer)
  };
}

async function callPythonEmbedding(input) {
  if (!env.pythonAiUrl) {
    throw new Error('PYTHON_AI_URL is not configured');
  }

  const { signal, cleanup } = createTimeoutSignal(env.pythonAiTimeoutMs);

  try {
    const response = await fetch(`${env.pythonAiUrl.replace(/\/$/, '')}/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input,
        model_id: env.pythonAiEmbeddingModelId,
        device: env.pythonAiDevice
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(`Python AI embedding request failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Python AI embedding request timeout');
    }

    throw error;
  } finally {
    cleanup();
  }
}

async function callPythonGeneration({ prompt, query, context, sources }) {
  if (!env.pythonAiUrl) {
    throw new Error('PYTHON_AI_URL is not configured');
  }

  const { signal, cleanup } = createTimeoutSignal(env.pythonAiGenerationTimeoutMs);

  try {
    const response = await fetch(`${env.pythonAiUrl.replace(/\/$/, '')}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        query,
        context,
        sources,
        model_id: env.pythonAiChatModelId,
        max_new_tokens: env.pythonAiMaxNewTokens,
        temperature: env.pythonAiTemperature,
        top_p: env.pythonAiTopP,
        device: env.pythonAiDevice,
        dtype: env.pythonAiDtype
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(`Python AI generation request failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Python AI generation request timeout');
    }

    throw error;
  } finally {
    cleanup();
  }
}

module.exports = {
  callPythonEmbedding,
  callPythonGeneration
};
