import { noteButton } from './note';
import { historyDates, historyEntry } from './history-entry';
import { restoreInstruction } from './restore-policy';
import { el, button } from './dom';
import { ask } from './dialog';
import { actionButton, restoreButton } from './controls';
import { attachMenu } from './row-menu';
import {
  saveLabel,
  source,
  when,
  slot,
  type Save,
  type Command,
} from './model';
export function saveRow(
  r: Save,
  rows: Save[],
  history: string,
  openHistory: (key: string) => void,
  request: (cmd: Command) => Promise<void>,
) {
  const row = el('article', '', r.status === 'Live' ? 'active-slot' : ''),
    info = el('div', '', 'info'),
    actions = el('div', '', 'actions'),
    act = (op: string, value = '') => request({ op, id: r.id, value });
  const heading = el('div', '', 'save-heading');
  if (history) {
    const entry = historyEntry(r);
    heading.append(el('div', entry, 'title'));
    if (r.matches_active && r.status !== 'Live')
      heading.append(el('span', 'Matches current', 'detail'));
    info.append(heading, el('div', historyDates(r).join(' · '), 'detail'));
  } else {
    heading.append(el('div', saveLabel(r), 'title'));
    info.append(
      heading,
      el(
        'div',
        [r.kind, r.status === 'Live' ? null : source(r), r.created]
          .filter(Boolean)
          .join(' · '),
        'detail',
      ),
    );
    if (r.status === 'Live')
      heading.append(el('strong', 'Current save', 'slot-label'));
    if (r.matches_active)
      info.prepend(el('strong', 'Matches current save', 'slot-label'));
  }
  heading.append(noteButton(r, request));
  if (r.note) info.append(el('div', r.note, 'save-note'));
  actions.append(
    r.status === 'Live'
      ? actionButton('Back up now', () => act('backup'), 'primary')
      : actionButton('Copy', () => act('copy')),
  );
  if (r.status === 'Live') {
    if (!history)
      actions.append(
        actionButton('View history', async () => {
          openHistory(slot(r));
          await act('history');
        }),
      );
    const versions = rows
      .filter((v) => slot(v) === slot(r) && v.status !== 'Live')
      .sort((a, b) => b.created.localeCompare(a.created));
    if (!history && versions.length)
      info.append(
        el('div', 'Latest restore point: ' + when(versions[0]), 'detail'),
      );
  } else {
    actions.append(
      restoreButton(
        'Restore',
        async () => {
          if (
            (await ask(
              'Restore ' + saveLabel(r) + '?',
              source(r) +
                ' · ' +
                when(r) +
                '. ' +
                restoreInstruction() +
                ' The current ' +
                r.kind.toLowerCase() +
                ' ' +
                saveLabel(
                  rows.find(
                    (v) => v.status === 'Live' && slot(v) === slot(r),
                  ) || r,
                ) +
                ' will be backed up before replacement.',
              'Back up & restore',
            )) !== null
          )
            act('activate');
        },
        'primary',
      ),
    );
  }
  const pin = actionButton(r.pinned ? '★' : '☆', () => act('pin'), 'pin-star');
  const pinLabel = (r.pinned ? 'Unpin ' : 'Pin ') + saveLabel(r);
  pin.querySelector('button')!.setAttribute('aria-label', pinLabel);
  pin.title = pinLabel;
  pin.querySelector('button')!.setAttribute('aria-pressed', String(r.pinned));
  actions.append(pin);
  attachMenu(row, actions, r);
  row.append(el('span', r.kind === 'World' ? '◆' : '♟', 'icon'), info, actions);
  if (history) {
    row.classList.add('point');
    if (r.status === 'Live') row.classList.add('current');
    row.dataset.id = r.id;
    if (r.restore_target) {
      const target = rows.find((other) => other.id === r.restore_target);
      if (target) {
        const link = button(
          '↳ Restored ' +
            source(target) +
            ' · ' +
            (target.captured || target.created),
          () => {
            const dest = document.getElementById('point-' + target.id);
            if (dest) {
              const details = dest.closest('details');
              if (details) details.open = true;
              dest.scrollIntoView({ block: 'center', behavior: 'smooth' });
              dest.focus({ preventScroll: true });
            }
          },
          'target',
        );
        info.append(link);
        row.dataset.target = target.id;
      }
    }
    row.id = 'point-' + r.id;
    row.tabIndex = -1;
  }

  return row;
}
