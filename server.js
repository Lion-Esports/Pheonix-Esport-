const express=require("express");
const path=require("path");
const Database=require("better-sqlite3");
const app=express(), PORT=process.env.PORT||3000;
const db=new Database("pheonix.db");
db.exec(`CREATE TABLE IF NOT EXISTS tournaments(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,game TEXT,mode TEXT,prize TEXT,entry INTEGER,status TEXT);
CREATE TABLE IF NOT EXISTS registrations(id INTEGER PRIMARY KEY AUTOINCREMENT,team TEXT,captain TEXT,phone TEXT,game TEXT,tournament_id INTEGER,payment_method TEXT,payment_status TEXT DEFAULT 'pending',created_at TEXT);`);
if(db.prepare("SELECT COUNT(*) c FROM tournaments").get().c===0){
 const ins=db.prepare("INSERT INTO tournaments(name,game,mode,prize,entry,status) VALUES(?,?,?,?,?,?)");
 [["Phoenix Clash #01","Free Fire","Squad","₹10,000",50,"LIVE"],["Warzone India Cup","BGMI","Squad","₹25,000",100,"UPCOMING"],["Pheonix Valorant Open","Valorant","5v5","₹50,000",250,"UPCOMING"]].forEach(x=>ins.run(...x));
}
app.use(express.json()); app.use(express.static(path.join(__dirname,"public")));
app.get("/api/tournaments",(req,res)=>res.json(db.prepare("SELECT * FROM tournaments ORDER BY id DESC").all()));
app.post("/api/register",(req,res)=>{
 const {team,captain,phone,game,tournament_id,payment_method}=req.body;
 if(!team||!captain||!/^\d{10}$/.test(phone)||!game||!tournament_id||!payment_method)return res.status(400).json({error:"Invalid registration details"});
 const info=db.prepare(`INSERT INTO registrations(team,captain,phone,game,tournament_id,payment_method,created_at) VALUES(?,?,?,?,?,?,?)`).run(team,captain,phone,game,tournament_id,payment_method,new Date().toISOString());
 res.json({ok:true,id:info.lastInsertRowid,payment_status:"pending"});
});
app.get("/api/leaderboard",(req,res)=>res.json([
 {rank:1,team:"Pheonix X",matches:18,wins:11,points:1840},
 {rank:2,team:"Velocity",matches:18,wins:10,points:1765},
 {rank:3,team:"Titans",matches:17,wins:9,points:1650},
 {rank:4,team:"Nova Esports",matches:16,wins:8,points:1510}
]));
app.get("/api/health",(req,res)=>res.json({status:"ok",service:"Pheonix Esport"}));
app.listen(PORT,()=>console.log(`Pheonix Esport running on port ${PORT}`));