// FASE 8A etapa 1 - leitura SOMENTE LEITURA (BEGIN READ ONLY ... ROLLBACK) da arvore real de categorias e do modelo de atributos.
const path=require('path');const root='C:/Users/djata/Desktop/Mercado Nusali';
require(path.join(root,'node_modules/dotenv')).config({path:path.join(root,'.env')});
const pg=require(path.join(root,'node_modules/pg'));const fs=require('fs');
(async()=>{const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:1});const c=await pool.connect();
try{await c.query('BEGIN READ ONLY');
const id=(await c.query("select current_database() db, (select count(*)::int from drizzle.__drizzle_migrations) mig")).rows[0];
const cats=(await c.query("select id,name,slug,parent_id,is_active,display_order,commission_rate::text commission_rate,icon,created_at from categories order by parent_id nulls first, display_order, name")).rows;
const counts=(await c.query("select (select count(*)::int from category_attributes) attrs,(select count(*)::int from products) products,(select count(*)::int from product_attribute_values) pav,(select count(*)::int from product_variants) variants,(select count(*)::int from brands) brands")).rows[0];
const cols=(await c.query("select column_name from information_schema.columns where table_name='categories' order by ordinal_position")).rows.map(r=>r.column_name);
await c.query('ROLLBACK');
fs.writeFileSync(path.join(root,'docs/attribute-matrix/v1/categories.inventory.raw.json'),JSON.stringify({readAt:new Date().toISOString(),db:id,counts,columns:cols,categories:cats},null,1));
console.log(JSON.stringify({id,counts,cols,total:cats.length}));
}finally{try{await c.query('ROLLBACK')}catch{} c.release();await pool.end();}})().catch(e=>{console.error('ERRO',e.message);process.exit(1)});
