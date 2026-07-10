let usersCache = [];
let settingsCache = {};
let statsCache = {};

// ---------- helper functions ----------
async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  if (r.status === 401) { window.location.href = "/login.html"; throw new Error("unauth"); }
  return r;
}

function fmtBytes(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(i === 0 ? 0 : 1) + " " + u[i];
}

function toFa(n) {
  return String(n).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
}

let toastTimer;
function toast(msg, isError = false) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.toggle("toast-error", isError);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function openModal(id) { document.getElementById(id).hidden = false; }
function closeModal(id) { document.getElementById(id).hidden = true; }

document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});

// ---------- page navigation ----------
function showPage(page) {
  document.querySelectorAll(".page-section").forEach(el => el.classList.remove("active"));
  document.getElementById("page-" + page).classList.add("active");
  document.querySelectorAll(".sidebar-link").forEach(el => el.classList.remove("active"));
  const navItem = document.querySelector(`.sidebar-link[data-page="${page}"]`);
  if (navItem) navItem.classList.add("active");
  
  const titles = {
    dashboard: ["نمای کلی سیستم", "وضعیت لحظه‌ای سرور و کاربران تلگرام"],
    users: ["کاربران فعال", "مدیریت و پیکربندی کلیدهای فعال تلگرام"],
    settings: ["تنظیمات پروکسی سرور", "پیکربندی دامنه‌ها و دسترسی‌های پنل وب"]
  };
  
  if (titles[page]) {
    document.getElementById("page-title").textContent = titles[page][0];
    document.getElementById("page-subtitle").textContent = titles[page][1];
  }
  
  if (window.innerWidth < 1024) toggleSidebar();
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("active");
  document.getElementById("sidebar-overlay").classList.toggle("active");
}

// ---------- data loader ----------
async function loadAll() {
  try {
    const [usersRes, settingsRes, statsRes, statusRes] = await Promise.all([
      api("/api/users"), api("/api/settings"), api("/api/stats"), api("/api/status")
    ]);
    usersCache = (await usersRes.json()).users || [];
    settingsCache = await settingsRes.json();
    statsCache = (await statsRes.json()) || {};
    const status = await statusRes.json();

    document.getElementById("proxyHost").value = settingsCache.proxy_host || "";
    document.getElementById("proxyPort").value = settingsCache.proxy_port || "";
    document.getElementById("tlsDomain").value = settingsCache.fake_tls_domain || "";
    document.getElementById("sidebar-user-count").textContent = toFa(usersCache.length);

    renderStats(status);
    renderTable();
  } catch (e) {
    console.error("Error synchronizing with containers", e);
  }
}

function statsFor(user) {
  const su = (statsCache && statsCache.users && statsCache.users[user]) || {};
  return { rx: su.bytes_in || 0, tx: su.bytes_out || 0, connections: su.connections || 0 };
}

function renderStats(status) {
  const active = usersCache.filter(u => u.enabled).length;
  document.getElementById("statActiveUsers").textContent = toFa(active);
  document.getElementById("statTotalUsers").textContent = toFa(usersCache.length);

  const totalBytes = usersCache.reduce((sum, u) => {
    const s = statsFor(u.user);
    return sum + s.rx + s.tx;
  }, 0);
  document.getElementById("statTraffic").textContent = fmtBytes(totalBytes);

  const totalConn = usersCache.reduce((sum, u) => sum + statsFor(u.user).connections, 0);
  const running = !!(status && status.mtg_running);
  document.getElementById("statProxyState").textContent = running ? "فعال" : "متوقف";
  document.getElementById("statConnections").innerHTML =
    `<i class="dot ${running ? "dot-green dot-pulse" : "dot-red"}"></i> ${toFa(totalConn)} اتصال باز`;
  document.getElementById("statusIconWrap").className =
    "w-12 h-12 rounded-xl flex items-center justify-center " + (running ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-yellow-500/10 border border-yellow-500/20 text-yellow-400");

  const rxTotal = statsCache.traffic?.rx || 0;
  const txTotal = statsCache.traffic?.tx || 0;
  document.getElementById("stat-bytes-rx").textContent = fmtBytes(rxTotal);
  document.getElementById("stat-bytes-tx").textContent = fmtBytes(txTotal);
}

function applyFilters(list) {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const filter = document.getElementById("filterSelect").value;
  const sort = document.getElementById("sortSelect").value;

  let out = list.filter(u => {
    if (filter === "enabled" && !u.enabled) return false;
    if (filter === "disabled" && u.enabled) return false;
    if (q && !u.user.toLowerCase().includes(q)) return false;
    return true;
  });

  if (sort === "name") {
    out = out.slice().sort((a, b) => a.user.localeCompare(b.user));
  } else if (sort === "traffic") {
    out = out.slice().sort((a, b) => {
      const sa = statsFor(a.user), sb = statsFor(b.user);
      return (sb.rx + sb.tx) - (sa.rx + sa.tx);
    });
  } else {
    out = out.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }
  return out;
}

function buildLink(secret) {
  const h = settingsCache.proxy_host, p = settingsCache.proxy_port;
  if (!h || !p) return null;
  return `https://t.me/proxy?server=${h}&port=${p}&secret=${secret}`;
}

function renderTable() {
  const list = applyFilters(usersCache);
  const tbody = document.querySelector("#usersTable tbody");
  tbody.innerHTML = "";
  document.getElementById("emptyState").hidden = usersCache.length > 0;

  const maxBytes = Math.max(1, ...usersCache.map(u => { const s = statsFor(u.user); return s.rx + s.tx; }));

  list.forEach(u => {
    const s = statsFor(u.user);
    const total = s.rx + s.tx;
    const pct = Math.min(100, Math.round((total / maxBytes) * 100));
    const link = buildLink(u.secret);
    const created = u.created_at ? new Date(u.created_at).toLocaleDateString("fa-IR") : "";

    const tr = document.createElement("tr");
    tr.className = "hover:bg-white/5 border-b border-white/10";
    tr.innerHTML = `
      <td class="p-3">
        <span class="badge ${u.enabled ? "badge-on" : "badge-off"}">
          <i class="dot ${u.enabled ? "dot-green" : "dot-red"}"></i>${u.enabled ? "فعال" : "غیرفعال"}
        </span>
      </td>
      <td class="p-3">
        <div class="user-cell">
          <span class="user-name text-white font-bold">${u.user}</span>
          ${created ? `<span class="user-created">${created}</span>` : ""}
        </div>
      </td>
      <td class="p-3 mono text-sm">${toFa(s.connections)}</td>
      <td class="p-3">
        <span class="mono text-xs text-zinc-400">${fmtBytes(total)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      </td>
      <td class="p-3">
        ${link
          ? `<button class="link-btn" data-act="showlink" data-user="${u.user}" data-secret="${u.secret}">
               <svg viewBox="0 0 24 24" fill="none" class="w-3.5 h-3.5"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
               نمایش لینک
             </button>`
          : `<span class="link-btn disabled" title="ابتدا آدرس پراکسی را در تنظیمات وارد کنید">تنظیم نشده</span>`}
      </td>
      <td class="p-3 text-left">
        <div class="actions justify-end">
          <button class="action-btn" data-act="toggle" data-user="${u.user}" data-val="${!u.enabled}" title="${u.enabled ? "غیرفعال کردن" : "فعال کردن"}">
            ${u.enabled
              ? `<svg viewBox="0 0 24 24" fill="none" class="w-4 h-4"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>`
              : `<svg viewBox="0 0 24 24" fill="none" class="w-4 h-4"><path d="M7 5v14l12-7L7 5Z" fill="currentColor"/></svg>`}
          </button>
          <button class="action-btn warn" data-act="rotate" data-user="${u.user}" title="تعویض سکرت">
            <svg viewBox="0 0 24 24" fill="none" class="w-4 h-4"><path d="M20 11a8 8 0 1 0-2.3 5.6M20 5v6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="action-btn danger text-red-400 border-red-500/20 hover:border-red-500" data-act="remove" data-user="${u.user}" title="حذف کاربر">
            <svg viewBox="0 0 24 24" fill="none" class="w-4 h-4"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- table actions ----------
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const user = btn.dataset.user;
  const act = btn.dataset.act;

  if (act === "toggle") {
    const val = btn.dataset.val === "true";
    await api(`/api/users/${user}/${val ? "enable" : "disable"}`, { method: "POST" });
    toast(val ? `کاربر ${user} فعال شد` : `کاربر ${user} غیرفعال شد`);
    loadAll();
  } else if (act === "rotate") {
    if (!confirm(`سکرت کاربر ${user} تعویض شود؟ لینک قبلی از کار می‌افتد.`)) return;
    await api(`/api/users/${user}/rotate`, { method: "POST" });
    toast("سکرت جدید ساخته شد");
    loadAll();
  } else if (act === "remove") {
    if (!confirm(`کاربر ${user} حذف شود؟`)) return;
    await api(`/api/users/${user}`, { method: "DELETE" });
    toast("کاربر حذف شد");
    loadAll();
  } else if (act === "showlink") {
    showLinkModal(user, btn.dataset.secret);
  }
});

function showLinkModal(user, secret) {
  const link = buildLink(secret);
  document.getElementById("linkModalUser").textContent = user;
  document.getElementById("linkModalUrl").value = link;
  const holder = document.getElementById("qrHolder");
  holder.innerHTML = "";
  if (window.QRCode) {
    new QRCode(holder, { text: link, width: 176, height: 176, colorDark: "#0a0c12", colorLight: "#ffffff" });
  }
  openModal("linkModal");
}

document.getElementById("copyLinkBtn").addEventListener("click", async () => {
  const val = document.getElementById("linkModalUrl").value;
  try { await navigator.clipboard.writeText(val); toast("لینک کپی شد"); }
  catch { toast("کپی خودکار ممکن نشد، متن را دستی کپی کنید", true); }
});

// ---------- toolbar ----------
["searchInput", "filterSelect", "sortSelect"].forEach(id => {
  document.getElementById(id).addEventListener("input", renderTable);
  document.getElementById(id).addEventListener("change", renderTable);
});

// ---------- add user ----------
document.getElementById("addUserBtn").addEventListener("click", () => openModal("addUserModal"));
document.getElementById("confirmAddUser").addEventListener("click", async () => {
  const label = document.getElementById("newUserLabel").value.trim();
  const r = await api("/api/users", { method: "POST", body: JSON.stringify({ label }) });
  if (r.ok) {
    document.getElementById("newUserLabel").value = "";
    closeModal("addUserModal");
    toast("کاربر جدید اضافه شد");
    loadAll();
  } else {
    const err = await r.json().catch(() => ({}));
    toast(err.error || "افزودن کاربر ناموفق بود", true);
  }
});

// ---------- settings modal ----------
document.getElementById("settingsBtn").addEventListener("click", () => {
  showPage("settings");
});

document.getElementById("saveProxyBtn").addEventListener("click", async () => {
  const host = document.getElementById("proxyHost").value.trim();
  const port = document.getElementById("proxyPort").value.trim();
  const r = await api("/api/settings/proxy", { method: "POST", body: JSON.stringify({ host, port }) });
  if (r.ok) { toast("آدرس پراکسی ذخیره شد"); loadAll(); }
  else toast("ذخیره‌سازی ناموفق بود", true);
});

document.getElementById("saveDomainBtn").addEventListener("click", async () => {
  const domain = document.getElementById("tlsDomain").value.trim();
  const r = await api("/api/settings/domain", { method: "POST", body: JSON.stringify({ domain }) });
  if (r.ok) toast("دامنه Fake-TLS ذخیره شد (روی کاربران جدید اعمال می‌شود)");
  else toast("ذخیره‌سازی ناموفق بود", true);
});

document.getElementById("reloadBtn").addEventListener("click", async () => {
  const r = await api("/api/reload", { method: "POST" });
  if (r.ok) toast("درخواست ری‌استارت ثبت شد");
  else toast("ری‌استارت ناموفق بود", true);
});

document.getElementById("savePassBtn").addEventListener("click", async () => {
  const username = document.getElementById("newUsername").value.trim();
  const password = document.getElementById("newPassword").value;
  if (!username || !password) return toast("هر دو فیلد را پر کنید", true);
  const r = await api("/api/settings/password", { method: "POST", body: JSON.stringify({ username, password }) });
  if (r.ok) {
    toast("رمز عبور تغییر کرد، دوباره وارد شوید");
    setTimeout(() => window.location.href = "/login.html", 900);
  } else toast("تغییر رمز ناموفق بود", true);
});

// ---------- backup / refresh / logout ----------
document.getElementById("backupBtn").addEventListener("click", async () => {
  const r = await api("/api/backup", { method: "POST" });
  const out = await r.text();
  toast(r.ok ? "بکاپ روی سرور ذخیره شد" : "بکاپ‌گیری ناموفق بود", !r.ok);
});

document.getElementById("refreshBtn").addEventListener("click", () => { loadAll(); toast("داده‌ها بروزرسانی شد"); });

function logoutBtnClick() {
  if (!confirm("آیا مایل به خروج هستید؟")) return;
  api("/api/logout", { method: "POST" }).then(() => {
    window.location.href = "/login.html";
  });
}

// ---------- forced password change ----------
document.getElementById("forcePassSubmit").addEventListener("click", async () => {
  const username = document.getElementById("forceUsername").value.trim();
  const password = document.getElementById("forcePassword").value;
  if (!username || !password) return toast("هر دو فیلد را پر کنید", true);
  const r = await api("/api/settings/password", { method: "POST", body: JSON.stringify({ username, password }) });
  if (r.ok) {
    window.location.href = "/login.html";
  } else toast("ذخیره ناموفق بود", true);
});

// ---------- boot ----------
api("/api/session").then(async r => {
  const s = await r.json();
  if (!s.authenticated) { window.location.href = "/login.html"; return; }
  if (s.mustChangePassword) { openModal("forcePassModal"); return; }
  loadAll();
  setInterval(loadAll, 15000);
});
