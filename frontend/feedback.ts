import { createSignal } from 'solid-js';
export const [feedback, setFeedback] = createSignal({
  text: '',
  backups: false,
});
export function notify(text: string, backups = false) {
  setFeedback({ text, backups });
}
