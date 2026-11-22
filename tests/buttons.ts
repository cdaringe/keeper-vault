import type { AddressInfo } from 'node:net';
import type { Locator } from 'playwright-core';
// Render the production bundle with controlled save states and an in-flight request.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { chromium } from 'playwright-core';

const pageSource = await readFile(
  new URL('../dist/vault.html', import.meta.url),
);
const server = createServer((_, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(pageSource);
}).listen(0, '127.0.0.1');
await once(server, 'listening');
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.BROWSER || undefined,
  });
  const page = await browser.newPage();
  const url = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const world = {
    name: 'Test world',
    id: 'World-0',
    slot: '0',
    kind: 'World',
    status: 'Live',
    created: '',
    path: '',
    note: '',
    pinned: false,
  };
  let saves = [world];
  await page.route('**/saves', (r) => r.fulfill({ json: saves }));
  let running = false;
  await page.route('**/game-status', (r) => r.fulfill({ json: running }));
  const tab = (name: string) =>
    page.getByRole('navigation').getByRole('button', { name, exact: true });
  await page.goto(url);
  assert.equal(await tab('Pinned').count(), 0);
  assert.equal(await tab('Current saves').count(), 0);
  const create = page.getByRole('button', {
    name: 'Create checkpoint',
    exact: true,
  });
  const restore = page
    .getByRole('table', { name: 'Checkpoints' })
    .getByRole('button', { name: 'Restore', exact: true })
    .first();
  const tooltip = async (button: Locator, reason: string) => {
    assert.ok(await button.isDisabled());
    const wrapper = button.locator('..');
    await wrapper.hover();
    await wrapper.getByRole('tooltip', { name: reason }).waitFor();
    await page.mouse.move(0, 0);
    await wrapper.focus();
    await wrapper.getByRole('tooltip', { name: reason }).waitFor();
    assert.equal(
      await button.getAttribute('aria-describedby'),
      await wrapper.locator('.reason').getAttribute('id'),
    );
  };
  await page
    .getByRole('option', { name: 'Test world', exact: true })
    .waitFor({ state: 'attached' });
  await tooltip(create, 'Choose a save or Skip in each dropdown.');
  await page.getByLabel('World', { exact: true }).selectOption(world.id);
  await tooltip(create, 'Choose a character or Skip character.');
  await page.getByLabel('Character', { exact: true }).selectOption('skip');
  assert.ok(await create.isEnabled());
  await page.getByLabel('World', { exact: true }).selectOption('skip');
  await tooltip(create, 'Include at least one save.');
  await tooltip(restore, 'Create a checkpoint first.');
  const character = {
    ...world,
    kind: 'Character',
    slot: '1',
    id: 'Character-1',
    name: 'Missy',
  };
  saves = [
    world,
    character,
    { ...world, id: 'World-2', slot: '2', name: 'Zebra', pinned: true },
  ];
  await page.reload();
  await page
    .getByRole('option', { name: 'Missy', exact: true })
    .waitFor({ state: 'attached' });
  await tab('Worlds').click();
  assert.equal(
    await page.locator('#list article .title').first().textContent(),
    'Zebra',
  );
  assert.ok(await create.isHidden());
  await page.getByRole('button', { name: 'Add note' }).first().click();
  await page
    .getByRole('textbox', { name: 'Note' })
    .fill('First line\nSecond line');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await tab('Checkpoints').click();
  const pending = Promise.withResolvers<void>();
  await page.route('**/action', async (route) => {
    await pending.promise;
    const cmd = route.request().postDataJSON();
    if (cmd.op === 'pin')
      saves = saves.map((row) =>
        row.id === cmd.id ? { ...row, pinned: !row.pinned } : row,
      );
    await route.fulfill({
      json: [
        ...saves,
        {
          ...world,
          id: 'older',
          kind: 'Checkpoint',
          status: 'Checkpoint',
          name: 'Older checkpoint',
          note: 'Before exploring',
          created: '2025-01-01',
        },
        {
          ...world,
          id: 'deleted',
          kind: 'Checkpoint',
          status: 'Trashed',
          name: 'Deleted checkpoint',
          created: '2024-01-01',
        },
        { ...world, id: 'manual', status: 'Manual backup' },
        {
          ...world,
          id: 'checkpoint-test',
          kind: 'Checkpoint',
          status: 'Checkpoint',
          name: 'Test world + Missy',
          created: '2026-01-01 01:01:01',
        },
      ],
    });
  });
  await page
    .getByLabel('Character', { exact: true })
    .selectOption(character.id);
  await tooltip(create, 'Choose a world or Skip world.');
  await page.getByLabel('World', { exact: true }).selectOption('skip');
  assert.ok(await create.isEnabled());
  await page.getByLabel('World', { exact: true }).selectOption(world.id);
  await create.click();
  await tooltip(create, 'Wait for the current save operation to finish.');
  await tab('Worlds').click();
  await tooltip(
    page.getByRole('button', { name: 'Back up now' }).first(),
    'Wait for the current save operation to finish.',
  );
  await tab('Checkpoints').click();
  pending.resolve();
  await page.getByText(/^Checkpoint created\./).waitFor();
  assert.ok(
    await page.getByText('Older checkpoint', { exact: true }).isVisible(),
  );
  await tab('Worlds').click();
  const worldRow = page
    .locator('#list article')
    .filter({ has: page.getByText(world.name, { exact: true }) });
  await worldRow
    .getByRole('button', { name: 'Pin ' + world.name, exact: true })
    .click();
  await worldRow
    .getByRole('button', { name: 'Unpin ' + world.name, exact: true })
    .waitFor();
  assert.equal(
    await page.locator('#list article .title').first().textContent(),
    world.name,
  );
  await worldRow.click({ button: 'right' });
  await worldRow.getByRole('button', { name: 'Show path' }).waitFor();
  await page.keyboard.press('Escape');
  await worldRow.getByRole('button', { name: 'View history' }).click();
  await page
    .getByRole('heading', { name: world.name + ' · Save history' })
    .waitFor();
  await page.locator('.timeline svg circle').nth(1).waitFor();
  await page.getByRole('button', { name: '← Worlds' }).click();
  await tab('Checkpoints').click();
  const table = page.getByRole('table', { name: 'Checkpoints' });
  const firstId = () => table.locator('tbody tr').first().getAttribute('id');
  assert.equal(await firstId(), 'point-checkpoint-test');
  for (const [label, first, reversed] of [
    ['Created', 'older', 'checkpoint-test'],
    ['Included saves', 'older', 'checkpoint-test'],
    ['Note', 'checkpoint-test', 'older'],
  ]) {
    const header = table.getByRole('columnheader', {
      name: label,
      exact: true,
    });
    await header.getByRole('button').click();
    assert.equal(await header.getAttribute('aria-sort'), 'ascending');
    assert.equal(await firstId(), 'point-' + first);
    await header.getByRole('button').click();
    assert.equal(await firstId(), 'point-' + reversed);
  }
  assert.ok(
    await table
      .locator('#point-checkpoint-test')
      .getByText('Latest', { exact: true })
      .isVisible(),
  );
  const deletedFilter = page.getByRole('combobox', {
    name: 'Checkpoint status',
  });
  await deletedFilter.selectOption('deleted');
  assert.equal(
    await page
      .getByRole('table', { name: 'Checkpoints' })
      .getByRole('columnheader')
      .count(),
    4,
  );
  assert.ok(
    await page.getByText('Deleted checkpoint', { exact: true }).isVisible(),
  );
  assert.ok(await restore.isHidden());
  await deletedFilter.selectOption('active');
  assert.ok(await restore.isEnabled());
  assert.ok(await create.isEnabled());
  await page.getByText('Core Keeper not running', { exact: true }).waitFor();
  running = true;
  await page.getByText('Core Keeper running', { exact: true }).waitFor();
  const toggle = page.getByRole('switch', { name: 'Dangerous mode' });
  assert.equal(await toggle.count(), 0);
  assert.ok(await restore.isDisabled());
  await restore.locator('..').focus();
  await page.keyboard.press('Enter');
  await toggle.waitFor();
  assert.ok(!(await toggle.isChecked()));
  await toggle.check();
  assert.ok(await restore.isEnabled());
  await page.getByRole('button', { name: 'Backups', exact: true }).click();
  const single = page.getByRole('button', { name: 'Restore', exact: true });
  assert.ok(await single.isEnabled());
  await single.click();
  const authorized = page.waitForRequest(
    (r) => r.url().endsWith('/action') && r.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Back up & restore' }).click();
  assert.equal((await authorized).postDataJSON().dangerous_mode, true);
  await page.getByText(/^Version restored/).waitFor();
  await toggle.uncheck();
  assert.ok(await single.isDisabled());
  await tab('Checkpoints').click();
  assert.ok(await restore.isDisabled());
  await toggle.check();
  running = false;
  await page.getByText('Core Keeper not running', { exact: true }).waitFor();
  assert.equal(await toggle.count(), 0);
  console.log(
    'Verified save names, disabled actions, hover and focus tooltips, and re-enabling.',
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  server.close();
}
