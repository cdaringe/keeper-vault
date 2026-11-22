import JSON5 from 'json5';
import { createFixture } from './fixture.ts';
import type { AddressInfo } from 'node:net';
import type { Save } from '../ui/model';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  stat,
  rename,
  mkdtemp,
  cp,
  readFile,
  readdir,
  writeFile,
  mkdir,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, dirname } from 'node:path';
import { createServer, connect } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

async function digest(
  root: string,
  dir = root,
  result: Record<string, string> = {},
) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, item.name);
    if (item.isDirectory()) await digest(root, p, result);
    if (item.isFile())
      result[relative(root, p)] = createHash('sha256')
        .update(await readFile(p))
        .digest('hex');
  }
  return result;
}
const [binaryArg, fixtureArg] = process.argv.slice(2);
if (!binaryArg)
  throw Error('Usage: node tests/integration.ts BINARY [FIXTURE]');
const work = await mkdtemp(join(tmpdir(), 'keeper-test-')),
  profile = join(work, 'profile');

type Call = (
  op?: string,
  id?: string,
  value?: string,
  dangerous_mode?: boolean,
) => Promise<Save[]>;
async function server(run: (call: Call) => Promise<void>) {
  const probe = createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address() as AddressInfo;
  await new Promise((ok) => probe.close(ok));
  const base = 'http://127.0.0.1:' + port;
  const proc = spawn(resolve(binaryArg), ['--serve', profile], {
    env: {
      ...process.env,
      KEEPER_PORT: String(port),
      XDG_DATA_HOME: join(work, 'data'),
    },
    stdio: 'inherit',
  });
  const exited = once(proc, 'exit');
  try {
    let page;
    for (let i = 0; i < 100 && !page; i++) {
      if (proc.exitCode !== null) throw Error('Server exited');
      try {
        page = await (await fetch(base)).text();
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
      return res.json();
    });
  } finally {
    proc.kill();
    await exited;
  }
}

const fixture = fixtureArg ? resolve(fixtureArg) : join(work, 'fixture');
let labelled: string;
try {
  if (!fixtureArg) await createFixture(fixture);
  const initial = await digest(fixture);
  await cp(fixture, profile, { recursive: true });
  await server(async (call) => {
    const live = (await call()).filter((r) => r.status === 'Live');
    const [world, char] = ['World', 'Character'].map((k) =>
      live.find((r) => r.kind === k),
    );
    if (!fixtureArg) {
      assert.equal(world.name, 'Cavern');
      assert.equal(world.world_created, '2025-02-01');
      assert.equal(char.name, 'Ash');
    }
    for (const row of live.filter((r) => r.kind === 'Character')) {
      // Unity permits non-finite timers in otherwise JSON-like saves.
      const raw = await readFile(row.path, 'utf8');
      const name = JSON5.parse(raw).characterCustomizationNew?.name;
      if (name?.bytes) {
        const fields = { ...name.bytes, ...name.bytes.offset0000 };
        const bytes = Object.keys(fields)
          .filter((k) => k.startsWith('byte'))
          .sort()
          .map((k) => fields[k]);
        assert.equal(
          row.name,
          Buffer.from(bytes.slice(0, name.utf8LengthInBytes)).toString(),
        );
      }
    }
    const manual = (await call('backup', world.id)).find(
      (r) => r.status === 'Manual backup',
    );
    assert.ok(manual.matches_active);
    assert.ok(manual.captured);
    assert.ok(world.source_modified);
    assert.equal(manual.source_modified, world.source_modified);
    assert.equal(manual.world_created, world.world_created);
    assert.equal(
      Math.floor((await stat(world.path)).mtimeMs / 1000),
      Math.floor((await stat(manual.path)).mtimeMs / 1000),
    );
    assert.deepEqual(await readFile(manual.path), await readFile(world.path));
    const capture = () => call('checkpoint', world.id, char.id);
    const ids = (rows: Save[]) =>
      rows.filter((r) => r.kind === 'Checkpoint').map((r) => r.id);
    const [first, second] = await Promise.all([capture(), capture()]);
    assert.deepEqual(ids(first), ids(second));
    const points = ids(await capture());
    assert.equal(points.length, 1);
    for (const member of [world, char]) {
      const args = member === world ? [world.id, ''] : ['', char.id];
      const single = (await call('checkpoint', args[0], args[1])).find(
        (r) => r.status === 'Checkpoint' && r.id !== points[0],
      );
      assert.equal(single.checkpoint_scope, member.kind + ': ' + member.name);
      assert.deepEqual(
        ids(await call('checkpoint', args[0], args[1])).sort(),
        [...points, single.id].sort(),
      );
      const other = member === world ? char : world;
      const before = await readFile(other.path);
      await writeFile(other.path, Buffer.concat([before, Buffer.from(' ')]));
      await call('restore_checkpoint', single.id);
      assert.deepEqual(
        await readFile(other.path),
        Buffer.concat([before, Buffer.from(' ')]),
      );
      await writeFile(other.path, before);
      const trashed = (await call('trash_checkpoint', single.id)).find(
        (r) => r.status === 'Trashed',
      );
      await call('purge_checkpoint', trashed.id, trashed.id);
    }
    // Exercise the Linux process check without starting the game.
    const game = spawn('/bin/sh', [
      '-c',
      'printf CoreKeeper > /proc/self/comm; echo ready; read finish',
    ]);
    const gameExited = once(game, 'exit');
    try {
      await once(game.stdout, 'data');
      const prior = await call();
      for (const [op, id] of [
        ['activate', manual.id],
        ['restore_checkpoint', points[0]],
        ['retry', points[0]],
      ]) {
        await assert.rejects(call(op, id), /423 Restore blocked/);
      }
      assert.deepEqual(await digest(profile), initial);
      assert.equal((await call()).length, prior.length);
      assert.deepEqual(ids(await capture()), points);
      await call('restore_checkpoint', points[0], '', true);
      await assert.rejects(call('activate', manual.id), /423 Restore blocked/);
    } finally {
      game.kill();
      await gameExited;
    }
    const row = first.find((r) => r.id === points[0]);
    assert.equal(row.name, world.name + ' + ' + char.name);
    // Simulate the directory name used by an earlier installation.
    const library = join(
      work,
      'data',
      'keeper-vault',
      createHash('sha256').update(profile).digest('hex'),
    );
    await writeFile(
      join(library, 'labels.json'),
      JSON.stringify({ [world.id]: { alias: 'Old nickname', pinned: true } }),
    );
    const migrated = (await call()).find((r) => r.id === world.id);
    assert.equal(migrated.note, 'Old nickname');
    assert.equal(migrated.name, world.name);
    assert.equal(migrated.pinned, true);
    await call('note', world.id, '');
    assert.equal((await call()).find((r) => r.id === world.id).note, '');
    await call('note', points[0], 'Explored western caves');
    const legacy = points[0].replace(/^checkpoint-/, 'boss-');
    assert.notEqual(legacy, points[0]);
    await rename(join(library, points[0]), join(library, legacy));
    assert.equal(
      (await capture()).find((r) => r.id === legacy).note,
      'Explored western caves',
    );
    assert.deepEqual(ids(await capture()), [legacy]);
    for (let attempt = 0; attempt < 2; attempt++) {
      const failed: [string, Buffer][] = [];
      for (const r of [world, char]) {
        const content = Buffer.concat([
          await readFile(r.path),
          Buffer.from([attempt]),
        ]);
        await writeFile(r.path, content);
        failed.push([r.kind, content]);
      }
      if (!attempt) assert.equal(ids(await capture()).length, 2);
      const rows = await call('restore_checkpoint', legacy);
      assert.deepEqual(await digest(profile), initial);
      assert.equal(ids(await capture()).length, 2);
      for (const [kind, content] of failed) {
        const files = await Promise.all(
          rows
            .filter((r) => r.kind === kind && r.status === 'Backup')
            .map((r) => readFile(r.path)),
        );
        assert.ok(files.some((f) => f.equals(content)));
      }
    }
    const all = await call();
    const previous = all.find(
      (r) => r.kind === 'World' && r.status === 'Game backup',
    );
    const target = live.find(
      (r) => r.kind === 'World' && r.slot === previous.slot,
    );
    assert.deepEqual(
      (await call('history', target.id)).map((r) => r.id).sort(),
      all.map((r) => r.id).sort(),
    );
    const expected = await readFile(target.path + '.pugbackup');
    const undo = (await call('activate', previous.id)).find(
      (r) => r.restore_target === previous.id,
    );
    assert.deepEqual(await readFile(target.path), expected);
    await call('activate', undo.id);
    assert.deepEqual(await digest(profile), initial);
    for (const member of [world, char]) {
      const before = await readFile(member.path);
      const copy = (await call('copy', member.id)).find(
        (r) => r.kind === member.kind && r.status === 'Copy',
      );
      assert.deepEqual(await readFile(copy.path), before);
      const modified = Buffer.concat([before, Buffer.from(' ')]);
      await writeFile(member.path, modified);
      if (member === char) {
        const p = join(profile, 'maps', char.slot, '999.mapparts.gzip');
        await mkdir(dirname(p), { recursive: true });
        await writeFile(p, 'newly explored');
      }
      const altered = await digest(profile);
      const backup = (await call('activate', copy.id)).find(
        (r) => r.restore_target === copy.id,
      );
      assert.deepEqual(await readFile(backup.path), modified);
      assert.deepEqual(await digest(profile), initial);
      await call('activate', backup.id);
      assert.deepEqual(await digest(profile), altered);
      await call('activate', copy.id);
      assert.deepEqual(await digest(profile), initial);
      labelled = copy.id;
    }
    await assert.rejects(call('delete_checkpoint', world.id), /409/);
    await assert.rejects(call('delete_checkpoint', manual.id), /409/);
    let remaining = await call();
    for (const point of remaining.filter((r) => r.kind === 'Checkpoint')) {
      const expected = remaining
        .filter((r) => r.id !== point.id)
        .map((r) => r.id)
        .sort();
      await assert.rejects(call('purge_checkpoint', point.id, point.id), /409/);
      const deleted = (await call('delete_checkpoint', point.id)).find(
        (r) => r.status === 'Trashed',
      );
      const recovered = await call('recover_checkpoint', deleted.id);
      assert.ok(
        recovered.some((r) => r.id === point.id && r.status === 'Checkpoint'),
      );
      await call('trash_checkpoint', point.id);
      await assert.rejects(call('purge_checkpoint', deleted.id), /409/);
      await assert.rejects(call('restore_checkpoint', deleted.id), /409/);
      remaining = await call('purge_checkpoint', deleted.id, deleted.id);
      assert.deepEqual(remaining.map((r) => r.id).sort(), expected);
    }
    assert.deepEqual(await digest(profile), initial);
    await call('note', labelled, 'Before fight');
    await call('pin', labelled);
  });
  await server(async (call) => {
    const saved = (await call()).find((r) => r.id === labelled);
    assert.ok(saved.pinned);
    assert.equal(saved.note, 'Before fight');
    await writeFile(saved.path, 'incomplete');
    await assert.rejects(call('activate', saved.id), /409 .*integrity/i);
    assert.deepEqual(await digest(profile), initial);
  });
  assert.deepEqual(await digest(fixture), initial);
  console.log('Save integration tests passed.');
} finally {
  await rm(work, { recursive: true, force: true });
}
