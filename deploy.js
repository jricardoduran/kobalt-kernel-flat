import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ENDPOINT = 'https://kobalt.app/flat/testClaudeCode/deploy.php';
const IGNORE   = [
  'node_modules', '.git', '.claude', '.claude-flow', '.swarm',
  'deploy.js', 'deploy.php', 'current', 'data',
  'package.json', 'package-lock.json',
  'snapshots',    // zips locales — no van al servidor
];

function collectFiles(dir, base = dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORE.includes(entry)) continue;
    const full = join(dir, entry);
    const rel  = relative(base, full).replace(/\\/g, '/');
    if (statSync(full).isDirectory()) files.push(...collectFiles(full, base));
    else files.push({ full, rel });
  }
  return files;
}

async function deployFile({ full, rel }) {
  const content = readFileSync(full, 'utf8');
  const res = await fetch(ENDPOINT + '?action=file', {
    method  : 'POST',
    headers : { 'Content-Type': 'application/json' },
    body    : JSON.stringify({ filename: rel, content }),
  });
  return res.json();
}

async function main() {
  console.log('Deploy ->', ENDPOINT);
  const files = collectFiles(process.cwd());
  console.log(files.length + ' archivos\n');

  let ok = 0, fail = 0;
  for (const file of files) {
    try {
      await deployFile(file);
      console.log('  ok ' + file.rel);
      ok++;
    } catch (e) {
      console.log('  fail ' + file.rel + ' - ' + e.message);
      fail++;
    }
  }

  console.log('\n' + ok + ' ok · ' + fail + ' errores');
  console.log('Ver en: ' + ENDPOINT.replace('deploy.php', 'current/'));
}

main().catch(console.error);
