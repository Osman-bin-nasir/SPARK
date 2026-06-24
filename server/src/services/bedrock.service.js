const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const { env, assertBedrockEnv } = require('../config/env');

let client = null;

function getClient() {
  if (client) {
    return client;
  }
  
  assertBedrockEnv();
  
  client = new BedrockRuntimeClient({
    region: env.awsBedrockRegion,
    credentials: {
      accessKeyId: env.awsBedrockAccessKeyId,
      secretAccessKey: env.awsBedrockSecretAccessKey
    }
  });
  
  return client;
}

/**
 * Generate a response using Amazon Bedrock Converse API
 * @param {Object} options 
 * @param {Array} [options.messages] - Standard style messages array [{ role: 'user', content: '...' }]
 * @param {String} [options.prompt] - Optional direct prompt string (if messages not provided)
 * @param {String} [options.systemPrompt] - Optional system prompt
 * @param {Number} [options.temperature] - Temperature for generation
 * @param {Number} [options.maxTokens] - Max tokens to generate
 */
async function generateResponse({ messages, prompt, systemPrompt, temperature = 0.7, maxTokens = 1000 }) {
  try {
    const bedrockClient = getClient();
    
    // Format messages for Converse API
    let converseMessages = [];
    if (messages && Array.isArray(messages) && messages.length > 0) {
      converseMessages = messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: [{ text: m.content }]
      }));
    } else if (prompt) {
      converseMessages = [{
        role: 'user',
        content: [{ text: prompt }]
      }];
    } else {
      throw new Error('Either messages or prompt must be provided');
    }

    const commandPayload = {
      modelId: env.awsBedrockModelId,
      messages: converseMessages,
      inferenceConfig: {
        maxTokens,
        temperature
      }
    };
    
    if (systemPrompt) {
      commandPayload.system = [{ text: systemPrompt }];
    }

    const command = new ConverseCommand(commandPayload);
    const response = await bedrockClient.send(command);
    
    return {
      text: response.output.message.content[0].text,
      usage: response.usage
    };
  } catch (error) {
    if (error.name === 'AccessDeniedException' || error.name === 'ValidationException' || error.name === 'ResourceNotFoundException') {
      console.error('AWS Bedrock Access Error:', error.message);
      throw new Error(`Bedrock Access Denied or Model Not Found. Please ensure that you have requested access to the model "${env.awsBedrockModelId}" in the AWS Console (Amazon Bedrock -> Model access). Original error: ${error.message}`);
    }
    throw error;
  }
}

module.exports = {
  generateResponse
};
