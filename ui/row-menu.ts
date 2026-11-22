import { el, button } from './dom';
import { ask } from './dialog';
import type { Save } from './model';
function closeMenu() {
  document.querySelector('.menu')?.remove();
}
document.addEventListener('click', (e) => {
  if (!(e.target as Element).closest('.actions')) closeMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
});
export function attachMenu(row: HTMLElement, actions: HTMLElement, r: Save) {
  const msg = document.getElementById('msg');
  function menu() {
    closeMenu();
    const m = el('div', '', 'menu');
    m.append(
      button('Show path', async () => {
        closeMenu();
        if ((await ask('Save path', r.path, 'Copy path')) !== null) {
          try {
            await navigator.clipboard.writeText(r.path);
            msg.textContent = 'Path copied.';
          } catch {
            msg.textContent = r.path;
          }
        }
      }),
    );
    actions.append(m);
    m.querySelector<HTMLElement>(
      'button:not(:disabled),[tabindex="0"]',
    )?.focus();
  }
  row.oncontextmenu = (e) => {
    e.preventDefault();
    menu();
  };
  const more = button('•••', () =>
    actions.querySelector('.menu') ? closeMenu() : menu(),
  );
  more.setAttribute('aria-label', 'More actions for ' + r.name);
  actions.append(more);
}
