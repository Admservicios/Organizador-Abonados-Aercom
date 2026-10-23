import { cp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'release', 'pc');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(root, 'dist'), join(output, 'web'), { recursive: true });
await cp(join(root, 'dist-server'), join(output, 'server'), { recursive: true });
await mkdir(join(output, 'runtime'), { recursive: true });
await cp(
  process.execPath,
  join(output, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node'),
  { dereference: true },
);
const launcher = await readFile(join(root, 'deployment', 'launcher.vbs'), 'utf8');
await writeFile(
  join(output, 'Taller Calamante.vbs'),
  Buffer.concat([Buffer.from([255, 254]), Buffer.from(launcher, 'utf16le')]),
);
const icon = await readFile(join(root, 'icons', 'app-192.png'));
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = 192;
header[7] = 192;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(icon.length, 14);
header.writeUInt32LE(22, 18);
await writeFile(join(output, 'taller.ico'), Buffer.concat([header, icon]));
await cp(join(root, 'deployment', 'LEEME.txt'), join(output, 'LEEME.txt'));
await cp(join(root, 'deployment', 'iniciar.sh'), join(output, 'iniciar.sh'));
// La licencia del runtime se obtiene de la distribución oficial en Windows.
if (process.platform === 'win32') {
  const license = await readFile(resolve(process.execPath, '..', 'LICENSE')).catch(() => null);
  if (!license) throw new Error('Falta la licencia de Node.js en el runtime de Windows.');
  await writeFile(join(output, 'runtime', 'LICENSE'), license);
}
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
let notices = 'Taller Calamante - Licencias de dependencias incluidas\n\n';
for (const [path, meta] of Object.entries(lock.packages ?? {})) {
  if (!path.startsWith('node_modules/') || meta.dev) continue;
  notices += `\n${path.replace('node_modules/', '')} ${meta.version ?? ''} (${meta.license ?? 'ver paquete'})\n`;
  for (const filename of ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'license', 'LICENSE-MIT']) {
    const text = await readFile(join(root, path, filename), 'utf8').catch(() => null);
    if (text) {
      notices += text + '\n';
      break;
    }
  }
}
await writeFile(join(output, 'THIRD-PARTY-NOTICES.txt'), notices);
const files = {};
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collect(path);
    else
      files[relative(output, path).replaceAll('\\', '/')] = [
        new Uint8Array(await readFile(path)),
        { level: 6 },
      ];
  }
}
await collect(output);
const name = `Taller-Calamante-Portable-${process.platform}-${process.arch}.zip`;
await writeFile(join(root, 'release', name), zipSync(files));
console.log(`Paquete creado: release/${name}`);
