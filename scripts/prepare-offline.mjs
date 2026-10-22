import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';

export async function prepareOffline(dist) {
  const files = [
    'index.html',
    'manifest.webmanifest',
    ...(await readdir(new URL('icons/', dist))).map((name) => `icons/${name}`),
    ...(await readdir(new URL('site-assets/', dist))).map((name) => `site-assets/${name}`),
  ].sort();
  const hash = createHash('sha256');
  for (const file of files) hash.update(file).update(await readFile(new URL(file, dist)));
  const template = await readFile(new URL('./service-worker.js', import.meta.url), 'utf8');
  hash.update(template);
  const worker = template
    .replace('__BUILD_ID__', hash.digest('hex').slice(0, 20))
    .replace(
      '__INDEX_HASH__',
      createHash('sha256')
        .update(await readFile(new URL('index.html', dist)))
        .digest('hex'),
    )
    .replace('/*__PRECACHE__*/ []', JSON.stringify(files));
  await writeFile(new URL('sw.js', dist), worker);
}
