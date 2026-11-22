export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
  cls?: string,
) {
  const n = document.createElement(tag);
  n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
export function button(text: string, fn: () => void, cls?: string) {
  const b = el('button', text, cls);
  b.onclick = fn;
  return b;
}
