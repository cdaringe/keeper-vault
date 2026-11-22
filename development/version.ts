import { execFileSync } from 'node:child_process';

function git(...args: string[]) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

try {
  const args = process.argv.slice(2);
  const component = ['major', 'minor', 'patch'].indexOf(args[0]);
  if (args.length !== 1 || component === -1) {
    throw Error('Usage: make version -- patch|minor|major');
  }
  const head = git('rev-parse', '--verify', 'HEAD^{commit}');
  let latest = [0n, 0n, 0n];
  for (const tag of git('tag', '--list').split('\n')) {
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) continue;
    const candidate = tag.split('.').map(BigInt);
    const difference = candidate.findIndex(
      (value, index) => value !== latest[index],
    );
    if (difference !== -1 && candidate[difference] > latest[difference])
      latest = candidate;
  }
  latest[component] += 1n;
  for (let index = component + 1; index < latest.length; index++)
    latest[index] = 0n;
  const version = latest.join('.');
  git('tag', '--annotate', version, '--message', 'Release ' + version, head);
  console.log(`Created local tag ${version} at ${head.slice(0, 12)}.`);
} catch (error) {
  const failure = error as Error & { stderr?: string };
  console.error(failure.stderr?.trim() || failure.message);
  process.exitCode = 1;
}
