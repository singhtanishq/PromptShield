import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { InputPanel } from './InputPanel';
import { FindingsPanel } from './FindingsPanel';
import { ScanControls } from './ScanControls';
import { OutputPanel } from './OutputPanel';
import { DiffView } from './DiffView';

/**
 * Primary workspace. Wide screens: input + findings left, output right.
 * Narrow screens: stacked with the editor first.
 */
export function SanitizerView() {
  const [decodeEncoded, setDecodeEncoded] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-ink">Sanitize a prompt</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Paste the prompt you plan to send to an AI tool. Inspect what looks sensitive, choose
            redactions yourself, and copy the safer version out. Nothing is redacted until you
            choose it.
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-2xs font-medium text-ink-muted"
          title="PromptShield has no backend: analysis runs in this browser tab and prompt text is never transmitted by the application."
        >
          <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-accent" />
          Processed locally in your browser
        </span>
      </div>

      <ScanControls decodeEncoded={decodeEncoded} onDecodeEncodedChange={setDecodeEncoded} />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <InputPanel />
          <FindingsPanel />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <OutputPanel />
          <DiffView />
        </div>
      </div>
    </div>
  );
}
