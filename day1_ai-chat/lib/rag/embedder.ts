import { Ollama } from 'ollama';

const MODEL = 'nomic-embed-text';

let ollamaClient: Ollama | null = null;
let modelReady = false;

function getClient(): Ollama {
  if (!ollamaClient) {
    ollamaClient = new Ollama({
      host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    });
  }
  return ollamaClient;
}

/**
 * Ensure the embedding model is pulled and available.
 * Auto-pulls on first use if not present.
 */
export async function ensureModel(): Promise<void> {
  if (modelReady) return;

  const client = getClient();

  try {
    const { models } = await client.list();
    const hasModel = models.some(m => m.name.startsWith(MODEL));

    if (!hasModel) {
      console.log(`[RAG] Pulling ${MODEL}... this may take a minute`);
      await client.pull({ model: MODEL });
      console.log(`[RAG] ${MODEL} ready`);
    } else {
      console.log(`[RAG] ${MODEL} already available`);
    }

    modelReady = true;
  } catch (err) {
    throw new Error(
      `Cannot connect to Ollama at ${process.env.OLLAMA_HOST || 'http://localhost:11434'}. ` +
      `Is it running? Start with: docker compose up -d\n${err}`,
    );
  }
}

/**
 * Embed multiple texts in a single batch call.
 * Returns array of embedding vectors.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  await ensureModel();
  const client = getClient();

  try {
    const response = await client.embed({
      model: MODEL,
      input: texts,
    });

    return response.embeddings;
  } catch (err) {
    throw new Error(`Failed to embed ${texts.length} texts: ${err}`);
  }
}

/**
 * Embed a single text string.
 */
export async function embedSingle(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}
