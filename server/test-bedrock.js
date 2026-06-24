const { generateResponse } = require('./src/services/bedrock.service');

async function main() {
  console.log('Testing Bedrock Configuration...');
  try {
    const response = await generateResponse({
      prompt: "Hello Claude! Tell me a one-sentence joke about computers.",
      temperature: 0.5,
      maxTokens: 100
    });
    
    console.log('\n--- SUCCESS! ---');
    console.log('Response from Bedrock:\n', response.text);
    console.log('\nUsage:', JSON.stringify(response.usage, null, 2));
  } catch (error) {
    console.error('\n--- TEST FAILED ---');
    console.error(error.message);
  }
}

main();
