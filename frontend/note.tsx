import { Action } from './action';
import { ask } from './dialog';
import { saveLabel, type Command, type Save } from './model';
export function NoteButton(props: {
  row: Save;
  pending: string;
  request(cmd: Command): Promise<void>;
}) {
  const label = () => (props.row.note ? 'Edit note' : 'Add note');
  async function edit() {
    const row = props.row;
    const value = await ask(
      label(),
      row.checkpoint_scope || saveLabel(row),
      'Save note',
      row.note || '',
    );
    if (value !== null) await props.request({ op: 'note', id: row.id, value });
  }
  return (
    <Action
      class="note-action"
      pending={props.pending}
      label={label()}
      click={edit}
    />
  );
}
