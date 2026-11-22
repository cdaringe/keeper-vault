import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { createFixture } from './fixture.ts';
import { digest } from './files.ts';
import { withServer } from './server.ts';

const binary = process.argv[2];
assert.ok(binary, 'Pass the compiled application.');
const work = await mkdtemp(join(tmpdir(), 'keeper-refresh-'));
let browser: Browser | undefined;
try {
  const profile = join(work, 'profile');
  await mkdir(profile);
  await createFixture(profile);
  await withServer(
    resolve(binary),
    profile,
    join(work, 'data'),
    async (call, base) => {
      const live = (await call()).filter((row) => row.status === 'Live');
      const world = live.find((row) => row.kind === 'World');
      const character = live.find((row) => row.kind === 'Character');
      const savedAt = new Date(2025, 10, 21, 10, 11, 12);
      const characterAt = new Date(2025, 10, 21, 10, 9, 8);
      await utimes(world.path, savedAt, savedAt);
      await utimes(character.path, characterAt, characterAt);
      browser = await chromium.launch({
        executablePath: process.env.BROWSER || undefined,
      });
      const page = await browser.newPage();
      let actions = 0;
      page.on('request', (request) => {
        if (request.url().endsWith('/action') && request.method() === 'POST')
          actions++;
      });
      await page.goto(base);
      await page.getByLabel('World', { exact: true }).selectOption(world.id);
      await page
        .getByLabel('Character', { exact: true })
        .selectOption(character.id);
      const worldTime = page.locator('#world-save-time time');
      const characterTime = page.locator('#character-save-time time');
      await page
        .locator('#world-save-time')
        .getByText('2025-11-21 10:11:12', { exact: true })
        .waitFor();
      assert.equal(await characterTime.textContent(), '2025-11-21 10:09:08');

      // Simulate another game save, then refresh through the real HTTP server.
      const updatedAt = new Date(2025, 10, 21, 10, 20, 30);
      await writeFile(
        world.path,
        Buffer.concat([
          await readFile(world.path),
          Buffer.from('new progress'),
        ]),
      );
      await utimes(world.path, updatedAt, updatedAt);
      const beforeRefresh = await digest(profile);
      const refresh = page.getByRole('button', {
        name: 'Refresh saves',
        exact: true,
      });
      const refreshed = page.waitForResponse((response) =>
        response.url().endsWith('/saves'),
      );
      await refresh.click();
      assert.equal((await refreshed).request().method(), 'GET');
      await page
        .locator('#world-save-time')
        .getByText('2025-11-21 10:20:30', { exact: true })
        .waitFor();
      assert.equal(
        await page.getByLabel('World', { exact: true }).inputValue(),
        world.id,
      );
      assert.equal(
        await page.getByLabel('Character', { exact: true }).inputValue(),
        character.id,
      );
      assert.equal(actions, 0, 'Refresh must not send a save operation');
      assert.deepEqual(
        await digest(profile),
        beforeRefresh,
        'Refresh must not write to the game profile',
      );

      const create = page.getByRole('button', {
        name: 'Create checkpoint',
        exact: true,
      });
      const checkedAt = await page
        .locator('#save-refresh-time time')
        .getAttribute('datetime');
      await page.route('**/saves', (route) =>
        route.fulfill({ status: 503, body: 'Test read failure' }),
      );
      await refresh.click();
      await page
        .getByText(/Could not refresh saves: Test read failure/)
        .waitFor();
      assert.equal(
        await page.locator('#save-refresh-time time').getAttribute('datetime'),
        checkedAt,
      );
      assert.equal(await worldTime.textContent(), '2025-11-21 10:20:30');
      assert.ok(await create.isDisabled());
      await create.locator('..').focus();
      await page
        .getByRole('tooltip', {
          name: 'Refresh saves successfully before creating a checkpoint.',
        })
        .waitFor();
      assert.ok(await refresh.isEnabled());
      await page.unroute('**/saves');
      await refresh.click();
      await page
        .getByText('Saves refreshed from disk.', { exact: true })
        .waitFor();
      assert.ok(await create.isEnabled());
      await create.click();
      await page.getByText('Checkpoint created.', { exact: true }).waitFor();
      const checkpointRow = page
        .getByRole('table', { name: 'Checkpoints' })
        .locator('tbody tr')
        .first();
      assert.ok(
        await checkpointRow
          .getByText('World: Cavern (0)', { exact: true })
          .isVisible(),
      );
      assert.ok(
        await checkpointRow
          .getByText('Character: Ash (1)', { exact: true })
          .isVisible(),
      );
      assert.equal(
        await checkpointRow.locator('time').nth(0).textContent(),
        '2025-11-21 10:20:30',
      );
      assert.equal(
        await checkpointRow.locator('time').nth(1).textContent(),
        '2025-11-21 10:09:08',
      );

      const later = new Date(2025, 10, 21, 11, 22, 33);
      await utimes(world.path, later, later);
      await refresh.click();
      await page
        .locator('#world-save-time')
        .getByText('2025-11-21 11:22:33', { exact: true })
        .waitFor();
      assert.equal(
        await checkpointRow.locator('time').nth(0).textContent(),
        '2025-11-21 10:20:30',
        'Captured save time must not follow later live saves',
      );
      assert.equal(actions, 1);
      await page.reload();
      await checkpointRow
        .getByText('2025-11-21 10:20:30', { exact: true })
        .waitFor();
      console.log(
        'Verified real save refresh, exact saved-file times, failed refresh handling, and persisted checkpoint times.',
      );
    },
  );
} finally {
  await browser?.close();
  await rm(work, { recursive: true, force: true });
}
