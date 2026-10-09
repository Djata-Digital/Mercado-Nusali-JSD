/** FASE 8C.3 — backup COMPLETO (esquema + dados) da producao via pg_dump (somente leitura). Nunca imprime a URL nem dados. */
const path = require('path'); const cp = require('child_process'); const fs = require('fs'); const crypto = require('crypto');
const root = 'C:/Users/djata/Desktop/Mercado Nusali';
require(path.join(root, 'node_modules/dotenv')).config({ path: path.join(root, '.env') });
const dir = 'C:/Users/djata/Backups/mercado-nusali';
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const name = `mercado-nusali-full-${stamp}.dump`;
const sh = `pg_dump "$PGURL" -Fc --no-owner --no-privileges --verbose -f /tmp/${name} 2> /tmp/${name}.log; echo "exit=$?"; ls -l /tmp/${name} | awk '{print $5}'`;
const r = cp.spawnSync('docker', ['exec', '-e', 'PGURL', 'nusali-pg17-restore', 'sh', '-c', sh], { env: { ...process.env, PGURL: process.env.DATABASE_URL }, encoding: 'utf8' });
console.log((r.stdout || '').trim());
cp.execSync(`docker cp nusali-pg17-restore:/tmp/${name} "${dir}/${name}"`);
cp.execSync(`docker cp nusali-pg17-restore:/tmp/${name}.log "${dir}/${name}.log"`);
cp.execSync(`docker exec nusali-pg17-restore rm -f /tmp/${name} /tmp/${name}.log`);
const sha = crypto.createHash('sha256').update(fs.readFileSync(`${dir}/${name}`)).digest('hex');
fs.writeFileSync(`${dir}/${name}.sha256`, `${sha}  ${name}\n`);
console.log('arquivo:', name, 'bytes:', fs.statSync(`${dir}/${name}`).size, 'sha256:', sha);
const log = fs.readFileSync(`${dir}/${name}.log`, 'utf8');
console.log('erros/avisos no log:', (log.match(/^pg_dump: (error|warning)/gim) || []).length, '| linhas "dumping contents of table":', (log.match(/dumping contents of table/g) || []).length);
