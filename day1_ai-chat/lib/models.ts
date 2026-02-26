export interface ModelConfig {
  id: string;
  label: string;
  tier: 'weak' | 'medium' | 'strong';
  provider: 'deepseek' | 'openrouter';
  pricing: { input: number; output: number }; // per 1M tokens
  contextWindow: number; // max tokens the model accepts
}

export const MODELS: ModelConfig[] = [
  {
    id: 'google/gemma-3n-e2b-it:free',
    label: 'Gemma 3n 2B (Overflow Demo)',
    tier: 'weak',
    provider: 'openrouter',
    pricing: { input: 0, output: 0 },
    contextWindow: 8_192,
  },
  {
    id: 'arcee-ai/trinity-mini:free',
    label: 'Arcee Trinity Mini 3B (Weak)',
    tier: 'weak',
    provider: 'openrouter',
    pricing: { input: 0, output: 0 },
    contextWindow: 131_072,
  },
  {
    id: 'nvidia/nemotron-3-nano-30b-a3b:free',
    label: 'NVIDIA Nemotron Nano 3B (Medium)',
    tier: 'medium',
    provider: 'openrouter',
    pricing: { input: 0, output: 0 },
    contextWindow: 262_144,
  },
  {
    id: 'stepfun/step-3.5-flash:free',
    label: 'StepFun Step 3.5 Flash (Strong)',
    tier: 'strong',
    provider: 'openrouter',
    pricing: { input: 0, output: 0 },
    contextWindow: 262_144,
  },
  {
    id: 'deepseek-chat',
    label: 'DeepSeek Chat (Paid)',
    tier: 'strong',
    provider: 'deepseek',
    pricing: { input: 0.28, output: 0.42 },
    contextWindow: 128_000,
  },
];

export const DEFAULT_MODEL = MODELS[2].id; // NVIDIA Nemotron Nano
