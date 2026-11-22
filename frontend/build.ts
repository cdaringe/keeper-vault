import { build } from 'esbuild';
import { transform } from '@solidjs/compiler';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const { outputFiles } = await build({
  entryPoints: ['frontend/app.tsx'],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  plugins: [
    {
      name: 'solid-tsx',
      setup(build) {
        build.onLoad({ filter: /\.tsx$/ }, async ({ path }) => ({
          contents: transform(await readFile(path, 'utf8'), { filename: path })
            .code,
          loader: 'ts',
        }));
      },
    },
  ],
});
const css = await readFile('frontend/styles.css', 'utf8');
const template = (await readFile('frontend/vault.html', 'utf8')).replace(
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
