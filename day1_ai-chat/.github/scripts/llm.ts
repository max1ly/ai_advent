// .github/scripts/llm.ts

// --- Types ---

export interface ReviewComment {
  file: string;
  line: number;
  severity: 'bug' | 'architecture' | 'recommendation';
  comment: string;
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  error?: { message: string };
}

// --- JSON Schema for structured output ---

const REVIEW_SCHEMA = {
  name: 'code_review',
  strict: true,
  schema: {
    type: 'object' as const,
    properties: {
      comments: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            file: { type: 'string' as const },
            line: { type: 'number' as const },
            severity: { type: 'string' as const, enum: ['bug', 'architecture', 'recommendation'] },
            comment: { type: 'string' as const },
          },
          required: ['file', 'line', 'severity', 'comment'] as const,
          additionalProperties: false,
        },
      },
    },
    required: ['comments'] as const,
    additionalProperties: false,
  },
};

// --- Review prompt ---

const REVIEW_PROMPT = `You are a senior code reviewer. Analyze this file's diff with project context.

For each issue found, respond with JSON matching the provided schema.

Focus on:
1. Potential bugs — logic errors, edge cases, null/undefined risks
2. Architectural issues — coupling, naming, patterns
3. Recommendations — improvements, simplifications

Rules:
- Reference specific line numbers from the diff
- Max 5 comments per file
- Skip praise — issues and improvements only
- If the file looks clean, return {"comments": []}
- Include RAG context references when relevant`;

// --- API client ---

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function reviewFile(
  filename: string,
  patch: string,
  ragContext: string,
): Promise<ReviewComment[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('\x1b[31m[LLM]\x1b[0m OPENROUTER_API_KEY not set');
    return [];
  }

  const model = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-nano-30b-a3b:free';
  const userContent = ragContext
    ? `## Project Context\n\n${ragContext}\n\n## File: ${filename}\n\n\`\`\`diff\n${patch}\n\`\`\``
    : `## File: ${filename}\n\n\`\`\`diff\n${patch}\n\`\`\``;

  const messages: ChatMessage[] = [
    { role: 'system', content: REVIEW_PROMPT },
    { role: 'user', content: userContent },
  ];

  console.log(`\x1b[36m[LLM]\x1b[0m Reviewing ${filename} with ${model}...`);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        response_format: { type: 'json_schema', json_schema: REVIEW_SCHEMA },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`\x1b[31m[LLM]\x1b[0m API error (${response.status}): ${errText}`);
      return [];
    }

    const data = (await response.json()) as OpenRouterResponse;

    if (data.error) {
      console.error(`\x1b[31m[LLM]\x1b[0m API error: ${data.error.message}`);
      return [];
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error('\x1b[31m[LLM]\x1b[0m Empty response from API');
      return [];
    }

    // Parse JSON — strict schema should guarantee valid JSON, but be safe
    try {
      const parsed = JSON.parse(content) as { comments: ReviewComment[] };
      console.log(`\x1b[32m[LLM]\x1b[0m Got ${parsed.comments.length} comments for ${filename}`);
      return parsed.comments;
    } catch {
      console.error(`\x1b[31m[LLM]\x1b[0m Failed to parse JSON response for ${filename}`);
      console.error(`\x1b[31m[LLM]\x1b[0m Raw content: ${content.slice(0, 200)}`);
      return [];
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\x1b[31m[LLM]\x1b[0m Request failed for ${filename}: ${msg}`);
    return [];
  }
}
