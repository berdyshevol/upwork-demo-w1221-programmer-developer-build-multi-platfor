import SettingsForm from '@/components/SettingsForm';
import { Card } from '@/components/ui';

export const metadata = { title: 'Settings — ScoutPipe' };

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">AI settings</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Contact enrichment is the one step in this pipeline that uses a language model. Bring your
          own key and it runs instantly, billed to you; leave it empty and the demo still works.
        </p>
      </div>

      <Card>
        <SettingsForm />
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-white">How the three paths differ</h2>
        <ul className="mt-2 space-y-2 text-sm text-slate-400">
          <li>
            <strong className="text-slate-200">Your own key (fast).</strong> The request goes
            straight from your browser to Anthropic, OpenAI or Google. It never passes through this
            app&apos;s server, and the key is never sent anywhere except the provider you chose.
          </li>
          <li>
            <strong className="text-slate-200">The author&apos;s shared endpoint (slow).</strong> With
            no key saved, enrichment posts to a queue the author pays for. It can take minutes per
            batch, which is exactly why bringing your own key is the preferred path. If that endpoint
            is not configured for this deployment, it is simply off.
          </li>
          <li>
            <strong className="text-slate-200">The built-in parser (always).</strong> If neither AI
            path is available, a section-aware regex extractor reads the same about-page text and the
            row is labelled <span className="font-mono text-xs">fallback</span>, so you can see which
            addresses came from a model and which did not.
          </li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          This demo carries no credential of its own — no provider key is stored in the repository or
          in its environment.
        </p>
      </Card>
    </div>
  );
}
