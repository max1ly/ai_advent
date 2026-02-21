export interface ModelConfig {
  id: string;
  label: string;
  tier: 'weak' | 'medium' | 'strong';
  provider: 'deepseek' | 'openrouter';
  pricing: { input: number; output: number }; // per 1M tokens
}

export const MODELS: ModelConfig[] = [
  {
    id: 'arcee-ai/trinity-mini:free',
    label: 'Arcee Trinity Mini 3B (Weak)',
    tier: 'weak',
    provider: 'openrouter',
    pricing: { input: 0, output: 0 },
  },
  {
    id: 'nvidia/nemotron-3-nano-30b-a3b:free',
    label: 'NVIDIA Nemotron Nano 3B (Medium)',
    tier: 'medium',
    provider: 'openrouter',
    pricing: { input: 0, output: 0 },
  },
  {
    id: 'stepfun/step-3.5-flash:free',
    label: 'StepFun Step 3.5 Flash (Strong)',
    tier: 'strong',
    provider: 'openrouter',
    pricing: { input: 0, output: 0 },
  },
];

export const DEFAULT_MODEL = MODELS[1].id; // NVIDIA Nemotron Nano
