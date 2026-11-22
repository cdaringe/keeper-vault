import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

export async function digest(
  root: string,
  dir = root,
  result: Record<string, string> = {},
) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) await digest(root, path, result);
    else if (item.isFile())
      result[relative(root, path)] = createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
    else
      throw Error(
        'Test fixtures must contain regular files and directories: ' + path,
      );
  }
  return result;
}
