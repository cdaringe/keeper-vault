import { restoreBlocked, revealSwitch } from './restore-policy';

let nextTip = 0;
export function Action(props: {
  label: string;
  pending: string;
  reason?: string;
  restore?: boolean;
  secondary?: boolean;
  danger?: boolean;
  trashIcon?: boolean;
  class?: string;
  accessibleLabel?: string;
  pressed?: boolean;
  click(): void;
}) {
  const tip = 'action-tip-' + ++nextTip;
  const blocked = () => props.restore && restoreBlocked();
  const reason = () =>
    props.pending ||
    props.reason ||
    (blocked()
      ? 'Core Keeper is running. Activate this control to reveal Dangerous mode.'
      : '');
  function reveal() {
    if (blocked() && !props.pending && !props.reason) revealSwitch();
  }
  return (
    <span
      class="action-control"
      role={reason() ? 'group' : undefined}
      tabindex={reason() ? 0 : -1}
      aria-label={reason() ? props.accessibleLabel || props.label : undefined}
      aria-describedby={reason() ? tip : undefined}
      data-blocked-restore={String(
        !!blocked() && !props.pending && !props.reason,
      )}
      onClick={reveal}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          blocked() &&
          ['Enter', ' '].includes(e.key)
        ) {
          e.preventDefault();
          reveal();
        }
      }}
    >
      <button
        class={
          props.class ||
          (props.danger
            ? 'purge-checkpoint'
            : props.trashIcon
              ? 'trash-icon'
              : props.secondary
                ? ''
                : 'primary')
        }
        disabled={!!reason()}
        aria-label={props.accessibleLabel}
        aria-pressed={
          props.pressed === undefined
            ? undefined
            : props.pressed
              ? 'true'
              : 'false'
        }
        title={
          props.accessibleLabel || (props.trashIcon ? props.label : undefined)
        }
        aria-describedby={reason() ? tip : undefined}
        onClick={() => props.click()}
      >
        {props.label}
      </button>
      <span class="reason" role="tooltip" id={tip}>
        {reason()}
      </span>
    </span>
  );
}
