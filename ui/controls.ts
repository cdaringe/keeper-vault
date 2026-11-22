import { restoreBlocked, revealSwitch } from './restore-policy';
// The wrapper remains focusable while the native button is disabled.
let nextTip = 0;
export function actionButton(
  text: string,
  click: () => void,
  cls = '',
  reason = '',
) {
  const wrapper = document.createElement('span');
  wrapper.className = 'action-control';
  wrapper.dataset.reason = reason;
  const button = document.createElement('button');
  button.className = cls;
  button.textContent = text;
  button.onclick = click;
  const tooltip = document.createElement('span');
  tooltip.className = 'reason';
  tooltip.role = 'tooltip';
  tooltip.id = 'action-tip-' + ++nextTip;
  wrapper.append(button, tooltip);
  updateControl(wrapper, '');
  return wrapper;
}

export function updateControl(
  wrapper: HTMLElement,
  pending: string,
  blockRestores = restoreBlocked(),
) {
  const blocked = wrapper.dataset.restore === 'true' && blockRestores;
  const reason =
    pending ||
    wrapper.dataset.reason ||
    (blocked
      ? 'Core Keeper is running. Activate this control to reveal Dangerous mode.'
      : '');
  wrapper.dataset.blockedRestore = String(
    blocked && !pending && !wrapper.dataset.reason,
  );
  const button = wrapper.querySelector('button')!;
  const tip = wrapper.querySelector<HTMLElement>('.reason')!;
  button.disabled = Boolean(reason);
  tip.textContent = reason;
  wrapper.tabIndex = reason ? 0 : -1;
  if (reason) {
    wrapper.setAttribute('role', 'group');
    wrapper.setAttribute('aria-label', button.textContent!);
    wrapper.setAttribute('aria-describedby', tip.id);
    button.setAttribute('aria-describedby', tip.id);
  } else {
    wrapper.removeAttribute('role');
    wrapper.removeAttribute('aria-label');
    wrapper.removeAttribute('aria-describedby');
    button.removeAttribute('aria-describedby');
  }
}

export function updateActions(pending: string) {
  const blocked = restoreBlocked();
  document
    .querySelectorAll<HTMLElement>('.action-control')
    .forEach((control) => updateControl(control, pending, blocked));
}

export function restoreButton(
  text: string,
  click: () => void,
  cls = 'primary',
) {
  const control = actionButton(text, click, cls);
  control.dataset.restore = 'true';
  function attempt() {
    if (control.dataset.blockedRestore === 'true') revealSwitch();
  }
  control.addEventListener('click', attempt);
  control.addEventListener('keydown', (e) => {
    if (
      e.target === control &&
      control.dataset.blockedRestore === 'true' &&
      (e.key === 'Enter' || e.key === ' ')
    ) {
      e.preventDefault();
      attempt();
    }
  });
  updateControl(control, '');
  return control;
}
