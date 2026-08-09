const $ = (id) => document.getElementById(id);

async function api(url, options = {}) {
  const r = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? {"Content-Type": "application/json"} : {}),
      ...(options.headers || {})
    }
  });

  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function load() {
  const ts = await api("/api/tournaments");

  $("tournamentsGrid").innerHTML = ts.map(t => `
    <div class="card">
      <small>${escapeHtml(t.status)} • ${escapeHtml(t.game)}</small>
      <h3>${escapeHtml(t.name)}</h3>
      <p class="meta">${escapeHtml(t.mode)}</p>
      <div class="price">${escapeHtml(t.prize)}</div>
      <p class="meta">Entry: ₹${Number(t.entry)}</p>
      <button class="btn full" onclick="selectTournament(${t.id})">Register</button>
    </div>
  `).join("");

  $("tournament").innerHTML = ts.map(t =>
    `<option value="${t.id}">${escapeHtml(t.name)} — ${escapeHtml(t.game)}</option>`
  ).join("");

  const lb = await api("/api/leaderboard");
  renderLeaderboard(lb);
}

function renderLeaderboard(lb) {
  $("leaderboardBox").innerHTML = `
    <table>
      <tr><th>#</th><th>Team</th><th>Matches</th><th>Wins</th><th>Points</th></tr>
      ${lb.map(x => `
        <tr>
          <td>${x.rank}</td>
          <td>🔥 ${escapeHtml(x.team)}</td>
          <td>${x.matches}</td>
          <td>${x.wins}</td>
          <td>${x.points}</td>
        </tr>
      `).join("")}
    </table>`;
}

function selectTournament(id) {
  $("tournament").value = id;
  $("register").scrollIntoView({behavior:"smooth"});
}

$("reg").addEventListener("submit", async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));

  try {
    const j = await api("/api/register", {
      method: "POST",
      body: JSON.stringify(data)
    });

    $("msg").textContent =
      `Registration #${j.id} created. Payment status: PENDING.`;
    e.target.reset();
    await load();
  } catch (err) {
    $("msg").textContent = err.message;
  }
});

// ---------------- ADMIN UI ----------------

$("adminLoginForm").addEventListener("submit", async e => {
  e.preventDefault();

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("adminUsername").value,
        password: $("adminPassword").value
      })
    });

    $("adminLoginMsg").textContent = "Login successful.";
    $("adminLoginForm").reset();
    await showAdminDashboard();
  } catch (err) {
    $("adminLoginMsg").textContent = err.message;
  }
});

async function checkAdmin() {
  try {
    await api("/api/admin/me");
    await showAdminDashboard();
  } catch {
    $("adminDashboard").hidden = true;
    $("adminLoginPanel").hidden = false;
  }
}

async function showAdminDashboard() {
  $("adminLoginPanel").hidden = true;
  $("adminDashboard").hidden = false;
  await Promise.all([
    loadAdminTournaments(),
    loadRegistrations(),
    loadAdminLeaderboard()
  ]);
}

$("adminLogout").addEventListener("click", async () => {
  try { await api("/api/admin/logout", {method:"POST"}); } catch {}
  $("adminDashboard").hidden = true;
  $("adminLoginPanel").hidden = false;
  $("adminLoginMsg").textContent = "Logged out.";
});

$("tournamentAdminForm").addEventListener("submit", async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const id = data.id;
  delete data.id;
  data.entry = Number(data.entry);

  try {
    await api(id ? `/api/admin/tournaments/${id}` : "/api/admin/tournaments", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(data)
    });

    e.target.reset();
    $("tournamentAdminId").value = "";
    $("tournamentSaveBtn").textContent = "Create Tournament";
    $("adminTournamentMsg").textContent = "Tournament saved.";
    await loadAdminTournaments();
    await load();
  } catch (err) {
    $("adminTournamentMsg").textContent = err.message;
  }
});

async function loadAdminTournaments() {
  const ts = await api("/api/tournaments");

  $("adminTournaments").innerHTML = ts.map(t => `
    <tr>
      <td>${t.id}</td>
      <td>${escapeHtml(t.name)}</td>
      <td>${escapeHtml(t.game)}</td>
      <td>${escapeHtml(t.status)}</td>
      <td>
        <button class="btn small" onclick='editTournament(${JSON.stringify(t)})'>Edit</button>
        <button class="btn small danger" onclick="deleteTournament(${t.id})">Delete</button>
      </td>
    </tr>
  `).join("");
}

function editTournament(t) {
  $("tournamentAdminId").value = t.id;
  $("adminTournamentName").value = t.name;
  $("adminTournamentGame").value = t.game;
  $("adminTournamentMode").value = t.mode;
  $("adminTournamentPrize").value = t.prize;
  $("adminTournamentEntry").value = t.entry;
  $("adminTournamentStatus").value = t.status;
  $("tournamentSaveBtn").textContent = "Update Tournament";
  $("adminTournamentForm").scrollIntoView({behavior:"smooth"});
}

async function deleteTournament(id) {
  if (!confirm("Delete this tournament?")) return;

  try {
    await api(`/api/admin/tournaments/${id}`, {method:"DELETE"});
    await loadAdminTournaments();
    await load();
  } catch (err) {
    alert(err.message);
  }
}

async function loadRegistrations() {
  const rows = await api("/api/admin/registrations");

  $("registrationsAdmin").innerHTML = rows.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${escapeHtml(r.team)}</td>
      <td>${escapeHtml(r.captain)}</td>
      <td>${escapeHtml(r.phone)}</td>
      <td>${escapeHtml(r.tournament_name || "Unknown")}</td>
      <td>${escapeHtml(r.payment_method)}</td>
      <td>
        <select onchange="updatePayment(${r.id}, this.value)">
          ${["pending","verified","rejected"].map(s =>
            `<option value="${s}" ${r.payment_status === s ? "selected" : ""}>${s}</option>`
          ).join("")}
        </select>
      </td>
    </tr>
  `).join("");
}

async function updatePayment(id, status) {
  try {
    await api(`/api/admin/registrations/${id}/payment`, {
      method: "PATCH",
      body: JSON.stringify({payment_status: status})
    });
  } catch (err) {
    alert(err.message);
    await loadRegistrations();
  }
}

$("leaderboardAdminForm").addEventListener("submit", async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const id = data.id;
  delete data.id;
  data.matches = Number(data.matches);
  data.wins = Number(data.wins);
  data.points = Number(data.points);

  try {
    await api(id ? `/api/admin/leaderboard/${id}` : "/api/admin/leaderboard", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(data)
    });

    e.target.reset();
    $("leaderboardAdminId").value = "";
    $("leaderboardSaveBtn").textContent = "Add Team";
    await loadAdminLeaderboard();
    await load();
  } catch (err) {
    $("leaderboardAdminMsg").textContent = err.message;
  }
});

async function loadAdminLeaderboard() {
  const rows = await api("/api/admin/leaderboard");

  $("leaderboardAdmin").innerHTML = rows.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${escapeHtml(r.team)}</td>
      <td>${r.matches}</td>
      <td>${r.wins}</td>
      <td>${r.points}</td>
      <td>
        <button class="btn small" onclick='editLeaderboard(${JSON.stringify(r)})'>Edit</button>
        <button class="btn small danger" onclick="deleteLeaderboard(${r.id})">Delete</button>
      </td>
    </tr>
  `).join("");
}

function editLeaderboard(r) {
  $("leaderboardAdminId").value = r.id;
  $("leaderboardTeam").value = r.team;
  $("leaderboardMatches").value = r.matches;
  $("leaderboardWins").value = r.wins;
  $("leaderboardPoints").value = r.points;
  $("leaderboardSaveBtn").textContent = "Update Team";
}

async function deleteLeaderboard(id) {
  if (!confirm("Delete this leaderboard entry?")) return;

  try {
    await api(`/api/admin/leaderboard/${id}`, {method:"DELETE"});
    await loadAdminLeaderboard();
    await load();
  } catch (err) {
    alert(err.message);
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

load().catch(err => console.error(err));
checkAdmin();
