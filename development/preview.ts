import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [binary, fixture] = process.argv.slice(2);
if (!process.env.KEEPER_SANDBOX_ROOT || !binary || !fixture) {
  throw Error('Use make preview FIXTURE="/path/to/fixture/local".');
}
const profile = join(await mkdtemp(join(tmpdir(), 'preview-')), 'profile');
await cp(resolve(fixture), profile, { recursive: true, dereference: true });
console.log('Disposable preview profile: ' + profile);
const child = spawn(resolve(binary), [profile], {
  env: { ...process.env, KEEPER_PREVIEW: '1' },
  stdio: 'inherit',
});
const [code] = await once(child, 'exit');
process.exitCode = Number.isInteger(code) ? Number(code) : 1;
