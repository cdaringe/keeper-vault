import { actionButton } from './controls';
import { ask } from './dialog';
import type { Command, Save } from './model';

export function noteButton(
  row: Save,
  request: (cmd: Command) => Promise<void>,
) {
  const label = row.note ? 'Edit note' : 'Add note';
  return actionButton(
    label,
    async () => {
      const value = await ask(
        label,
        row.checkpoint_scope || row.name,
        'Save note',
        row.note || '',
      );
      if (value !== null) await request({ op: 'note', id: row.id, value });
    },
    'note-action',
  );
}
