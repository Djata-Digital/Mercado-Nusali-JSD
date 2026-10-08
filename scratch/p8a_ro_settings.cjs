const path=require('path');const root='C:/Users/djata/Desktop/Mercado Nusali';
require(path.join(root,'node_modules/dotenv')).config({path:path.join(root,'.env')});
const pg=require(path.join(root,'node_modules/pg'));
(async()=>{const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:1});const c=await pool.connect();
try{await c.query('BEGIN READ ONLY');
console.log((await c.query("select key, left(value_json::text,80) v from platform_settings where key ilike '%commission%' or key ilike '%attribute%' or key ilike '%multiSeller%' order by 1")).rows);
console.log('sellers commission:',(await c.query("select count(*)::int n, count(commission_rate)::int com from sellers")).rows[0]);
console.log('brands:',(await c.query("select count(*)::int n from brands")).rows[0]);
await c.query('ROLLBACK');}finally{try{await c.query('ROLLBACK')}catch{} c.release();await pool.end();}})().catch(e=>{console.error('ERRO',e.message);process.exit(1)});
