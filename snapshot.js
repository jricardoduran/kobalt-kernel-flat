/**
 * snapshot.js — Disciplina de snapshots del repositorio Kobalt FLAT
 *
 * Qué hace:
 *   1. Crea un git tag con timestamp legible
 *   2. Genera un zip del repo excluyendo credenciales y artefactos
 *   3. Guarda el zip en /snapshots/
 *
 * Cuándo usarlo:
 *   - Antes de un cambio arquitectónico grande
 *   - Después de completar una fase funcional completa
 *   - Cuando el usuario lo solicita explícitamente
 *   - Antes de experimentar algo que podría romper el sistema
 *
 * Uso:
 *   node snapshot.js          → solo snapshot
 *   npm run snap-deploy       → snapshot + deploy
 */

import { execSync }        from 'child_process';
import fs                  from 'fs';
import path                from 'path';
import { fileURLToPath }   from 'url';
import archiver            from 'archiver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Timestamp legible ──────────────────────────────────────────────────────
const now = new Date();
const ts  = now.toISOString()
  .replace(/[-:]/g, '')
  .replace('T', '_')
  .slice(0, 15); // "20260404_143022"

const tagName     = 'snapshot-' + ts;
const snapshotDir = path.join(__dirname, 'snapshots');
const zipPath     = path.join(snapshotDir, tagName + '.zip');

// ── Crear carpeta snapshots si no existe ──────────────────────────────────
if (!fs.existsSync(snapshotDir))
  fs.mkdirSync(snapshotDir, { recursive: true });

// ── Git tag ────────────────────────────────────────────────────────────────
try {
  execSync('git tag ' + tagName, { stdio: 'pipe' });
  console.log('✓ Tag creado:', tagName);
} catch (e) {
  console.warn('⚠ No se pudo crear tag git:', e.message.trim());
}

// ── Zip del repositorio ───────────────────────────────────────────────────
const output  = fs.createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const mb = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log('✓ Snapshot:', zipPath);
  console.log('  Tamaño:  ', mb, 'MB');
  console.log('  Tag git: ', tagName);
  console.log('\nPara restaurar este snapshot:');
  console.log('  git checkout', tagName);
});

archive.on('error', err => { throw err; });
archive.pipe(output);

// Añadir todos los archivos excepto los excluidos
archive.glob('**/*', {
  cwd: __dirname,
  ignore: [
    '.git/**',
    'snapshots/**',
    'node_modules/**',
    '**/*.zip',
    'data/users.json',                              // credenciales de usuarios
    'storages/GitLab/services/kobalt1.json',        // service_key real
  ],
  dot: true, // incluir archivos ocultos (.gitignore, .claude/, etc.)
});

archive.finalize();
