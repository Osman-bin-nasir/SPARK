const bedrockService = require('../services/bedrock.service');
const { HttpError } = require('../utils/http-error');

async function chat(req, res, next) {
  try {
    const { prompt, messages, systemPrompt, temperature, maxTokens } = req.body;

    if (!prompt && (!messages || !Array.isArray(messages) || messages.length === 0)) {
      throw new HttpError(400, 'Either "prompt" (string) or "messages" (array) must be provided.');
    }

    const response = await bedrockService.generateResponse({
      prompt,
      messages,
      systemPrompt,
      temperature: temperature !== undefined ? Number(temperature) : undefined,
      maxTokens: maxTokens !== undefined ? Number(maxTokens) : undefined
    });

    res.status(200).json({
      success: true,
      data: response
    });
  } catch (error) {
    if (error.message && error.message.includes('Bedrock Access Denied')) {
      next(new HttpError(403, error.message));
    } else {
      next(error);
    }
  }
}

module.exports = {
  chat
};
