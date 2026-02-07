const form = document.getElementById("form");
const streetEl = document.getElementById("street");
const numberEl = document.getElementById("number");
const neighborhoodEl = document.getElementById("neighborhood");

const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

const cellNameEl = document.getElementById("cellName");
const cellAddressEl = document.getElementById("cellAddress");
const distanceEl = document.getElementById("distance");
const mapsLinkEl = document.getElementById("mapsLink");
const mapFrame = document.getElementById("mapFrame");

const btn = document.getElementById("btn");
const newSearchBtn = document.getElementById("newSearch");

function setStatus(msg, isError = false) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}

function osmEmbedUrl(lat, lng) {
  const d = 0.01;
  const left = lng - d, right = lng + d, top = lat + d, bottom = lat - d;
  const u = new URL("https://www.openstreetmap.org/export/embed.html");
  u.searchParams.set("bbox", `${left},${bottom},${right},${top}`);
  u.searchParams.set("layer", "mapnik");
  u.searchParams.set("marker", `${lat},${lng}`);
  return u.toString();
}

function showResult(data) {
  cellNameEl.textContent = data.nearest.name;
  cellAddressEl.textContent = data.nearest.address;
  distanceEl.textContent = data.nearest.distanceKm.toFixed(2);
  mapsLinkEl.href = data.nearest.mapsUrl;
  mapFrame.src = osmEmbedUrl(data.nearest.lat, data.nearest.lng);
  resultEl.classList.remove("hidden");
}

function resetUI() {
  resultEl.classList.add("hidden");
  setStatus("");
  mapFrame.src = "";
}

newSearchBtn.addEventListener("click", () => {
  resetUI();
  streetEl.focus();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  resetUI();

  const street = streetEl.value.trim();
  const number = numberEl.value.trim();
  const neighborhood = neighborhoodEl.value.trim();

  if (!street || !number) {
    setStatus("Preencha Rua e Número.", true);
    return;
  }

  btn.disabled = true;
  setStatus("Buscando sua localização...");

  try {
    const url = new URL("/api/nearest", window.location.origin);
    url.searchParams.set("street", street);
    url.searchParams.set("number", number);
    if (neighborhood) url.searchParams.set("neighborhood", neighborhood);

    const res = await fetch(url.toString());
    const data = await res.json();

    if (!res.ok) {
      setStatus(data.error || "Erro ao buscar a célula mais próxima.", true);
      return;
    }

    setStatus("Encontrado! ✅");
    showResult(data);
  } catch {
    setStatus("Falha de rede ou servidor indisponível.", true);
  } finally {
    btn.disabled = false;
  }
});
