export interface ModelConfig {
  id: string;
  label: string;
  tier: 'weak' | 'medium' | 'strong';
  provider: 'deepseek' | 'openrouter' | 'ollama';
  pricing: { input: number; output: number }; // per 1M tokens
  contextWindow: number; // max tokens the model accepts
  temperature?: number; // per-model default (omit = provider default)
  maxOutputTokens?: number; // per-model output cap (omit = provider default)
}

export const MODELS: ModelConfig[] = [
  {
    id: 'llama3.2:3b',
    label: 'Llama 3.2 3B (Local / Ollama)',
    tier: 'weak',
    provider: 'ollama',
    pricing: { input: 0, output: 0 },
    contextWindow: 8_192, // Q4_K_M quantized limit (NOT 128K — only FP16 gets that)
    temperature: 0.3,
    maxOutputTokens: 1024,
  },
  {
    id: 'google/gemma-3n-e2b-it:free',
    label: 'Gemma 3n 2B (Overflow Demo)',
    tier: 'weak',
    provider: 'openrouter',
    pricing: { input: 0, output: 0 },
    contextWindow: 8_192,
    temperature: 0.5,
    maxOutputTokens: 1024,
  },
  {
    id: 'arcee-ai/trinity-mini:free',
    label: 'Arcee Trinity Mini 3B (Weak)',
    tier: 'weak',
    provider: 'openrouter',
    pricing: { input: 0, output: 0 },
    contextWindow: 131_072,
    temperature: 0.5,
    maxOutputTokens: 1024,
  },
  {
    id: 'nvidia/nemotron-3-nano-30b-a3b:free',
    label: 'NVIDIA Nemotron Nano 3B (Medium)',
    tier: 'medium',
    provider: 'openrouter',
    pricing: { input: 0, output: 0 },
    contextWindow: 262_144,
    temperature: 0.7,
    maxOutputTokens: 2048,
  },
  {
    id: 'stepfun/step-3.5-flash:free',
    label: 'StepFun Step 3.5 Flash (Strong)',
    tier: 'strong',
    provider: 'openrouter',
    pricing: { input: 0, output: 0 },
    contextWindow: 262_144,
    temperature: 0.7,
    maxOutputTokens: 2048,
  },
  {
    id: 'deepseek-chat',
    label: 'DeepSeek Chat (Paid)',
    tier: 'strong',
    provider: 'deepseek',
    pricing: { input: 0.28, output: 0.42 },
    contextWindow: 128_000,
    temperature: 0.7,
    maxOutputTokens: 2048,
  },
];

export const DEFAULT_MODEL = MODELS[3].id; // NVIDIA Nemotron Nano
