// Respaldos automáticos de la base: una copia por día en data/respaldos/, conservando las más recientes
import { readdirSync, statSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { copyDbTo, openDb, readState, isEmpty, writeState } from './db.js';
import { sanitizeBackup } from '../src/js/logic/datos.js';
import { migrate } from '../src/js/logic/cuentas.js';
import { DEFAULT } from '../src/js/logic/estado.js';

// Nombre: gastos-2026-10-25_143005.db (fecha y hora locales). Solo se aceptan nombres con este formato
const NAME = /^gastos-(\d{4}-\d{2}-\d{2})_(\d{6})(-[a-z]+(?:-[a-z]+)*)?\.db$/;
export const isBackupName = name => NAME.test(name);

const pad = n => String(n).padStart(2, '0');
const stamp = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

// Lista de respaldos, del más nuevo al más viejo
export function listBackups(dir) {
  let names = [];
  try {
    names = readdirSync(dir).filter(isBackupName);
  } catch {
    return [];
  }
  return names
    .map(name => {
      const s = statSync(join(dir, name));
      return {
        name,
        size: s.size,
        created: s.mtime.toISOString(),
        day: name.match(NAME)[1],
        kind: name.match(NAME)[3]?.slice(1) || 'diario',
      };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

// 'suffix' distingue respaldos especiales (p. ej. 'manual', 'antes-de-restaurar') de los diarios
export function createBackup(db, dir, suffix = '', now = new Date()) {
  mkdirSync(dir, { recursive: true });
  let name = `gastos-${stamp(now)}${suffix ? '-' + suffix : ''}.db`;
  // Dos respaldos en el mismo segundo: se agrega un segundo al nombre
  for (let d = new Date(now); listBackups(dir).some(b => b.name === name); ) {
    d = new Date(d.getTime() + 1000);
    name = `gastos-${stamp(d)}${suffix ? '-' + suffix : ''}.db`;
  }
  copyDbTo(db, join(dir, name));
  return name;
}

// Borra los más viejos y deja 'keep'. Devuelve los nombres borrados
export function pruneBackups(dir, keep) {
  const old = listBackups(dir).slice(keep);
  for (const b of old) unlinkSync(join(dir, b.name));
  return old.map(b => b.name);
}

// Crea el respaldo del día si todavía no existe (y si hay datos que respaldar)
export function ensureDailyBackup(db, dir, keep, now = new Date()) {
  if (isEmpty(db)) return null;
  const today = stamp(now).slice(0, 10);
  if (listBackups(dir).some(b => b.day === today && b.kind === 'diario')) return null;
  const name = createBackup(db, dir, '', now);
  pruneBackups(dir, keep);
  return name;
}

// Reemplaza los datos actuales por los de un respaldo. Antes guarda una copia de lo actual
export function restoreBackup(db, dir, name) {
  if (!isBackupName(name)) throw Object.assign(new Error('Nombre de respaldo inválido'), { status: 400 });
  const src = openDb(join(dir, name), { readOnly: true });
  try {
    if (isEmpty(src)) throw Object.assign(new Error('El respaldo no tiene datos'), { status: 400 });
    // Un archivo en disco no es de fiar: sus datos pasan por la misma validación que un respaldo JSON
    const data = migrate(sanitizeBackup(readState(src), DEFAULT));
    const safety = createBackup(db, dir, 'antes-de-restaurar');
    writeState(db, data);
    return safety;
  } finally {
    src.close();
  }
}
