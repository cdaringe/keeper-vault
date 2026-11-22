import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

assert.ok(process.env.KEEPER_SANDBOX_ROOT, 'Run version tests through make.');
const repo = await mkdtemp(join(tmpdir(), 'keeper-version-'));
const options = {
  cwd: repo,
  encoding: 'utf8' as const,
  env: {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  },
};
const git = (...args: string[]) => execFileSync('git', args, options).trim();
try {
  await mkdir(join(repo, 'backend'));
  await mkdir(join(repo, 'development'));
  await copyFile(
    new URL('../Makefile', import.meta.url),
    join(repo, 'Makefile'),
  );
  await copyFile(
    new URL('../development/version.ts', import.meta.url),
    join(repo, 'development/version.ts'),
  );
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'user.name', 'Version Test');
  git('config', 'user.email', 'version@example.invalid');
  git('add', '.');
  git('commit', '--quiet', '--message', 'Fixture');
  const head = git('rev-parse', 'HEAD');
  const bump = (component: string, expected: string) => {
    const result = execFileSync('make', ['version', '--', component], options);
    assert.ok(result.includes('Created local tag ' + expected));
    assert.equal(git('cat-file', '-t', 'refs/tags/' + expected), 'tag');
    assert.equal(git('rev-parse', expected + '^{commit}'), head);
    assert.equal(
      git('rev-parse', 'HEAD'),
      head,
      'Versioning must tag the existing commit',
    );
    assert.equal(
      git('status', '--porcelain'),
      '',
      'Versioning must not modify project files',
    );
  };
  bump('patch', '0.0.1');
  for (const tag of [
    '1.10.2',
    '1.9.99',
    '999.0.0-rc.1',
    'v99.0.0',
    '01.0.0',
    'release',
  ])
    git('tag', tag);
  bump('patch', '1.10.3');
  bump('minor', '1.11.0');
  bump('major', '2.0.0');
  const tags = git('tag', '--list');
  for (const args of [[], ['typo'], ['patch', 'minor'], ['patch', 'build']]) {
    const result = spawnSync('make', ['version', '--', ...args], options);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Usage: make version/);
    assert.equal(
      git('tag', '--list'),
      tags,
      'Invalid arguments must not create tags',
    );
  }
  console.log(
    'Verified version tagging through make: initial version, numeric ordering, all bumps, annotated HEAD tags, and invalid arguments.',
  );
} finally {
  await rm(repo, { recursive: true, force: true });
}
