import { constants } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'site-assets');
await mkdir(output, { recursive: true });
for (const name of await readdir(join(root, 'dist/site-assets'))) {
  const source = join(root, 'dist/site-assets', name);
  const destination = join(output, name);
  try {
    await copyFile(source, destination, constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!(await readFile(source)).equals(await readFile(destination))) {
      throw new Error(
        `Se conservó ${destination}: contiene cambios distintos del archivo generado.`,
      );
    }
  }
}
// Se retienen los archivos con hash anteriores para que las pestañas con HTML en caché sigan cargando.
await copyFile(join(root, 'dist/index.html'), join(root, 'index.html'));
await writeFile(join(root, '.nojekyll'), '');
console.log('Versión estática preparada en index.html y site-assets/ para Pages desde main.');
