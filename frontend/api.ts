import type { Command } from './model';
const key = document.querySelector<HTMLMetaElement>(
  'meta[name=vault-key]',
).content;
export class RunningGameError extends Error {}
export async function api(
  route: string,
  signal: AbortSignal,
  command?: Command,
) {
  const options: RequestInit = { signal, headers: { 'X-Vault-Key': key } };
  if (command) {
    options.method = 'POST';
    options.body = JSON.stringify(command);
  }
  const response = await fetch(route, options);
  if (response.status === 423)
    throw new RunningGameError(await response.text());
  if (!response.ok) throw Error(await response.text());
  return response;
}
