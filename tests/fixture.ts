import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';

export async function createFixture(root: string) {
  for (const [suffix, revision] of [
    ['', 'current'],
    ['.pugbackup', 'previous'],
  ]) {
    const name = {
      utf8LengthInBytes: 3,
      bytes: { offset0000: { byte0000: 65, byte0001: 115, byte0002: 104 } },
    };
    const files = {
      'worlds/0.world.gzip': gzipSync(revision),
      'worldinfos/0.worldinfo': JSON.stringify({
        name: 'Cavern',
        creationDate: { year: 2025, month: 2, day: 1 },
      }),
      'worldgenparams/0.json': '{}',
      'saves/1.json': JSON.stringify({
        characterCustomizationNew: { name },
        revision,
      }),
      'maps/1/0.mapparts.gzip': gzipSync(revision),
    };
    for (const [relative, contents] of Object.entries(files)) {
      const path = join(root, relative + suffix);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents);
    }
  }
}
