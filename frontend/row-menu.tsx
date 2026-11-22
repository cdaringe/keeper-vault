import { createSignal, Show } from 'solid-js';
import { notify } from './feedback';
import { ask } from './dialog';
import { saveLabel, type Save } from './model';
const [openId, setOpenId] = createSignal('');
export function openMenu(id: string) {
  setOpenId(id);
}
export function RowMenu(props: { row: Save }) {
  async function showPath() {
    openMenu('');
    const path = props.row.path;
    if ((await ask('Save path', path, 'Copy path')) === null) return;
    try {
      await navigator.clipboard.writeText(path);
      notify('Path copied.');
    } catch {
      notify(path);
    }
  }
  return (
    <>
      <button
        aria-label={'More actions for ' + saveLabel(props.row)}
        aria-expanded={openId() === props.row.id ? 'true' : 'false'}
        onClick={() => openMenu(openId() === props.row.id ? '' : props.row.id)}
      >
        •••
      </button>
      <Show when={openId() === props.row.id}>
        <div class="menu">
          <button
            ref={(el) => queueMicrotask(() => el.focus())}
            onClick={showPath}
          >
            Show path
          </button>
        </div>
      </Show>
    </>
  );
}
