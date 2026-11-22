import { createEffect, createSignal, onCleanup, Show } from 'solid-js';

interface Prompt {
  title: string;
  desc: string;
  action: string;
  value?: string;
  resolve(answer: string | null): void;
}
const [prompt, setPrompt] = createSignal<Prompt | null>(null);
export function ask(
  title: string,
  desc: string,
  action: string,
  value?: string,
): Promise<string | null> {
  return new Promise((resolve) =>
    setPrompt({ title, desc, action, value, resolve }),
  );
}
export function Dialog() {
  return (
    <Show when={prompt()} keyed>
      {(p) => <PromptDialog prompt={p} />}
    </Show>
  );
}
function PromptDialog(props: { prompt: Prompt }) {
  let dialog: HTMLDialogElement;
  let input: HTMLTextAreaElement;
  const p = props.prompt;
  createEffect(
    () => true,
    () => {
      dialog.showModal();
      if (p.value !== undefined) input.focus();
    },
  );
  onCleanup(() => p.resolve(null));
  return (
    <dialog
      id="modal"
      ref={dialog}
      aria-labelledby="modal-title"
      data-destructive={String(p.action === 'Permanently delete')}
      onClose={() => {
        p.resolve(dialog.returnValue === 'ok' ? input.value : null);
        setPrompt(null);
      }}
    >
      <form method="dialog">
        <h2 id="modal-title">{p.title}</h2>
        <p>{p.desc}</p>
        <textarea
          ref={input}
          maxlength={1000}
          rows={4}
          aria-label="Note"
          hidden={p.value === undefined}
          value={p.value ?? ''}
        />
        <footer>
          <button value="cancel" formnovalidate>
            Cancel
          </button>
          <button value="ok" class="primary">
            {p.action}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
