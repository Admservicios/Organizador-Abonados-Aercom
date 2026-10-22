import { describe, it, expect } from 'vitest';
import {
  automaticBackupName,
  backupIsDue,
  backupToFolder,
  writeVerifiedBackup,
  type BackupDirectory,
  type BackupFolderSettings,
} from '../../src/lib/backupFolder';
import { emptyData, newDatabase, DATABASE_KEY } from '../../src/lib/localDatabase';
import { parsePhotoBackup } from '../../src/lib/photoBackup';

function directory(
  options: { permission?: PermissionState; failWrite?: boolean; corrupt?: boolean } = {},
) {
  const files = new Map<string, Blob>();
  const handle = {
    kind: 'directory',
    name: 'Copias de prueba',
    queryPermission: async () => options.permission ?? 'granted',
    getFileHandle: async (name: string, opts?: { create?: boolean }) => {
      if (!files.has(name)) {
        if (!opts?.create) throw new DOMException('No existe', 'NotFoundError');
        files.set(name, new Blob());
      }
      return {
        createWritable: async () => ({
          write: async (blob: Blob) => {
            if (options.failWrite) throw new Error('Disco lleno');
            files.set(name, options.corrupt ? new Blob(['roto']) : blob);
          },
          close: async () => {},
          abort: async () => {},
        }),
        getFile: async () => files.get(name)!,
      };
    },
    removeEntry: async (name: string) => {
      files.delete(name);
    },
  } as unknown as BackupDirectory;
  return { handle, files };
}
const now = new Date('2026-10-22T19:00:00Z');
const config = (directory: BackupDirectory): BackupFolderSettings => ({
  directory,
  enabled: true,
  intervalMinutes: 60,
});
describe('respaldos automáticos en carpeta', () => {
  it('escribe un ZIP restaurable, verifica sus bytes y no modifica los registros originales', async () => {
    const { handle, files } = directory();
    const raw = JSON.stringify(newDatabase(emptyData()));
    const storage = {
      getItem: (key: string) => (key === DATABASE_KEY ? raw : null),
      setItem: () => {
        throw new Error('No debe escribir en la base');
      },
    };
    const result = await backupToFolder(config(handle), storage, { now });
    expect(result.status).toBe('saved');
    if (result.status !== 'saved') throw new Error('No guardó');
    expect(result.settings.lastSuccess).toBe(now.toISOString());
    expect(result.settings.lastName).toMatch(
      /^taller-calamante-auto-2026-10-22160000-[a-f0-9]{8}\.zip$/,
    );
    const zip = files.get(result.settings.lastName!)!;
    expect((await parsePhotoBackup(new Uint8Array(await zip.arrayBuffer()))).backup.data).toEqual(
      emptyData(),
    );
    expect(
      await backupToFolder(result.settings, storage, { now: new Date('2026-10-24T19:00:00Z') }),
    ).toEqual({ status: 'unchanged' });
    expect(files.size).toBe(1);
  });
  it('respeta pausas e intervalos y permite una copia manual aunque no haya cambios', async () => {
    const { handle, files } = directory();
    const settings = {
      ...config(handle),
      lastSnapshot: 'a'.repeat(64),
      lastSuccess: now.toISOString(),
    };
    expect(backupIsDue(settings, 'b'.repeat(64), now.getTime() + 59 * 60000)).toBe(false);
    expect(backupIsDue(settings, 'b'.repeat(64), now.getTime() + 60 * 60000)).toBe(true);
    expect(
      backupIsDue({ ...settings, enabled: false }, 'b'.repeat(64), now.getTime() + 86400000),
    ).toBe(false);
    const storage = { getItem: () => null, setItem: () => {} };
    expect((await backupToFolder({ ...config(handle), enabled: false }, storage)).status).toBe(
      'disabled',
    );
    await backupToFolder(settings, storage, { force: true, now });
    await backupToFolder(settings, storage, { force: true, now });
    expect(files.size).toBe(2);
    expect(automaticBackupName(now)).not.toBe(automaticBackupName(now));
  });
  it('no escribe sin permiso, con base dañada ni cuando deja de estar autorizado el modo local', async () => {
    const denied = directory({ permission: 'prompt' });
    expect(
      (await backupToFolder(config(denied.handle), { getItem: () => null, setItem: () => {} }))
        .status,
    ).toBe('permission');
    expect(denied.files.size).toBe(0);
    const { handle, files } = directory();
    await expect(
      backupToFolder(config(handle), { getItem: () => '{roto', setItem: () => {} }),
    ).rejects.toThrow('base local');
    expect(
      (
        await backupToFolder(
          config(handle),
          { getItem: () => null, setItem: () => {} },
          { canRun: () => false },
        )
      ).status,
    ).toBe('cancelled');
    expect(files.size).toBe(0);
  });
  it('un fallo de escritura o verificación limpia solo el archivo nuevo y conserva copias previas', async () => {
    for (const options of [{ failWrite: true }, { corrupt: true }]) {
      const { handle, files } = directory(options);
      const previous = new Blob(['copia previa']);
      files.set('copia-previa.zip', previous);
      await expect(writeVerifiedBackup(handle, new Blob(['nuevo']), 'nuevo.zip')).rejects.toThrow();
      expect(files.size).toBe(1);
      expect(await files.get('copia-previa.zip')!.text()).toBe('copia previa');
    }
    const { handle, files } = directory();
    files.set('existente.zip', new Blob(['conservar']));
    await expect(writeVerifiedBackup(handle, new Blob(['nuevo']), 'existente.zip')).rejects.toThrow(
      'No se sobrescribió',
    );
    expect(await files.get('existente.zip')!.text()).toBe('conservar');
  });
});
