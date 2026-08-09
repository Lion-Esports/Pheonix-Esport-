async function load(){
 const ts=await fetch("/api/tournaments").then(r=>r.json());
 document.getElementById("tournamentsGrid").innerHTML=ts.map(t=>`<div class="card"><small>${t.status} • ${t.game}</small><h3>${t.name}</h3><p class="meta">${t.mode}</p><div class="price">${t.prize}</div><p class="meta">Entry: ₹${t.entry}</p><button class="btn full" onclick="selectTournament(${t.id})">Register</button></div>`).join("");
 document.getElementById("tournament").innerHTML=ts.map(t=>`<option value="${t.id}">${t.name} — ${t.game}</option>`).join("");
 const lb=await fetch("/api/leaderboard").then(r=>r.json());
 document.getElementById("leaderboardBox").innerHTML=`<table><tr><th>#</th><th>Team</th><th>Matches</th><th>Wins</th><th>Points</th></tr>${lb.map(x=>`<tr><td>${x.rank}</td><td>🔥 ${x.team}</td><td>${x.matches}</td><td>${x.wins}</td><td>${x.points}</td></tr>`).join("")}</table>`;
}
function selectTournament(id){document.getElementById("tournament").value=id;document.getElementById("register").scrollIntoView({behavior:"smooth"})}
document.getElementById("reg").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.target);const data=Object.fromEntries(f);const r=await fetch("/api/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});const j=await r.json();document.getElementById("msg").textContent=r.ok?`Registration #${j.id} created. Payment status: PENDING.`:(j.error||"Registration failed");if(r.ok)e.target.reset()});
load();