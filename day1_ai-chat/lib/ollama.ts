import { createOpenAI } from '@ai-sdk/openai';

export const ollama = createOpenAI({
  baseURL: (process.env.OLLAMA_HOST || 'http://localhost:11434') + '/v1',
  apiKey: 'ollama', // Ollama doesn't need a key, but the SDK requires one
});
