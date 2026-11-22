import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, realpath } from 'node:fs/promises';
import { connect, createServer, type AddressInfo } from 'node:net';
import { relative, isAbsolute } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { Save } from '../frontend/model';

assert.ok(
  process.env.KEEPER_SANDBOX_ROOT,
  'Run integration tests through make.',
);

export type Call = (
  op?: string,
  id?: string,
  value?: string,
  dangerous_mode?: boolean,
) => Promise<Save[]>;

function contained(root: string, path: string) {
  const rel = relative(root, path);
  assert.ok(
    !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'),
    'Test path escaped its disposable directory: ' + path,
  );
}

export async function withServer(
  binary: string,
  profile: string,
  data: string,
  run: (call: Call, base: string) => Promise<void>,
) {
  contained(process.env.KEEPER_SANDBOX_ROOT, profile);
  contained(process.env.KEEPER_SANDBOX_ROOT, data);
  await mkdir(data, { recursive: true });
  contained(process.env.KEEPER_SANDBOX_ROOT, await realpath(profile));
  contained(process.env.KEEPER_SANDBOX_ROOT, await realpath(data));
  const probe = createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address() as AddressInfo;
  await new Promise((ok) => probe.close(ok));
  const base = 'http://127.0.0.1:' + port;
  const proc = spawn(binary, ['--serve', profile], {
    env: { ...process.env, KEEPER_PORT: String(port), XDG_DATA_HOME: data },
    stdio: 'inherit',
  });
  const exited = once(proc, 'exit');
  try {
    let page;
    for (let i = 0; i < 100 && !page; i++) {
      if (proc.exitCode !== null) throw Error('Server exited');
      try {
        page = await (
          await fetch(base, { signal: AbortSignal.timeout(2000) })
        ).text();
      } catch {
        await delay(50);
      }
    }
    const key = page?.match(/name="vault-key"\s+content="([^"]+)"/)?.[1];
    assert.ok(key, 'server session key');
    const idle = connect(port, '127.0.0.1');
    try {
      await once(idle, 'connect');
      const ready = await fetch(base, { signal: AbortSignal.timeout(2000) });
      assert.equal(ready.status, 200);
      await ready.arrayBuffer();
    } finally {
      idle.destroy();
    }
    await run(async (op, id, value = '', dangerous_mode = false) => {
      const res = await fetch(base + (op ? '/action' : '/saves'), {
        headers: { 'X-Vault-Key': key },
        method: op ? 'POST' : 'GET',
        body: op
          ? JSON.stringify({ op, id, value, dangerous_mode })
          : undefined,
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw Error(res.status + ' ' + (await res.text()));
      assert.equal(
        decodeURIComponent(res.headers.get('X-Profile-Path')),
        profile,
      );
      const rows: Save[] = await res.json();
      for (const row of rows) {
        if (row.path)
          contained(
            row.status === 'Live' ? profile : data,
            await realpath(row.path),
          );
      }
      return rows;
    }, base);
  } finally {
    proc.kill();
    await exited;
  }
}
