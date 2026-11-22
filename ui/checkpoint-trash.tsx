import { Action } from './checkpoint-action';
import { type Save, type Command, when } from './model';

export function CheckpointTrash(props: {
  row: Save;
  pending: string;
  request(cmd: Command): Promise<void>;
  ask(
    title: string,
    description: string,
    action: string,
  ): Promise<string | null>;
}) {
  async function purge(r: Save) {
    if (
      (await props.ask(
        'Permanently delete this checkpoint?',
        r.name +
          ' · ' +
          when(r) +
          '. This permanently erases this checkpoint. You cannot recover it afterward.',
        'Permanently delete',
      )) !== null
    ) {
      await props.request({ op: 'purge_checkpoint', id: r.id, value: r.id });
    }
  }
  return (
    <>
      <Action
        label="Recover checkpoint"
        secondary
        pending={props.pending}
        click={() =>
          props.request({ op: 'recover_checkpoint', id: props.row.id })
        }
      />
      <Action
        label="Permanently delete"
        danger
        pending={props.pending}
        click={() => purge(props.row)}
      />
    </>
  );
}
