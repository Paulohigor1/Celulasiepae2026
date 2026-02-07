const loginForm = document.getElementById("loginForm");
const authStatus = document.getElementById("authStatus");
const usernameEl = document.getElementById("username");
const passwordEl = document.getElementById("password");

const createForm = document.getElementById("createForm");
const newNameEl = document.getElementById("newName");
const newAddressEl = document.getElementById("newAddress");
const newLatEl = document.getElementById("newLat");
const newLngEl = document.getElementById("newLng");
const createStatus = document.getElementById("createStatus");
const listEl = document.getElementById("list");
const logoutBtn = document.getElementById("logoutBtn");

let TOKEN = localStorage.getItem("admin_token") || "";

function setStatus(el, msg, isError=false){
  el.textContent = msg || "";
  el.classList.toggle("error", !!isError);
}

async function api(path, opts = {}){
  const headers = opts.headers || {};
  headers["Content-Type"] = "application/json";
  if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`);
  return data;
}

function parseMaybeNumber(v){
  const t = String(v || "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function renderList(cells){
  if (!cells.length){
    listEl.innerHTML = `<div class="tiny">Nenhuma célula cadastrada ainda.</div>`;
    return;
  }

  listEl.innerHTML = "";
  for (const c of cells){
    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <div class="item__name"></div>
      <div class="item__addr"></div>
      <div class="item__meta">lat ${Number(c.lat).toFixed(6)} • lng ${Number(c.lng).toFixed(6)}</div>

      <details class="details" style="margin-top:10px;">
        <summary>Editar</summary>
        <div class="form" style="margin-top:10px;">
          <label class="field">
            <span>Nome</span>
            <input data-k="name" type="text" value="${escapeHtml(c.name || "")}">
          </label>
          <label class="field">
            <span>Endereço</span>
            <input data-k="address" type="text" value="${escapeHtml(c.address || "")}">
          </label>
          <div class="row">
            <label class="field">
              <span>Latitude</span>
              <input data-k="lat" type="number" step="any" value="${c.lat}">
            </label>
            <label class="field">
              <span>Longitude</span>
              <input data-k="lng" type="number" step="any" value="${c.lng}">
            </label>
          </div>

          <div class="item__buttons">
            <button class="smallbtn smallbtn--ok" data-action="save">Salvar</button>
            <button class="smallbtn smallbtn--danger" data-action="delete">Remover</button>
            <span class="tiny" data-role="msg" style="text-align:left;"></span>
          </div>
        </div>
      </details>
    `;

    div.querySelector(".item__name").textContent = c.name || "";
    div.querySelector(".item__addr").textContent = c.address || "";
    const msgEl = div.querySelector('[data-role="msg"]');

    div.querySelector('[data-action="save"]').addEventListener("click", async () => {
      try{
        setStatus(msgEl, "Salvando...");
        const name = div.querySelector('input[data-k="name"]').value.trim();
        const address = div.querySelector('input[data-k="address"]').value.trim();
        const lat = parseMaybeNumber(div.querySelector('input[data-k="lat"]').value);
        const lng = parseMaybeNumber(div.querySelector('input[data-k="lng"]').value);

        await api(`/api/admin/cells/${encodeURIComponent(c.id)}`, {
          method: "PUT",
          body: JSON.stringify({ name, address, lat: lat ?? undefined, lng: lng ?? undefined })
        });
        setStatus(msgEl, "Salvo ✅");
        await refresh();
      }catch(err){
        setStatus(msgEl, err.message, true);
      }
    });

    div.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      if (!confirm(`Remover a célula "${c.name}"?`)) return;
      try{
        setStatus(msgEl, "Removendo...");
        await api(`/api/admin/cells/${encodeURIComponent(c.id)}`, { method:"DELETE" });
        setStatus(msgEl, "Removida ✅");
        await refresh();
      }catch(err){
        setStatus(msgEl, err.message, true);
      }
    });

    listEl.appendChild(div);
  }
}

async function refresh(){
  const data = await api("/api/admin/cells", { method:"GET" });
  renderList(data.cells || []);
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try{
    setStatus(authStatus, "Entrando...");
    const username = usernameEl.value.trim();
    const password = passwordEl.value.trim();
    const data = await api("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ username, password })
    });
    TOKEN = data.token;
    localStorage.setItem("admin_token", TOKEN);
    setStatus(authStatus, "Conectado ✅");
    await refresh();
  }catch(err){
    setStatus(authStatus, err.message, true);
  }
});

logoutBtn.addEventListener("click", async () => {
  TOKEN = "";
  localStorage.removeItem("admin_token");
  setStatus(authStatus, "Saiu ✅");
  listEl.innerHTML = `<div class="tiny">Faça login novamente.</div>`;
});

createForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!TOKEN){
    setStatus(createStatus, "Faça login primeiro.", true);
    return;
  }

  const name = newNameEl.value.trim();
  const address = newAddressEl.value.trim();
  const lat = parseMaybeNumber(newLatEl.value);
  const lng = parseMaybeNumber(newLngEl.value);

  if (!name || !address){
    setStatus(createStatus, "Preencha nome e endereço.", true);
    return;
  }

  try{
    setStatus(createStatus, "Adicionando...");
    await api("/api/admin/cells", {
      method: "POST",
      body: JSON.stringify({ name, address, lat: lat ?? undefined, lng: lng ?? undefined })
    });
    setStatus(createStatus, "Adicionada ✅");
    createForm.reset();
    await refresh();
  }catch(err){
    setStatus(createStatus, err.message, true);
  }
});

(async () => {
  if (TOKEN){
    try{
      setStatus(authStatus, "Recuperando sessão...");
      await refresh();
      setStatus(authStatus, "Conectado ✅");
    }catch{
      TOKEN = "";
      localStorage.removeItem("admin_token");
      setStatus(authStatus, "Sessão expirada. Faça login.", true);
    }
  } else {
    listEl.innerHTML = `<div class="tiny">Faça login para ver e editar as células.</div>`;
  }
})();
