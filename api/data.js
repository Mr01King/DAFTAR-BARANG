import { neon } from '@neondatabase/serverless';
import { createHmac, timingSafeEqual } from 'node:crypto';
function validSession(req){try{const t=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');const [body,sig]=t.split('.');const expected=createHmac('sha256',process.env.AUTH_SECRET).update(body).digest('base64url');const a=Buffer.from(String(sig)),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return null;const s=JSON.parse(Buffer.from(body,'base64url').toString());return s.exp>Date.now()?s:null}catch{return null}}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!process.env.DATABASE_URL||!process.env.AUTH_SECRET)return res.status(500).json({error:'Server belum dikonfigurasi. Periksa DATABASE_URL dan AUTH_SECRET.'});
 const session=validSession(req);if(!session)return res.status(401).json({error:'Sesi berakhir. Silakan masuk lagi.'});
 const sql=neon(process.env.DATABASE_URL);
 try{
  if(req.method==='GET'){const products=await sql`SELECT * FROM products ORDER BY name ASC`;const movements=await sql`SELECT * FROM stock_movements ORDER BY created_at DESC LIMIT 100`;return res.status(200).json({products,movements});}
  if(req.method!=='POST')return res.status(405).json({error:'Method tidak didukung'});
  const b=req.body||{};
  if(b.action==='create'){const rows=await sql`INSERT INTO products(name,category,sku,buy_price,sell_price,stock,min_stock) VALUES(${b.name},${b.category||''},${b.sku||''},${Number(b.buy_price)||0},${Number(b.sell_price)||0},${Math.max(0,Math.floor(Number(b.stock)||0))},${Math.max(0,Math.floor(Number(b.min_stock)||0))}) RETURNING id`;return res.status(200).json({id:rows[0].id});}
  if(b.action==='update'){await sql`UPDATE products SET name=${b.name},category=${b.category||''},sku=${b.sku||''},buy_price=${Number(b.buy_price)||0},sell_price=${Number(b.sell_price)||0},min_stock=${Math.max(0,Math.floor(Number(b.min_stock)||0))},updated_at=now() WHERE id=${b.id}`;return res.status(200).json({ok:true});}
  if(b.action==='delete'){await sql`DELETE FROM products WHERE id=${b.id}`;return res.status(200).json({ok:true});}
  if(b.action==='stock'){const qty=Math.floor(Number(b.quantity));if(!Number.isInteger(qty)||qty<1||!['in','out'].includes(b.type))return res.status(400).json({error:'Data stok tidak valid.'});const rows=await sql`SELECT * FROM products WHERE id=${b.id}`;if(!rows.length)return res.status(404).json({error:'Produk tidak ditemukan.'});const p=rows[0];const next=Number(p.stock)+(b.type==='in'?qty:-qty);if(next<0)return res.status(400).json({error:'Stok tidak mencukupi.'});await sql`UPDATE products SET stock=${next},updated_at=now() WHERE id=${b.id}`;await sql`INSERT INTO stock_movements(product_id,product_name,type,quantity,note) VALUES(${b.id},${p.name},${b.type},${qty},${b.note||''})`;return res.status(200).json({stock:next});}
  return res.status(400).json({error:'Aksi tidak dikenal.'});
 }catch(e){console.error(e);return res.status(500).json({error:'Terjadi kesalahan server. Periksa konfigurasi database.'});}
}
