import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb, readState, writeState, isEmpty } from '../server/db.js';
import { listBackups, createBackup, pruneBackups, ensureDailyBackup, restoreBackup, isBackupName } from '../server/respaldos.js';
import { migrate } from '../src/js/logic/cuentas.js';
import { DEFAULT } from '../src/js/logic/estado.js';

const conGasto = desc =>
  migrate({
    ...structuredClone(DEFAULT),
    tx: [{ id: 1, type: 'gasto', date: '2026-10-01', desc, amount: 120.5, account: 'banco', cat: 'Otros', note: '' }],
  });

describe('respaldos', () => {
  let dir, db;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gastos-test-'));
    db = openDb(join(dir, 'gastos.db'));
    writeState(db, conGasto('Original'));
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const backups = () => join(dir, 'respaldos');

  it('crea una copia íntegra que se puede abrir y leer', () => {
    const name = createBackup(db, backups(), '', new Date(2026, 9, 25, 14, 30, 5));
    expect(name).toBe('gastos-2026-10-25_143005.db');
    const copy = openDb(join(backups(), name), { readOnly: true });
    expect(readState(copy).tx[0].desc).toBe('Original');
    copy.close();
  });

  it('crea solo un respaldo diario por día', () => {
    const day = new Date(2026, 9, 25, 9, 0, 0);
    expect(ensureDailyBackup(db, backups(), 30, day)).toBeTruthy();
    expect(ensureDailyBackup(db, backups(), 30, new Date(2026, 9, 25, 18, 0, 0))).toBeNull();
    expect(ensureDailyBackup(db, backups(), 30, new Date(2026, 9, 26, 8, 0, 0))).toBeTruthy();
    expect(listBackups(backups()).map(b => b.day)).toEqual(['2026-10-26', '2026-10-25']);
  });

  it('un respaldo manual no cuenta como el diario', () => {
    createBackup(db, backups(), 'manual', new Date(2026, 9, 25, 8, 0, 0));
    expect(ensureDailyBackup(db, backups(), 30, new Date(2026, 9, 25, 9, 0, 0))).toBeTruthy();
    expect(
      listBackups(backups())
        .map(b => b.kind)
        .sort()
    ).toEqual(['diario', 'manual']);
  });

  it('no respalda una base vacía', () => {
    const empty = openDb(':memory:');
    expect(isEmpty(empty)).toBe(true);
    expect(ensureDailyBackup(empty, backups(), 30)).toBeNull();
  });

  it('conserva solo los más recientes', () => {
    for (let d = 1; d <= 5; d++) createBackup(db, backups(), '', new Date(2026, 9, d, 12, 0, 0));
    expect(pruneBackups(backups(), 3)).toEqual(['gastos-2026-10-02_120000.db', 'gastos-2026-10-01_120000.db']);
    expect(listBackups(backups()).map(b => b.day)).toEqual(['2026-10-05', '2026-10-04', '2026-10-03']);
  });

  it('dos respaldos en el mismo segundo no se pisan', () => {
    const t = new Date(2026, 9, 25, 10, 0, 0);
    const a = createBackup(db, backups(), '', t);
    const b = createBackup(db, backups(), '', t);
    expect(a).not.toBe(b);
    expect(listBackups(backups())).toHaveLength(2);
  });

  it('restaurar devuelve los datos del respaldo y guarda antes una copia de lo actual', () => {
    const name = createBackup(db, backups(), '', new Date(2026, 9, 20, 12, 0, 0));
    writeState(db, conGasto('Cambiado después'));
    const safety = restoreBackup(db, backups(), name);
    expect(readState(db).tx[0].desc).toBe('Original');
    expect(safety).toMatch(/-antes-de-restaurar\.db$/);
    // La copia de seguridad debe aparecer en la lista (para poder descargarla o volver a ella)
    expect(listBackups(backups()).find(b => b.name === safety)?.kind).toBe('antes-de-restaurar');
    const copy = openDb(join(backups(), safety), { readOnly: true });
    expect(readState(copy).tx[0].desc).toBe('Cambiado después');
    copy.close();
  });

  it('rechaza nombres que no son de respaldo (evita leer otros archivos)', () => {
    for (const bad of ['../gastos.db', 'gastos.db', 'gastos-2026-10-25_143005.db/../../x', 'otro.txt'])
      expect(isBackupName(bad), bad).toBe(false);
    expect(() => restoreBackup(db, backups(), '../gastos.db')).toThrow(/inválido/);
  });

  it('ignora archivos ajenos en la carpeta de respaldos', () => {
    createBackup(db, backups(), '', new Date(2026, 9, 25, 12, 0, 0));
    writeFileSync(join(backups(), 'notas.txt'), 'hola');
    expect(listBackups(backups()).map(b => b.name)).toEqual(['gastos-2026-10-25_120000.db']);
    expect(existsSync(join(backups(), 'notas.txt'))).toBe(true);
  });
});
