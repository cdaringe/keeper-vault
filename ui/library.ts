import { createEffect, untrack, type Accessor } from 'solid-js';
import { updateActions } from './controls';
import { drawGraph, graphObserver } from './graph';
import { slot, saveLabel, type Save, type Command } from './model';
import { button, el } from './dom';
import { saveRow } from './save-row';
export function mountLibrary(
  saves: Accessor<Save[]>,
  pending: Accessor<string>,
  request: (cmd: Command) => Promise<void>,
) {
  const list = document.getElementById('list'),
    msg = document.getElementById('msg');
  let rows: Save[] = [],
    filter = 'Checkpoints',
    history = '';
  function render() {
    graphObserver?.disconnect();

    const nav = document.querySelector('nav');
    nav.replaceChildren();
    for (const f of ['Checkpoints', 'Worlds', 'Characters', 'Backups']) {
      const b = button(f, () => {
        filter = f;
        history = '';
        render();
      });
      b.setAttribute('aria-pressed', String(filter === f));
      nav.append(b);
    }
    list.replaceChildren();
    const checkpoints = filter === 'Checkpoints';
    document.getElementById('checkpoint-panel').hidden = !checkpoints;
    list.hidden = checkpoints;
    if (checkpoints) return;
    if (!history && filter === 'Backups')
      list.append(
        el('p', 'Choose a backup to restore its world or character.', 'detail'),
      );
    const liveSlots = new Set(
      rows.filter((r) => r.status === 'Live').map(slot),
    );
    if (history) {
      const live = rows.find((r) => slot(r) === history && r.status === 'Live');
      list.append(
        button('← ' + filter, () => {
          history = '';
          render();
        }),
        el('h2', (live ? saveLabel(live) : 'Save') + ' · Save history'),
      );
    }
    const shown = rows
      .filter((r) => r.kind !== 'Checkpoint')
      .filter((r) =>
        history
          ? slot(r) === history
          : filter === 'Backups'
            ? r.status !== 'Live'
            : filter === r.kind + 's' &&
              (r.status === 'Live' || !liveSlots.has(slot(r))),
      )
      .sort(
        (a, b) =>
          (!history && Number(b.pinned) - Number(a.pinned)) ||
          Number(b.status === 'Live') - Number(a.status === 'Live') ||
          b.created.localeCompare(a.created) ||
          a.name.localeCompare(b.name),
      );
    if (!shown.length)
      list.append(
        el(
          'p',
          history
            ? 'No earlier version is available yet. Use Back up now on the live save to start its history.'
            : 'No saves in this view.',
        ),
      );
    const timeline = history ? el('div', '', 'timeline') : list;
    if (history) list.append(timeline);
    for (const r of shown)
      timeline.append(
        saveRow(
          r,
          rows,
          history,
          (key) => {
            history = key;
          },
          request,
        ),
      );
    if (history) {
      if (shown.length === 1 && shown[0].status === 'Live')
        timeline.append(el('p', 'No backups yet.', 'detail'));
      drawGraph(timeline);
    }
    updateActions(pending());
  }

  createEffect(() => {
    rows = saves();
    untrack(render);
  });
  return () => {
    filter = 'Backups';
    history = '';
    msg.replaceChildren();
    render();
  };
}
