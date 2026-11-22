import { build } from 'esbuild';
import { solidPlugin } from 'esbuild-plugin-solid';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const { outputFiles } = await build({
  entryPoints: ['ui/app.tsx'],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  plugins: [solidPlugin()],
});
const css = await readFile('ui/styles.css', 'utf8');
const template = (await readFile('ui/vault.html', 'utf8')).replace(
  '<!-- styles -->',
  () => '<style>' + css + '</style>',
);
await mkdir('dist', { recursive: true });
await writeFile(
  'dist/vault.html',
  template.replace(
    '<!-- app -->',
    () =>
      '<script>' +
      outputFiles[0].text.replaceAll('</script', '<\\/script') +
      '</script>',
  ),
);
await build({
  entryPoints: ['desktop/window.ts'],
  outfile: 'dist/window.js',
  format: 'iife',
  target: 'es2022',
});
