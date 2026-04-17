import { describe, it, expect } from 'vitest';
import { MODELS, DEFAULT_MODEL } from '@/lib/models';
import type { ModelConfig } from '@/lib/models';

describe('MODELS registry', () => {
  it('exports a non-empty array of models', () => {
    expect(Array.isArray(MODELS)).toBe(true);
    expect(MODELS.length).toBeGreaterThan(0);
  });

  it('every model has required fields', () => {
    for (const m of MODELS) {
      expect(m.id).toBeTruthy();
      expect(m.label).toBeTruthy();
      expect(['weak', 'medium', 'strong']).toContain(m.tier);
      expect(['deepseek', 'openrouter', 'ollama']).toContain(m.provider);
      expect(m.pricing).toBeDefined();
      expect(typeof m.pricing.input).toBe('number');
      expect(typeof m.pricing.output).toBe('number');
      expect(m.contextWindow).toBeGreaterThan(0);
    }
  });

  it('has no duplicate model IDs', () => {
    const ids = MODELS.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has at least one model per tier', () => {
    const tiers = new Set(MODELS.map(m => m.tier));
    expect(tiers.has('weak')).toBe(true);
    expect(tiers.has('medium')).toBe(true);
    expect(tiers.has('strong')).toBe(true);
  });
});

describe('DEFAULT_MODEL', () => {
  it('references a valid model ID from the registry', () => {
    const ids = MODELS.map(m => m.id);
    expect(ids).toContain(DEFAULT_MODEL);
  });

  it('is defined and non-empty', () => {
    expect(DEFAULT_MODEL).toBeTruthy();
    expect(typeof DEFAULT_MODEL).toBe('string');
  });
});
