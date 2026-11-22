const dialog = document.querySelector('dialog');
export function ask(
  title: string,
  desc: string,
  action: string,
  value?: string,
): Promise<string | null> {
  dialog.querySelector('h2').textContent = title;
  dialog.dataset.destructive = String(action === 'Permanently delete');
  dialog.querySelector('p').textContent = desc;
  const input = dialog.querySelector('textarea');
  input.hidden = value === undefined;
  input.value = value ?? '';
  dialog.querySelector('.primary').textContent = action;
  dialog.returnValue = 'cancel';
  dialog.showModal();
  if (!input.hidden) input.focus();
  return new Promise(
    (resolve) =>
      (dialog.onclose = () =>
        resolve(dialog.returnValue === 'ok' ? input.value : null)),
  );
}
