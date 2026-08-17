import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

/**
 * BYOK. The visitor's key is read from their own localStorage and used to build
 * a provider client in the browser, so the request goes browser -> provider and
 * never touches this app's server. Nothing here is ever persisted or logged, and
 * the demo itself carries no credential of any kind.
 */
export const BYOK_STORAGE_KEY = 'byok';

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'mock';

export interface ByokConfig {
  provider: ProviderId;
  apiKey: string;
  model: string;
}

export const PROVIDER_LABELS: Record<Exclude<ProviderId, 'mock'>, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
};

/** First entry of each list is that provider's default. */
export const PROVIDER_MODELS: Record<Exclude<ProviderId, 'mock'>, string[]> = {
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'o1-mini'],
  google: ['gemini-2.0-flash', 'gemini-2.5-pro'],
};

export function readByok(): ByokConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(BYOK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ByokConfig>;
    if (!parsed || typeof parsed.provider !== 'string' || typeof parsed.apiKey !== 'string') return null;
    if (!parsed.apiKey.trim()) return null;
    const provider = parsed.provider as ProviderId;
    if (!['anthropic', 'openai', 'google', 'mock'].includes(provider)) return null;
    const model =
      typeof parsed.model === 'string' && parsed.model.trim()
        ? parsed.model.trim()
        : provider === 'mock'
          ? 'mock'
          : PROVIDER_MODELS[provider as Exclude<ProviderId, 'mock'>][0];
    return { provider, apiKey: parsed.apiKey, model };
  } catch {
    return null;
  }
}

export function saveByok(config: ByokConfig): void {
  window.localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify(config));
}

export function clearByok(): void {
  window.localStorage.removeItem(BYOK_STORAGE_KEY);
}

/**
 * Provider client for a visitor-supplied key, built in the browser.
 * `dangerouslyAllowBrowser` is passed for providers that gate direct browser
 * use; Anthropic additionally requires its opt-in header.
 */
export function modelFor(config: ByokConfig): LanguageModel {
  const shared = { apiKey: config.apiKey, dangerouslyAllowBrowser: true };
  switch (config.provider) {
    case 'anthropic':
      return createAnthropic({
        ...shared,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      } as Parameters<typeof createAnthropic>[0])(config.model);
    case 'openai':
      return createOpenAI(shared as Parameters<typeof createOpenAI>[0])(config.model);
    case 'google':
      return createGoogleGenerativeAI(
        shared as Parameters<typeof createGoogleGenerativeAI>[0],
      )(config.model);
    default:
      throw new Error(`No live model for provider "${config.provider}"`);
  }
}

export const NO_KEY_HINT =
  'Choose a provider and paste your API key in Settings to enable live AI.';
