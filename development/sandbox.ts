import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function run(command: string, args: string[], env = process.env) {
  const child = spawn(command, args, { env, stdio: 'inherit' });
  const interrupt = () => child.kill('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    const [code] = await once(child, 'exit');
    return Number.isInteger(code) ? Number(code) : 1;
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

const inside = process.argv[2] === '--inside';
const args = process.argv.slice(inside ? 3 : 2);
if (!args.length)
  throw Error('Usage: node development/sandbox.ts SCRIPT [ARGS]');

if (inside) {
  // Probe a disposable file outside the writable mount, never a real save.
  const probe = process.env.KEEPER_READONLY_PROBE;
  assert.ok(probe, 'Start development scripts through the sandbox launcher.');
  await assert.rejects(writeFile(probe, 'unexpected write'), { code: 'EROFS' });
  assert.equal(await readFile(probe, 'utf8'), 'read-only');
  console.log('Sandbox verified: host files are read-only.');
  process.exitCode = await run(process.execPath, args);
} else {
  const root = await mkdtemp(join(tmpdir(), 'keeper-sandbox-'));
  const work = join(root, 'work');
  const probe = join(root, 'read-only-probe');
  try {
    const env = {
      ...process.env,
      TMPDIR: join(work, 'tmp'),
      XDG_DATA_HOME: join(work, 'data'),
      XDG_CONFIG_HOME: join(work, 'config'),
      XDG_CACHE_HOME: join(work, 'cache'),
      XDG_STATE_HOME: join(work, 'state'),
      XDG_RUNTIME_DIR: join(work, 'runtime'),
      KEEPER_SANDBOX_ROOT: work,
      KEEPER_READONLY_PROBE: probe,
      DBUS_SESSION_BUS_ADDRESS: '',
      DBUS_SYSTEM_BUS_ADDRESS: '',
    };
    for (const path of [
      env.TMPDIR,
      env.XDG_DATA_HOME,
      env.XDG_CONFIG_HOME,
      env.XDG_CACHE_HOME,
      env.XDG_STATE_HOME,
      env.XDG_RUNTIME_DIR,
    ])
      await mkdir(path, { recursive: true, mode: 0o700 });
    await writeFile(probe, 'read-only');
    process.exitCode = await run(
      'bwrap',
      [
        '--die-with-parent',
        '--new-session',
        '--unshare-pid',
        '--unshare-net',
        '--ro-bind',
        '/',
        '/',
        '--bind',
        work,
        work,
        '--proc',
        '/proc',
        '--dev',
        '/dev',
        process.execPath,
        fileURLToPath(import.meta.url),
        '--inside',
        ...args,
      ],
      env,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw Error(
        'Development runs require Bubblewrap (bwrap). No unsandboxed fallback is allowed.',
      );
    }
    throw error;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
