import { constants } from 'node:fs';
import { copyFile, readdir, rename, writeFile } from 'node:fs/promises';

// app.html es la entrada editable; index.html es la salida que sirve un alojamiento estático.
await rename(
  new URL('../dist/app.html', import.meta.url),
  new URL('../dist/index.html', import.meta.url),
);
await writeFile(new URL('../dist/.nojekyll', import.meta.url), '');

// Conservar recursos con hash anteriores evita romper pestañas que aún tienen el HTML en caché.
let retained = [];
try {
  retained = await readdir(new URL('../site-assets/', import.meta.url));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
for (const name of retained) {
  try {
    await copyFile(
      new URL(`../site-assets/${name}`, import.meta.url),
      new URL(`../dist/site-assets/${name}`, import.meta.url),
      constants.COPYFILE_EXCL,
    );
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}
