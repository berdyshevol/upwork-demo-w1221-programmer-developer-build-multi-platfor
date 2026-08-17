'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  type ByokConfig,
  NO_KEY_HINT,
  PROVIDER_LABELS,
  PROVIDER_MODELS,
  type ProviderId,
  clearByok,
  readByok,
  saveByok,
} from '@/lib/llm';

type LiveProvider = Exclude<ProviderId, 'mock'>;

const PROVIDERS: LiveProvider[] = ['anthropic', 'openai', 'google'];

export default function SettingsForm() {
  const [provider, setProvider] = useState<LiveProvider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(PROVIDER_MODELS.anthropic[0]);
  const [saved, setSaved] = useState<ByokConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = readByok();
    if (!existing) return;
    setSaved(existing);
    if (existing.provider !== 'mock') {
      setProvider(existing.provider);
      setApiKey(existing.apiKey);
      setModel(existing.model);
    }
  }, []);

  function changeProvider(next: LiveProvider) {
    setProvider(next);
    setModel(PROVIDER_MODELS[next][0]);
    setError(null);
  }

  function save() {
    if (!apiKey.trim()) {
      setError('Paste an API key first, or leave it empty to keep using the shared fallback.');
      return;
    }
    const config: ByokConfig = { provider, apiKey: apiKey.trim(), model };
    saveByok(config);
    setSaved(config);
    setError(null);
  }

  function clear() {
    clearByok();
    setSaved(null);
    setApiKey('');
    setError(null);
  }

  return (
    <div className="space-y-5">
      <p
        data-testid="byok-status"
        className={`rounded border px-3 py-2 text-sm ${
          saved
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
            : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
        }`}
      >
        {saved
          ? `Using ${saved.provider === 'mock' ? 'the mock test provider' : PROVIDER_LABELS[saved.provider as LiveProvider]} · ${saved.model}. The key is held in this browser's localStorage only.`
          : 'No API key saved. Contact enrichment will use the author’s shared endpoint (slow — it queues) and then the built-in parser.'}
      </p>

      {!saved ? (
        <p data-testid="byok-hint" className="text-sm text-slate-300">
          {NO_KEY_HINT}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="provider" className="block text-xs font-medium text-slate-300">
            Provider
          </label>
          <select
            id="provider"
            value={provider}
            onChange={(event) => changeProvider(event.target.value as LiveProvider)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
          >
            {PROVIDERS.map((id) => (
              <option key={id} value={id}>
                {PROVIDER_LABELS[id]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="apiKey" className="block text-xs font-medium text-slate-300">
            {PROVIDER_LABELS[provider]} API key
          </label>
          <input
            id="apiKey"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={provider === 'anthropic' ? 'sk-ant-…' : 'paste your key'}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="model" className="block text-xs font-medium text-slate-300">
            Model
          </label>
          <select
            id="model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
          >
            {PROVIDER_MODELS[provider].map((id, index) => (
              <option key={id} value={id}>
                {id}
                {index === 0 ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <p className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          className="rounded bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
        >
          Save settings
        </button>
        <button
          type="button"
          onClick={clear}
          className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-rose-500/60 hover:text-rose-300"
        >
          Clear key
        </button>
        <Link
          href="/"
          className="text-xs text-slate-400 underline decoration-dotted hover:text-slate-200"
        >
          Back to the pipeline board
        </Link>
      </div>
    </div>
  );
}
