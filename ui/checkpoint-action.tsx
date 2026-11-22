import { createEffect } from 'solid-js';
import { actionButton, restoreButton, updateControl } from './controls';
export function Action(props: {
  label: string;
  reason?: string;
  restore?: boolean;
  secondary?: boolean;
  trashIcon?: boolean;
  danger?: boolean;
  pending: string;
  click(): void;
}) {
  const control = (props.restore ? restoreButton : actionButton)(
    props.label,
    () => props.click(),
    props.danger
      ? 'purge-checkpoint'
      : props.trashIcon
        ? 'trash-icon'
        : props.secondary
          ? ''
          : 'primary',
  );
  if (props.trashIcon) control.querySelector('button')!.title = props.label;
  createEffect(() => {
    control.dataset.reason = props.reason || '';
    updateControl(control, props.pending);
  });
  return control;
}
