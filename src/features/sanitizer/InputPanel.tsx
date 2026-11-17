import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Eraser, FileUp, FlaskConical } from 'lucide-react';
import { Button, EmptyState } from '../../components/ui';
import { ConfirmDialog } from '../../components/dialog';
import { Menu } from '../../components/menu';
import type { MenuItemDef } from '../../components/menu';
import { useToast } from '../../components/toast';
import { countWords, useSession } from './session';
import { SAMPLES } from '../../lib/samples';
import { ACCEPTED_IMPORT_TYPES, readFileAsText } from '../../lib/files';
import { useSettings } from '../../app/settings';

/**
 * Prompt input panel: accessible editor, live counts, sample chooser, local file
 * import (.txt/.md, size-limited, never uploaded), and clear-with-confirmation.
 */
export function InputPanel() {
  const { text, setText } = useSession();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmLoad, setConfirmLoad] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chars = text.length;
  const words = countWords(text);
  const limit = settings.maxInputLength;
  const nearLimit = chars > limit * 0.9;
  const overLimit = chars > limit;

  const sampleItems: MenuItemDef[] = SAMPLES.map((sample) => ({
    id: sample.id,
    label: sample.name,
    description: sample.description,
    icon: <FlaskConical className="h-4 w-4" aria-hidden="true" />,
  }));

  const loadSample = (id: string): void => {
    const sample = SAMPLES.find((s) => s.id === id);
    if (sample === undefined) return;
    if (text.length > 0) {
      // Confirm before replacing content the user would lose.
      setConfirmLoad(sample.id);
      return;
    }
    applySample(sample.id);
  };

  const applySample = (id: string): void => {
    const sample = SAMPLES.find((s) => s.id === id);
    if (sample === undefined) return;
    setText(sample.text);
    showToast('success', `Loaded sample “${sample.name}” (synthetic data only).`);
  };

  const onFileChosen = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    // Reset so choosing the same file twice still fires a change event.
    event.target.value = '';
    if (file === undefined) return;
    void readFileAsText(file).then((result) => {
      if (!result.ok) {
        showToast('error', result.detail);
        return;
      }
      if (result.text.length > settings.maxInputLength) {
        showToast(
          'error',
          `“${result.name}” is ${result.text.length.toLocaleString()} characters — over the ${settings.maxInputLength.toLocaleString()} character limit. Increase the limit in Settings or import a smaller file. Nothing was uploaded.`,
        );
        return;
      }
      const apply = (): void => {
        setText(result.text);
        showToast('success', `Imported “${result.name}” — read locally, never uploaded.`);
      };
      if (text.length > 0) {
        // Confirm before replacing existing input.
        if (
          window.confirm(
            `Importing “${result.name}” will replace the current prompt in the editor. Continue?`,
          )
        ) {
          apply();
        }
      } else {
        apply();
      }
    });
  };

  return (
    <section
      aria-labelledby="input-panel-heading"
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
        <div>
          <h2 id="input-panel-heading" className="text-sm font-semibold text-ink">
            Prompt input
          </h2>
          <p className="mt-0.5 text-2xs text-ink-faint">
            Held in memory only — never saved, never sent anywhere by this app.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Menu
            triggerLabel="Load a synthetic sample prompt"
            items={sampleItems}
            onAction={loadSample}
            trigger={({ open, toggle, menuId }) => (
              <Button
                size="sm"
                variant="secondary"
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                icon={<FlaskConical aria-hidden="true" className="h-3.5 w-3.5" />}
              >
                Samples
              </Button>
            )}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            icon={<FileUp aria-hidden="true" className="h-3.5 w-3.5" />}
          >
            Import file
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (text.length > 0) setConfirmClear(true);
            }}
            disabled={text.length === 0}
            icon={<Eraser aria-hidden="true" className="h-3.5 w-3.5" />}
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="relative flex min-h-64 flex-1 flex-col">
        {text.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center">
            <EmptyState
              icon={<FlaskConical aria-hidden="true" />}
              title="Paste or type a prompt to inspect"
              description={
                <>
                  Your text is analyzed in this browser. PromptShield does not send prompt content
                  to a server. Detector results are suggestions and may be incomplete — try a
                  synthetic <strong>Sample</strong> to explore safely.
                </>
              }
            />
          </div>
        ) : null}
        <label htmlFor="prompt-editor" className="sr-only">
          Prompt text to inspect
        </label>
        <textarea
          id="prompt-editor"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the prompt you plan to send to an AI tool…"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          wrap="soft"
          className="prompt-text scroll-slim w-full flex-1 resize-y bg-transparent px-4 py-3 text-ink
            placeholder:text-ink-faint focus:outline-none"
          aria-describedby="prompt-editor-meta"
          aria-invalid={overLimit}
        />
      </div>

      <div
        id="prompt-editor-meta"
        className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2 px-4 py-2 text-2xs text-ink-faint"
      >
        <span aria-live="polite">
          {chars.toLocaleString()} characters · {words.toLocaleString()} words
          {overLimit ? ' · over the scan limit' : ''}
        </span>
        <span className={nearLimit ? 'font-medium text-warning' : ''}>
          Scan limit: {limit.toLocaleString()} characters — adjust in Settings
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMPORT_TYPES}
        onChange={onFileChosen}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />

      <ConfirmDialog
        open={confirmClear}
        title="Clear the prompt?"
        body="The text currently in the editor will be removed from this session. It was only in memory and is not recoverable. Nothing was ever stored or sent."
        confirmLabel="Clear prompt"
        danger
        onConfirm={() => {
          setText('');
          setConfirmClear(false);
          showToast('info', 'Prompt cleared from this session.');
        }}
        onCancel={() => setConfirmClear(false)}
      />
      <ConfirmDialog
        open={confirmLoad !== null}
        title="Replace the current prompt with the sample?"
        body="Loading a synthetic sample replaces the text currently in the editor. The current text is only in memory and cannot be recovered."
        confirmLabel="Replace with sample"
        onConfirm={() => {
          if (confirmLoad !== null) applySample(confirmLoad);
          setConfirmLoad(null);
        }}
        onCancel={() => setConfirmLoad(null)}
      />
    </section>
  );
}
