import { neon } from '@neondatabase/serverless';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';

const b64 = x => Buffer.from(x).toString('base64url');
function sign(payload) { const body=b64(JSON.stringify(payload)); const sig=createHmac('sha256',process.env.AUTH_SECRET).update(body).digest('base64url'); return body+'.'+sig; }
function hashPassword(password, salt) { return scryptSync(password, salt, 64).toString('hex'); }
function safeEqual(a,b) { const x=Buffer.from(String(a)); const y=Buffer.from(String(b)); return x.length===y.length && timingSafeEqual(x,y); }

export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if (!process.env.DATABASE_URL || !process.env.AUTH_SECRET) return res.status(500).json({error:'Server belum dikonfigurasi. Tambahkan DATABASE_URL dan AUTH_SECRET.'});
 if (req.method!=='POST') return res.status(405).json({error:'Method tidak didukung'});
 const sql=neon(process.env.DATABASE_URL); const b=req.body||{};
 try {
  if (b.action==='login') {
   const name=String(b.username||'').trim(); const password=String(b.password||'');
   if (!name || !password) return res.status(400).json({error:'Nama pengguna dan password wajib diisi.'});
   let rows=await sql`SELECT id,username,password_hash,salt,role FROM app_users WHERE lower(username)=lower(${name}) LIMIT 1`;
   if (!rows.length) {
    const count=await sql`SELECT COUNT(*)::int AS n FROM app_users`;
    if (Number(count[0].n)===0 && process.env.OWNER_PASSWORD && name.toLowerCase()===(process.env.OWNER_NAME||'Zane').toLowerCase() && safeEqual(password,process.env.OWNER_PASSWORD)) {
     const salt=randomBytes(16).toString('hex'); const ph=hashPassword(password,salt);
     rows=await sql`INSERT INTO app_users(username,password_hash,salt,role) VALUES (${process.env.OWNER_NAME||'Zane'},${ph},${salt},'owner') RETURNING id,username,password_hash,salt,role`;
    }
   }
   if (!rows.length || !safeEqual(hashPassword(password,rows[0].salt),rows[0].password_hash)) return res.status(401).json({error:'Nama pengguna atau password salah.'});
   const u=rows[0]; const token=sign({id:u.id,username:u.username,role:u.role,exp:Date.now()+7*24*60*60*1000});
   return res.status(200).json({token,user:{username:u.username,role:u.role}});
  }
  const auth=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  let session; try { const [body,sig]=auth.split('.'); const expected=createHmac('sha256',process.env.AUTH_SECRET).update(body).digest('base64url'); if(!safeEqual(sig,expected)) throw Error(); session=JSON.parse(Buffer.from(body,'base64url').toString()); if(session.exp<Date.now()) throw Error(); } catch { return res.status(401).json({error:'Sesi berakhir. Silakan masuk lagi.'}); }
  if (b.action==='create-admin') {
   if(session.role!=='owner') return res.status(403).json({error:'Hanya owner yang bisa menambahkan admin.'});
   const username=String(b.username||'').trim(); const password=String(b.password||'');
   if(!/^[a-zA-Z0-9._-]{3,30}$/.test(username)) return res.status(400).json({error:'Username 3-30 karakter, gunakan huruf, angka, titik, garis bawah, atau minus.'});
   if(password.length<10) return res.status(400).json({error:'Password admin minimal 10 karakter.'});
   const salt=randomBytes(16).toString('hex'); const ph=hashPassword(password,salt);
   await sql`INSERT INTO app_users(username,password_hash,salt,role) VALUES (${username},${ph},${salt},'admin')`;
   return res.status(200).json({ok:true});
  }
  if(b.action==='list-users') {
   if(session.role!=='owner') return res.status(403).json({error:'Hanya owner yang bisa melihat daftar akun.'});
   const users=await sql`SELECT id,username,role,created_at FROM app_users ORDER BY created_at ASC`;
   return res.status(200).json({users});
  }
  return res.status(400).json({error:'Aksi tidak dikenal.'});
 } catch(e) { if(String(e.message||'').includes('unique')) return res.status(409).json({error:'Username sudah digunakan.'}); console.error(e); return res.status(500).json({error:'Terjadi kesalahan server.'}); }
}
