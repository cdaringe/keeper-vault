import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { digest } from './files.ts';
import { withServer } from './server.ts';

interface Manifest {
  kind: string;
  slot: string;
  hashes: Record<string, string>;
}

const [binaryArg, checkpointArg] = process.argv.slice(2);
if (!binaryArg || !checkpointArg)
  throw Error(
    'Use make test-recovery CHECKPOINT="/path/to/checkpoint-directory".',
  );
const source = resolve(checkpointArg);
const id = basename(source);
assert.match(id, /^checkpoint-/);
const original = await digest(source);
const work = await mkdtemp(join(tmpdir(), 'keeper-recovery-'));
try {
  const profile = join(work, 'profile');
  const data = join(work, 'data');
  const checkpoint = join(
    data,
    'keeper-vault',
    createHash('sha256').update(profile).digest('hex'),
    id,
  );
  await mkdir(profile);
  await cp(source, checkpoint, { recursive: true });
  const manifests: Manifest[] = [];
  for (const member of await readdir(checkpoint)) {
    if (!member.startsWith('save-')) continue;
    const root = join(checkpoint, member);
    const manifest: Manifest = JSON.parse(
      await readFile(join(root, 'snapshot.json'), 'utf8'),
    );
    assert.ok(['World', 'Character'].includes(manifest.kind));
    assert.match(manifest.slot, /^\d+$/);
    for (const [path, expected] of Object.entries(manifest.hashes)) {
      const rel = relative(root, join(root, path));
      assert.ok(!isAbsolute(path) && rel !== '..' && !rel.startsWith('../'));
      const bytes = await readFile(join(root, path));
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        expected,
        'Checkpoint integrity: ' + path,
      );
      const target = join(profile, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
    manifests.push(manifest);
  }
  assert.ok(manifests.length >= 1 && manifests.length <= 2);
  await writeFile(
    join(profile, 'unrelated-file'),
    'Preserve unrelated profile files.',
  );
  const expected = await digest(profile);
  const copied = await digest(checkpoint);
  await withServer(resolve(binaryArg), profile, data, async (call) => {
    assert.ok(
      (await call()).some(
        (row) => row.id === id && row.status === 'Checkpoint',
      ),
    );
    for (const manifest of manifests) {
      for (const path of Object.keys(manifest.hashes)) {
        await writeFile(
          join(profile, path),
          'Changed after checkpoint: ' + path,
        );
      }
      if (manifest.kind === 'Character') {
        const path = join('maps', manifest.slot, '999999999.mapparts.gzip');
        assert.ok(!(path in expected));
        await mkdir(dirname(join(profile, path)), { recursive: true });
        await writeFile(join(profile, path), 'Explored after checkpoint.');
      }
    }
    assert.deepEqual(
      await digest(checkpoint),
      copied,
      'Live writes must not change checkpoint files',
    );
    const restored = await call('restore_checkpoint', id);
    assert.deepEqual(
      await digest(profile),
      expected,
      'Restore must recover every original byte and remove later map data',
    );
    assert.equal(
      restored.filter(
        (row) => row.status === 'Backup' && row.restore_target === id,
      ).length,
      manifests.length,
    );
    assert.deepEqual(
      await digest(checkpoint),
      copied,
      'Restore must preserve the checkpoint',
    );
  });
  assert.deepEqual(
    await digest(source),
    original,
    'The source checkpoint must remain unchanged',
  );
  const files = manifests.reduce(
    (count, manifest) => count + Object.keys(manifest.hashes).length,
    0,
  );
  console.log(
    `Recovery verified: ${files} save files restored from ${id}; original checkpoint unchanged.`,
  );
} finally {
  await rm(work, { recursive: true, force: true });
}
