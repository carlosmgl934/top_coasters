/**
 * Coaster Top - Main Application Logic v2 (Tabs + Parks)
 */

// --- Database Configuration ---
const DB_NAME = "CoasterTopDB";
const DB_VERSION = 3; // Incremented for models store
let db;

// --- State ---
const state = {
  view: "coasters", // 'coasters' or 'parks'
  coasters: [],
  parks: [],
  manufacturers: [],
  models: [], // New: Models for coasters
  filterPark: "",
  filterMfg: "",
  filterModel: "", // New: Model filter
  filterCountry: "",
  sortBy: "rank",
  isDeleteMode: false,
  selectedItems: new Set(),
  editingPark: null,
  editingCoaster: null,
  isMiniView: false, // New: Toggle for compact view
  dragState: null, // Tracks active drag operations
  dragDelay: 600, // Shared drag delay for both lists (0.6s)
};

let cropper; // Global cropper instance
let activePhotoPreview = null; // Track which preview is active

const countryFlags = {
  ES: "🇪🇸",
  USA: "🇺🇸",
  DE: "🇩🇪",
  UK: "🇬🇧",
  FR: "🇫🇷",
  NL: "🇳🇱",
  BE: "🇧🇪",
  SE: "🇸🇪",
  IT: "🇮🇹",
  JP: "🇯🇵",
  CN: "🇨🇳",
  CA: "🇨🇦",
  AE: "🇦🇪",
  PL: "🇵🇱",
  PT: "🇵🇹",
  NO: "🇳🇴",
  FI: "🇫🇮",
  DK: "🇩🇰",
  AT: "🇦🇹",
  OTHER: "🌍",
};

function getFlag(code) {
  return countryFlags[code] || "🌍";
}

// --- DOM Elements ---
const dom = {
  // Nav
  navItems: document.querySelectorAll(".nav-item"),
  views: {
    coasters: document.getElementById("coaster-list"),
    parks: document.getElementById("park-list-view"),
  },
  title: document.getElementById("app-title"),
  filterBar: document.getElementById("filter-bar"),
  sortBySelect: document.getElementById("sort-by"),
  filterPark: document.getElementById("filter-park"),
  filterMfg: document.getElementById("filter-mfg"),
  filterModel: document.getElementById("filter-model"), // New
  filterCountry: document.getElementById("filter-country"),

  // Header Btns
  addBtn: document.getElementById("add-btn"),
  trashBtn: document.getElementById("trash-btn"),

  // Modal / Forms
  modal: document.getElementById("coaster-modal"),
  modalTitle: document.getElementById("modal-title"),
  closeModal: document.querySelector(".close-modal"),

  forms: {
    coaster: document.getElementById("coaster-form"),
    park: document.getElementById("park-form"),
    mfg: document.getElementById("mfg-form"),
    model: document.getElementById("model-form"), // New
  },

  inputs: {
    name: document.getElementById("input-name"),
    height: document.getElementById("input-height"),
    park: document.getElementById("input-park"),
    mfg: document.getElementById("input-mfg"),
    model: document.getElementById("input-model"), // New
    file: document.getElementById("photo-input"),
    parkFile: document.getElementById("park-photo-input"), // New
    parkCountry: document.getElementById("park-country"), // New
  },

  parkName: document.getElementById("park-name"),
  mfgName: document.getElementById("mfg-name-input"),
  modelName: document.getElementById("model-name-input"), // New

  // Settings Modal Tabs/Sections
  mfgTabBtn: document.getElementById("mfg-tab-btn"),
  modelTabBtn: document.getElementById("model-tab-btn"),
  mfgSection: document.getElementById("mfg-section"),
  modelSection: document.getElementById("model-section"),
  mfgList: document.getElementById("mfg-list-container"),
  modelList: document.getElementById("model-list-container"),
  addNewMfgBtn: document.getElementById("add-new-mfg-btn"),
  addNewModelBtn: document.getElementById("add-new-model-btn"),
  closeSettingsBtn: document.getElementById("close-settings-modal"),
  settingsModal: document.getElementById("settings-modal"),
  settingsBtn: document.getElementById("settings-btn"),

  photoPreview: document.getElementById("photo-preview"),
  parkPhotoPreview: document.getElementById("park-photo-preview"),

  // Text Bg Inputs
  coasterBgCheck: document.getElementById("check-coaster-bg"),
  coasterBgColor: document.getElementById("input-coaster-color"),
  parkBgCheck: document.getElementById("check-park-bg"),
  parkBgColor: document.getElementById("input-park-color"),

  // Confirm Modal
  confirmModal: document.getElementById("confirm-modal"),
  confirmTitle: document.getElementById("confirm-title"),
  confirmMessage: document.getElementById("confirm-message"),
  confirmOk: document.getElementById("confirm-ok"),
  confirmCancel: document.getElementById("confirm-cancel"),
};

// --- Init ---
async function init() {
  await initDB();
  await loadData();
  updateSelectOptions(); // Populate dropdowns before rendering
  renderApp();
  setupEventListeners();
}

// Module scripts might run after DOMContentLoaded. Check readyState.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// --- IndexedDB ---
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (e) => reject("DB Error");

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("coasters")) {
        const store = db.createObjectStore("coasters", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("rank", "rank", { unique: false });
      }
      if (!db.objectStoreNames.contains("parks")) {
        // Changing to allow rank. Existing data transfer?
        // For safety in this quick iteration, we keep keyPath 'name' but we will trust 'rank' property in value.
        // ideally we use IDs but let's stick to name for simplicity with previous code.
        db.createObjectStore("parks", { keyPath: "name" });
      }
      if (!db.objectStoreNames.contains("manufacturers")) {
        db.createObjectStore("manufacturers", { keyPath: "name" });
      }
      if (!db.objectStoreNames.contains("models")) {
        db.createObjectStore("models", { keyPath: "name" });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
  });
}

async function loadData() {
  state.coasters = await getAll("coasters");
  state.parks = await getAll("parks");

  // Ensure "Otro" park exists for loose coasters
  if (!state.parks.find((p) => p.name === "Otro")) {
    await addData("parks", { name: "Otro", country: "OTHER", rank: 9999 });
    state.parks = await getAll("parks");
  }

  // Ensure "Desconocida" manufacturer exists
  state.manufacturers = await getAll("manufacturers");
  if (!state.manufacturers.find((m) => m.name === "Desconocida")) {
    await addData("manufacturers", { name: "Desconocida" });
    state.manufacturers = await getAll("manufacturers");
  }

  // Ensure "Desconocido" model exists
  state.models = await getAll("models");
  if (!state.models.find((m) => m.name === "Desconocido")) {
    await addData("models", { name: "Desconocido" });
    state.models = await getAll("models");
  }

  // Initial sort by persistent rank (always load correct DB order)
  state.coasters.sort((a, b) => (a.rank || 0) - (b.rank || 0));
  state.parks.sort((a, b) => (a.rank || 0) - (b.rank || 0));

  // DATA MIGRATION: Backfill missing 'modelo' with "Desconocido"
  let migrationNeeded = false;
  const tx = db.transaction("coasters", "readwrite");
  const store = tx.objectStore("coasters");

  for (const coaster of state.coasters) {
    if (!coaster.modelo) {
      coaster.modelo = "Desconocido";
      store.put(coaster);
      migrationNeeded = true;
    }
  }

  if (migrationNeeded) {
    await new Promise((resolve) => (tx.oncomplete = resolve));
    // Reload coasters to ensure consistency
    state.coasters = await getAll("coasters");
    state.coasters.sort((a, b) => (a.rank || 0) - (b.rank || 0));
  }
}

function getAll(storeName) {
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
  });
}

function addData(storeName, data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject("Error adding data: " + e.target.error);
  });
}

// --- Modal Helpers ---
function showConfirm(title, message, okText = "Borrar", okColor = "#ff4757") {
  return new Promise((resolve) => {
    dom.confirmTitle.textContent = title;
    dom.confirmMessage.textContent = message;
    dom.confirmOk.textContent = okText;
    dom.confirmOk.style.background = okColor;
    dom.confirmModal.classList.remove("hidden");

    const onOk = () => {
      cleanup();
      resolve(true);
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    const cleanup = () => {
      dom.confirmOk.removeEventListener("click", onOk);
      dom.confirmCancel.removeEventListener("click", onCancel);
      dom.confirmModal.classList.add("hidden");
    };

    dom.confirmOk.addEventListener("click", onOk);
    dom.confirmCancel.addEventListener("click", onCancel);
  });
}

function showAlert(title, message, btnText = "Vale") {
  return showConfirm(title, message, btnText, "#5e6ad2");
}

// --- UI Logic ---
function renderApp() {
  // Header State
  if (state.isDeleteMode) {
    if (dom.trashBtn) {
      dom.trashBtn.textContent = "✔️"; // Click to confirm mass delete
      dom.trashBtn.style.background = "#ff4757";
    }
    if (dom.title)
      dom.title.textContent = `Borrar (${state.selectedItems.size})`;
    if (dom.filterBar) dom.filterBar.classList.add("hidden");
  } else {
    if (dom.trashBtn) {
      dom.trashBtn.textContent = "🗑️";
      dom.trashBtn.style.background = "rgba(255, 255, 255, 0.1)";
    }

    if (state.view === "coasters") {
      if (dom.filterBar) {
        dom.filterBar.classList.remove("hidden");
        // Force Sync Filters
        if (dom.filterPark) dom.filterPark.value = state.filterPark;
        if (dom.filterMfg) dom.filterMfg.value = state.filterMfg;
        if (dom.filterModel) dom.filterModel.value = state.filterModel;
        if (dom.filterCountry) dom.filterCountry.value = state.filterCountry;
      }
      if (dom.title) dom.title.textContent = "Top Coasters";
      const viewToggleBtn = document.getElementById("view-toggle-btn");
      if (viewToggleBtn) viewToggleBtn.style.display = "";
    } else {
      if (dom.filterBar) dom.filterBar.classList.add("hidden");
      if (dom.title) dom.title.textContent = "Top Parques";
      const viewToggleBtn = document.getElementById("view-toggle-btn");
      if (viewToggleBtn) viewToggleBtn.style.display = "none";
    }
  }

  if (state.view === "coasters") {
    renderCoasterList();
  } else {
    renderParkList();
  }

  // Update Selects (only if not editing, to avoid clobbering active form interactions)
  if (!state.editingCoaster && !state.editingPark) {
    updateSelectOptions();
  }
}

function renderCoasterList() {
  // Calculation of counts for filter
  const parkCounts = {};
  const mfgCounts = {};
  const countryCounts = {};

  state.coasters.forEach((c) => {
    parkCounts[c.park] = (parkCounts[c.park] || 0) + 1;
    mfgCounts[c.mfg] = (mfgCounts[c.mfg] || 0) + 1;
    const parkObj = state.parks.find((p) => p.name === c.park);
    if (parkObj && parkObj.country) {
      countryCounts[parkObj.country] =
        (countryCounts[parkObj.country] || 0) + 1;
    }
  });

  // Update Filter Selects
  const currentPark = document.getElementById("filter-park").value;
  const currentMfg = document.getElementById("filter-mfg").value;
  const currentCountry = document.getElementById("filter-country").value;

  document.getElementById("filter-park").innerHTML =
    '<option value="">Todos los Parques</option>' +
    state.parks
      .map(
        (p) =>
          `<option value="${p.name}">${p.name} (${parkCounts[p.name] || 0})</option>`,
      )
      .join("");

  document.getElementById("filter-mfg").innerHTML =
    '<option value="">Todas las Manufacturadoras</option>' +
    state.manufacturers
      .filter((m) => m.name !== "Desconocida")
      .slice()
      .sort((a, b) => (mfgCounts[b.name] || 0) - (mfgCounts[a.name] || 0))
      .map(
        (m) =>
          `<option value="${m.name}">${m.name} (${mfgCounts[m.name] || 0})</option>`,
      )
      .join("");

  document.getElementById("filter-country").innerHTML =
    '<option value="">Todos los Países</option>' +
    Object.keys(countryFlags)
      .map((code) => {
        const count = countryCounts[code] || 0;
        return `<option value="${code}">${getFlag(code)} ${code} (${count})</option>`;
      })
      .join("");

  document.getElementById("filter-park").value = currentPark;
  document.getElementById("filter-mfg").value = currentMfg;
  document.getElementById("filter-country").value = currentCountry;

  // Render List
  dom.views.coasters.innerHTML = "";

  // Create a Display List based on Sort Order
  let displayList = [...state.coasters];

  if (state.sortBy === "height") {
    displayList.sort((a, b) => {
      const heightA = parseFloat(a.height) || 0;
      const heightB = parseFloat(b.height) || 0;

      // If both have no height, maintain original order
      if (!a.height && !b.height) return 0;
      // If only A has no height, put it after B
      if (!a.height) return 1;
      // If only B has no height, put it after A
      if (!b.height) return -1;

      // Both have heights, sort descending (highest first)
      return heightB - heightA;
    });
    // SortableJS handles the drag behavior, so no manual draggable attribute is needed.
  } else {
    // Already sorted by rank in state.coasters
    displayList.sort((a, b) => (a.rank || 0) - (b.rank || 0));
  }

  if (displayList.length === 0) {
    dom.views.coasters.innerHTML = `<div class="empty-state"><p>Ranking Vacío</p></div>`;
    return;
  }

  // --- FILTER ---
  const filteredCoasters = displayList.filter((c) => {
    const parkObj = state.parks.find((p) => p.name === c.park);
    const coasterCountry = c.country || (parkObj ? parkObj.country : null);

    const parkMatch = !state.filterPark || c.park === state.filterPark;
    const mfgMatch = !state.filterMfg || c.mfg === state.filterMfg;
    const modelMatch = !state.filterModel || c.modelo === state.filterModel; // New
    const countryMatch =
      !state.filterCountry || coasterCountry === state.filterCountry;
    return parkMatch && mfgMatch && modelMatch && countryMatch;
  });

  let displayRank = 0; // Counter for displayed cards only

  filteredCoasters.forEach((coaster, index) => {
    const parkObj = state.parks.find((p) => p.name === coaster.park);
    // Use coaster's country if present (for "Otro" park), otherwise use park's country
    const country = coaster.country || (parkObj ? parkObj.country : null);

    displayRank++; // Increment only for cards that pass filters
    const isSelected = state.selectedItems.has(coaster.id);

    const card = document.createElement("div");
    card.className = `coaster-card ${state.isDeleteMode && isSelected ? "selected" : ""} ${state.isMiniView ? "mini" : ""}`;
    card.dataset.id = coaster.id;

    let bgStyle = coaster.photo
      ? `<img src="${coaster.photo}" class="card-bg-img" alt="${coaster.name}">`
      : `<div class="card-bg-img" style="background: linear-gradient(45deg, #2c3e50, #4ca1af);"></div>`;

    const flag = country ? getFlag(country) : "";
    const flagHtml = flag ? `<span class="flag-pop">${flag}</span>` : "";

    if (state.isDeleteMode) {
      card.innerHTML = `
            ${bgStyle}
            <div class="selection-indicator ${isSelected ? "checked" : ""}">
                ${isSelected ? "✔" : ""}
            </div>
            <div class="card-content">
                <div class="card-info">
                    <h3>${coaster.name} ${flagHtml}</h3>
                </div>
            </div>
        `;
      card.onclick = () => toggleSelection(coaster.id);
    } else {
      let reorderControls = "";
      if (
        state.sortBy === "rank" &&
        !state.filterPark &&
        !state.filterMfg &&
        !state.filterCountry
      ) {
        reorderControls = getReorderControls(index, state.coasters.length);
      }

      const rankClass = displayRank <= 3 ? `rank-${displayRank}` : "";
      const nameClass = coaster.name.length > 20 ? "long-text" : "";

      card.innerHTML = `
            ${bgStyle}
            <div class="rank-badge ${rankClass}">${flagHtml} #${displayRank}</div>
            ${reorderControls}
            <div class="card-content">
                <div class="card-info">
                    <h3 class="${nameClass} coaster-title ${coaster.textBgColor ? "custom-text-bg" : ""}" style="${coaster.textBgColor ? `background-color: ${coaster.textBgColor}cc;` : ""}">${coaster.name}</h3>
                    <div class="card-meta">
                        <span class="pill">${coaster.park}</span>
                        <span class="pill">${coaster.mfg}</span>
                        ${coaster.height ? `<span>${coaster.height}m</span>` : ""}
                    </div>
                </div>
            </div>
        `;
      card.onclick = () => editCoaster(coaster.id);
    }

    dom.views.coasters.appendChild(card);
  });
}

function renderParkList() {
  const container = dom.views.parks;
  if (!container) return;
  container.innerHTML = "";

  if (!state.parks || state.parks.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No hay parques.</p></div>`;
    return;
  }

  state.parks.sort((a, b) => (a.rank || 0) - (b.rank || 0)); // Ensure sorted

  const displayParks = state.parks.filter((p) => p.name !== "Otro");

  displayParks.forEach((park, index) => {
    const isSelected = state.selectedItems.has(park.name);
    const card = document.createElement("div");
    card.className = `coaster-card ${state.isDeleteMode && isSelected ? "selected" : ""}`;
    card.dataset.name = park.name;
    card.style.height = "100px";

    let bgStyle = park.photo
      ? `<img src="${park.photo}" class="card-bg-img" alt="${park.name}">`
      : `<div class="card-bg-img" style="background: linear-gradient(45deg, #FF512F, #DD2476);"></div>`;
    const flag = park.country ? getFlag(park.country) : "";
    const flagHtml = flag ? `<span class="flag-pop">${flag}</span>` : "";
    const reorderControls = getReorderControls(index, displayParks.length);
    const rankClass = index + 1 <= 3 ? `rank-${index + 1}` : "";
    const nameClass = park.name.length > 20 ? "long-text" : ""; // Add long-text class for long names

    if (state.isDeleteMode) {
      card.innerHTML = `
            ${bgStyle}
            <div class="selection-indicator ${isSelected ? "checked" : ""}">
                ${isSelected ? "✔" : ""}
            </div>
            <div class="card-content">
                <div class="card-info">
                  <h3 class="park-title ${nameClass} ${park.textBgColor ? "custom-text-bg" : ""}" style="${park.textBgColor ? `background-color: ${park.textBgColor}cc;` : ""}">${park.name} ${flagHtml}</h3>
                  ${park.visitCount ? `<span class="visit-badge" style="margin-top: 5px;">🎟️ Nº Visitas: ${park.visitCount}</span>` : ""}
                </div>
            </div>
        `;
      card.onclick = () => toggleSelection(park.name);
    } else {
      card.innerHTML = `
            ${bgStyle}
            <div class="badges-wrapper">
                <div class="rank-badge ${rankClass}">
                    ${flagHtml} #${index + 1}
                </div>
                ${park.visitCount ? `<span class="visit-badge">🎟️ Nº Visitas: ${park.visitCount}</span>` : ""}
            </div>
            ${reorderControls}
            <div class="card-content">
                <div class="card-info">
                  <h3 class="park-title ${nameClass} ${park.textBgColor ? "custom-text-bg" : ""}" style="${park.textBgColor ? `background-color: ${park.textBgColor}cc;` : ""}">${park.name}</h3>
                </div>
            </div>
        `;
      card.onclick = () => editPark(park.name);
    }

    container.appendChild(card);
  });

  // SortableJS deshabilitado - Solo botones ▲/▼
}

function getReorderControls(index, total) {
  return `
        <div class="reorder-controls">
            <button class="reorder-btn up" onclick="moveItem(event, ${index}, -1)">▲</button>
            <button class="reorder-btn down" onclick="moveItem(event, ${index}, 1)">▼</button>
        </div>
    `;
}

function toggleSelection(id) {
  if (state.selectedItems.has(id)) {
    state.selectedItems.delete(id);
  } else {
    state.selectedItems.add(id);
  }
  renderApp();
}

async function executeMassDelete() {
  if (state.selectedItems.size === 0) return;

  const confirmed = await showConfirm(
    "¿Borrar elementos?",
    `¿Estás seguro de que quieres borrar ${state.selectedItems.size} elementos seleccionados?`,
  );
  if (!confirmed) return;

  const storeName = state.view; // coasters or parks
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);

  state.selectedItems.forEach((id) => {
    store.delete(id);
  });

  await new Promise((r) => (tx.oncomplete = r));
  state.selectedItems.clear();
  state.isDeleteMode = false;
  await loadData();
  renderApp();
}

// Global Delete Item
window.deleteItem = async (id, storeName) => {
  const confirmed = await showConfirm(
    "¿Seguro?",
    "¿De verdad quieres borrar este elemento? Esta acción no se puede deshacer.",
  );
  if (!confirmed) return;

  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  store.delete(id);

  await new Promise((r) => (tx.oncomplete = r));
  await loadData(); // Reload all data to refresh state
  renderApp();
};

// Global Move Item - OPTIMIZED: Only updates 2 items instead of all
window.moveItem = async (e, index, direction) => {
  if (e) e.stopPropagation();
  const list = state.view === "coasters" ? state.coasters : state.parks;
  const storeName = state.view;

  if (direction === -1 && index === 0) return;
  if (direction === 1 && index === list.length - 1) return;

  const newIndex = index + direction;

  // Swap in memory
  const temp = list[index];
  list[index] = list[newIndex];
  list[newIndex] = temp;

  // Update ranks for ONLY the two swapped items
  list[index].rank = index + 1;
  list[newIndex].rank = newIndex + 1;

  // Update DB - ONLY 2 operations instead of 169!
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);

  store.put(list[index]);
  store.put(list[newIndex]);

  await new Promise((r) => (tx.oncomplete = r));
  renderApp();
};

window.editPark = (name) => {
  const park = state.parks.find((p) => p.name === name);
  if (!park) return;

  state.editingPark = name;

  // Open Modal
  dom.modal.classList.remove("hidden");
  dom.forms.coaster.classList.add("hidden");
  dom.forms.mfg.classList.add("hidden");

  dom.forms.park.classList.remove("hidden");
  dom.modalTitle.textContent = "Editar Parque";

  // Populate
  dom.parkName.value = park.name;
  dom.parkName.disabled = false;

  // Photo
  if (park.photo) {
    dom.parkPhotoPreview.innerHTML = `<img src="${park.photo}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`;
    dom.parkPhotoPreview.dataset.tempSrc = park.photo;
  } else {
    dom.parkPhotoPreview.innerHTML = "<span>📷 Toca para añadir foto</span>";
    dom.parkPhotoPreview.removeAttribute("data-temp-src");
  }

  // Populate Text Bg
  if (park.textBgColor) {
    dom.parkBgCheck.checked = true;
    dom.parkBgColor.value = park.textBgColor;
  } else {
    dom.parkBgCheck.checked = false;
    dom.parkBgColor.value = "#000000";
  }

  // Populate Country
  updateSelectOptions();
  if (park.country) {
    dom.inputs.parkCountry.value = park.country;
  }

  // Populate Rank and Visits
  document.getElementById("park-rank").value = park.rank;
  document.getElementById("input-visit-count").value = park.visitCount || 0;
};

// --- Event Listeners ---
function setupEventListeners() {
  // Trash Btn
  dom.trashBtn.addEventListener("click", () => {
    if (!state.isDeleteMode) {
      state.isDeleteMode = true;
      state.selectedItems.clear();
      renderApp();
    } else {
      if (state.selectedItems.size > 0) {
        executeMassDelete();
      } else {
        // If nothing selected, just exit mode
        state.isDeleteMode = false;
        renderApp();
      }
    }
  });

  // View Toggle Btn
  const viewToggleBtn = document.getElementById("view-toggle-btn");
  if (viewToggleBtn) {
    viewToggleBtn.addEventListener("click", () => {
      state.isMiniView = !state.isMiniView;
      viewToggleBtn.textContent = state.isMiniView ? "📐" : "📏";
      renderApp();
    });
  }

  // Nav
  dom.navItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      // Reset delete mode on switch
      if (state.isDeleteMode) {
        state.isDeleteMode = false;
        state.selectedItems.clear();
      }

      dom.navItems.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      // Switch View
      dom.views.coasters.classList.add("hidden");
      dom.views.parks.classList.add("hidden");
      dom.views.coasters.classList.remove("active");
      dom.views.parks.classList.remove("active");

      const target = btn.dataset.target; // coaster-list or park-list-view
      document.getElementById(target).classList.remove("hidden");
      document.getElementById(target).classList.add("active");

      // Update State
      state.view = target === "coaster-list" ? "coasters" : "parks";
      renderApp();
    });
  });

  // Add Button
  dom.addBtn.addEventListener("click", () => {
    if (state.isDeleteMode) {
      // Exit delete mode when Add is clicked?
      // User said "deja el boton de mas que habia antes", so maybe just exit mode and open modal.
      state.isDeleteMode = false;
      state.selectedItems.clear();
      renderApp();
    }

    // Prepare Modal based on View
    dom.modal.classList.remove("hidden");
    dom.forms.coaster.classList.add("hidden");
    dom.forms.park.classList.add("hidden");
    dom.forms.mfg.classList.add("hidden");

    if (state.view === "coasters") {
      dom.modalTitle.textContent = "Añadir Coaster";
      dom.forms.coaster.classList.remove("hidden");
      dom.forms.coaster.reset();
      dom.photoPreview.innerHTML = "<span>📷 Toca para añadir foto</span>";
      dom.photoPreview.removeAttribute("data-temp-src");
      // Reset text bg defaults
      dom.coasterBgCheck.checked = false;
      dom.coasterBgColor.value = "#000000";
      state.editingCoaster = null; // Clear edit
      updateSelectOptions(); // Ensure up to date
    } else {
      dom.modalTitle.textContent = "Añadir Parque";
      dom.forms.park.classList.remove("hidden");
      dom.forms.park.reset();
      dom.parkPhotoPreview.innerHTML = "<span>📷 Toca para añadir foto</span>";
      dom.parkPhotoPreview.removeAttribute("data-temp-src");
      dom.parkName.disabled = false; // Reset
      // Reset text bg defaults
      dom.parkBgCheck.checked = false;
      dom.parkBgColor.value = "#000000";
      state.editingPark = null; // Clear edit mode
      updateSelectOptions(); // Ensure country list is populated
    }
  });

  // Handle "New Mfg" select
  dom.inputs.mfg.addEventListener("change", (e) => {
    if (e.target.value === "new_mfg") {
      dom.forms.coaster.classList.add("hidden");
      dom.forms.mfg.classList.remove("hidden");
      dom.forms.mfg.classList.remove("hidden");
      dom.modalTitle.textContent = "Crear Manufacturadora";
      dom.mfgName.value = "";
      dom.mfgName.focus();
    }
  });

  // Handle Park selection - show country field if "Otro" is selected
  dom.inputs.park.addEventListener("change", (e) => {
    const countryGroup = document.getElementById("coaster-country-group");
    const countrySelect = document.getElementById("coaster-country");

    if (e.target.value === "Otro") {
      countryGroup.style.display = "block";
      // Populate country options
      countrySelect.innerHTML =
        '<option value="" disabled selected>Selecciona País...</option>' +
        Object.keys(countryFlags)
          .map(
            (code) =>
              `<option value="${code}">${getFlag(code)} ${code}</option>`,
          )
          .join("");
    } else {
      countryGroup.style.display = "none";
      countrySelect.value = "";
    }
  });

  // Submits
  dom.forms.coaster.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = dom.inputs.name.value;
    const height = dom.inputs.height.value;
    const park = dom.inputs.park.value;
    const mfg = dom.inputs.mfg.value;
    const modelo = dom.inputs.model.value; // New
    const photo = dom.photoPreview.dataset.tempSrc || null;
    const rankInput = document.getElementById("input-rank").value;
    const rideCount =
      parseInt(document.getElementById("input-ride-count").value) || 0;
    const coasterCountry =
      document.getElementById("coaster-country").value || null;

    // Text Bg Logic
    const textBgColor = dom.coasterBgCheck.checked
      ? dom.coasterBgColor.value
      : null;

    let targetRank = rankInput ? parseInt(rankInput) : null;

    if (state.editingCoaster) {
      // Edit Mode
      const coaster = state.coasters.find((c) => c.id === state.editingCoaster);
      if (coaster) {
        coaster.name = name;
        coaster.height = height;
        coaster.park = park;
        coaster.mfg = mfg;
        coaster.modelo = modelo; // New
        coaster.rideCount = rideCount;
        coaster.country = coasterCountry;
        if (photo) coaster.photo = photo;
        // Update bg
        coaster.textBgColor = textBgColor;

        await handleRankUpdate("coasters", coaster, targetRank);
      }
    } else {
      // Create Mode
      const newCoaster = {
        name,
        height,
        park,
        mfg,
        modelo, // New
        photo,
        rideCount,
        country: coasterCountry,
        textBgColor: textBgColor,
      };
      await handleRankUpdate("coasters", newCoaster, targetRank, true);
    }

    await loadData();
    renderApp();
    dom.modal.classList.add("hidden");
    state.editingCoaster = null;
  });

  dom.forms.park.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = dom.parkName.value;
    const country = dom.inputs.parkCountry.value;
    const visitCount =
      parseInt(document.getElementById("input-visit-count").value) || 0;
    const photo = dom.parkPhotoPreview.dataset.tempSrc || null;
    const rankInput = document.getElementById("park-rank").value;
    let targetRank = rankInput ? parseInt(rankInput) : null;

    // Text Bg Logic
    const textBgColor = dom.parkBgCheck.checked ? dom.parkBgColor.value : null;

    if (state.editingPark) {
      // Edit Mode
      if (state.editingPark !== name) {
        // Rename Logic
        if (state.parks.find((p) => p.name === name)) {
          showAlert("¡Ups!", "¡El parque ya existe!");
          return;
        }

        const oldName = state.editingPark;
        const oldPark = state.parks.find((p) => p.name === oldName);

        // Update Coasters & Delete Old Park via Transaction
        const tx = db.transaction(["coasters", "parks"], "readwrite");
        const coasterStore = tx.objectStore("coasters");
        const parkStore = tx.objectStore("parks");

        const affectedCoasters = state.coasters.filter(
          (c) => c.park === oldName,
        );
        affectedCoasters.forEach((c) => {
          c.park = name;
          coasterStore.put(c);
        });

        parkStore.delete(oldName);

        await new Promise((r) => (tx.oncomplete = r));
        await loadData();

        // Create New Park Entry with correct rank
        const newPark = {
          ...oldPark,
          name,
          country,
          visitCount,
          photo,
          textBgColor,
        };
        // Treat as new to insert correctly
        await handleRankUpdate("parks", newPark, targetRank, true);
      } else {
        // Standard Edit
        const park = state.parks.find((p) => p.name === state.editingPark);
        if (park) {
          park.country = country;
          park.visitCount = visitCount;
          if (photo) park.photo = photo;
          // Update bg
          park.textBgColor = textBgColor;
          await handleRankUpdate("parks", park, targetRank);
        }
      }
    } else {
      // Create Mode
      if (state.parks.find((p) => p.name === name)) {
        showAlert("¡Ups!", "¡El parque ya existe!");
        return;
      }
      const newPark = { name, country, visitCount, photo, textBgColor };
      await handleRankUpdate("parks", newPark, targetRank, true);
    }

    await loadData();
    renderApp();
    dom.modal.classList.add("hidden");
    state.editingPark = null;
    dom.parkName.disabled = false;
  });

  dom.forms.mfg.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = dom.mfgName.value;
    if (state.manufacturers.find((m) => m.name === name)) {
      showAlert("¡Ups!", "¡Esta manufacturadora ya existe!");
      return;
    }
    await addData("manufacturers", { name });
    await loadData(); // Reload to get it in select

    // Return to Coaster Form
    dom.forms.mfg.classList.add("hidden");
    dom.forms.coaster.classList.remove("hidden");
    dom.modalTitle.textContent = "Añadir Coaster";
    updateSelectOptions();
    dom.inputs.mfg.value = name; // Select the new one
  });

  dom.forms.model.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = dom.modelName.value;
    if (state.models.find((m) => m.name === name)) {
      showAlert("¡Ups!", "¡Este modelo ya existe!");
      return;
    }
    await addData("models", { name });
    await loadData();

    // Return to Coaster Form
    dom.forms.model.classList.add("hidden");
    dom.forms.coaster.classList.remove("hidden");
    dom.modalTitle.textContent = "Añadir Coaster";
    updateSelectOptions();
    dom.inputs.model.value = name;
  });

  // Close
  dom.closeModal.addEventListener("click", () =>
    dom.modal.classList.add("hidden"),
  );

  // Filters
  document.getElementById("sort-by").addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    renderApp();
  });
  document.getElementById("filter-park").addEventListener("change", (e) => {
    state.filterPark = e.target.value;
    renderApp();
  });
  document.getElementById("filter-mfg").addEventListener("change", (e) => {
    state.filterMfg = e.target.value;
    renderApp();
  });
  document.getElementById("filter-country").addEventListener("change", (e) => {
    state.filterCountry = e.target.value;
    renderApp();
  });

  // Photo - Intercept for Cropper
  const handlePhotoSelect = (e, previewElement) => {
    const file = e.target.files[0];
    if (file) {
      activePhotoPreview = previewElement; // Set active target
      const reader = new FileReader();
      reader.onload = (e) => {
        // Show Crop Modal
        const cropModal = document.getElementById("crop-modal");
        const cropImage = document.getElementById("crop-image");

        cropModal.classList.remove("hidden");
        cropImage.src = e.target.result;

        // Init Cropper
        if (cropper) {
          cropper.destroy();
        }
        cropper = new Cropper(cropImage, {
          viewMode: 1,
          dragMode: "move",
          aspectRatio: 16 / 9,
          autoCropArea: 1,
          restore: false,
          guides: false,
          center: false,
          highlight: false,
          cropBoxMovable: false,
          cropBoxResizable: false,
          toggleDragModeOnDblclick: false,
        });
      };
      reader.readAsDataURL(file);
    }
    // Reset value to allow re-selecting same file if canceled
    e.target.value = "";
  };

  dom.inputs.file.addEventListener("change", (e) =>
    handlePhotoSelect(e, dom.photoPreview),
  );
  dom.inputs.parkFile.addEventListener("change", (e) =>
    handlePhotoSelect(e, dom.parkPhotoPreview),
  );

  // Crop Modal Actions
  document.getElementById("crop-cancel-btn").addEventListener("click", () => {
    document.getElementById("crop-modal").classList.add("hidden");
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
  });

  document.getElementById("crop-confirm-btn").addEventListener("click", () => {
    if (!cropper) return;

    const canvas = cropper.getCroppedCanvas();
    // High quality jpeg
    const croppedDataUrl = canvas.toDataURL("image/jpeg", 0.95);

    // Initial Preview Update
    if (activePhotoPreview) {
      activePhotoPreview.innerHTML = `<img src="${croppedDataUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`;
      activePhotoPreview.dataset.tempSrc = croppedDataUrl;
    }

    // Close
    document.getElementById("crop-modal").classList.add("hidden");
    cropper.destroy();
    cropper = null;
  });

  // --- DATA BACKUP ---
  const dataBtn = document.getElementById("data-btn");
  const dataModal = document.getElementById("data-modal");
  const closeDataModal = document.getElementById("close-data-modal");
  const exportBtn = document.getElementById("export-btn");
  const importFile = document.getElementById("import-file");

  if (dataBtn) {
    dataBtn.addEventListener("click", () => {
      dataModal.classList.remove("hidden");
    });
  }

  if (closeDataModal) {
    closeDataModal.addEventListener("click", () => {
      dataModal.classList.add("hidden");
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", async () => {
      const exportData = {
        coasters: state.coasters,
        parks: state.parks,
        manufacturers: state.manufacturers,
        models: state.models, // New
        exportDate: new Date().toISOString(),
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `coaster-top-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Manual trigger for the import button to open file dialog
  const importBtn = document.getElementById("import-btn"); // Need to add ID in HTML or select by class
  if (importBtn) {
    importBtn.addEventListener("click", () => {
      importFile.click();
    });
  }

  if (importFile) {
    importFile.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const importedData = JSON.parse(e.target.result);

          const confirmed = await showConfirm(
            "¿Importar Datos?",
            `Se importarán:\n- ${importedData.coasters?.length || 0} Coasters\n- ${importedData.parks?.length || 0} Parques\n\nEsto fusionará/sobrescribirá datos`,
            "Importar",
            "#e67e22",
          );

          if (!confirmed) {
            importFile.value = "";
            return;
          }

          // Bulk Import
          if (importedData.parks) {
            for (const p of importedData.parks) {
              await addData("parks", p);
            }
          }
          if (importedData.manufacturers) {
            for (const m of importedData.manufacturers) {
              await addData("manufacturers", m);
            }
          }
          if (importedData.coasters) {
            for (const c of importedData.coasters) {
              await addData("coasters", c);
            }
          }

          await showConfirm(
            "¡Hecho!",
            "¡Datos importados correctamente! 🚀",
            "Genial",
            "#27ae60",
          );
          state.isDeleteMode = false; // Reset safe
          dataModal.classList.add("hidden");
          importFile.value = "";

          await loadData();
          renderApp();
        } catch (err) {
          showAlert("Error", "Error al leer el archivo JSON: " + err);
          console.error(err);
        }
      };
      reader.readAsText(file);
    });
  }

  // --- SETTINGS MODAL ---
  const settingsBtn = document.getElementById("settings-btn");
  const settingsModal = document.getElementById("settings-modal");
  const closeSettingsModal = document.getElementById("close-settings-modal");
  const addNewMfgBtn = document.getElementById("add-new-mfg-btn");

  function renderMfgList() {
    const container = document.getElementById("mfg-list-container");
    container.innerHTML = "";

    if (state.manufacturers.length === 0) {
      container.innerHTML =
        '<p style="text-align: center; color: #999;">No hay manufacturadoras creadas</p>';
      return;
    }

    state.manufacturers.forEach((mfg) => {
      if (mfg.name === "Desconocida") return;

      const item = document.createElement("div");
      item.className = "mfg-item";

      const usageCount = state.coasters.filter(
        (c) => c.mfg === mfg.name,
      ).length;

      item.innerHTML = `
        <div class="mfg-item-name">${mfg.name} <span style="color: #999; font-size: 12px;">(${usageCount} coasters)</span></div>
        <div class="mfg-item-actions">
          <button class="mfg-item-btn" data-mfg="${mfg.name}">✏️ Editar</button>
          <button class="mfg-item-btn delete" data-mfg="${mfg.name}">🗑️ Borrar</button>
        </div>
      `;

      // Edit button
      item
        .querySelector(".mfg-item-btn:not(.delete)")
        .addEventListener("click", async () => {
          const newName = prompt(`Renombrar "${mfg.name}" a:`, mfg.name);
          if (!newName || newName === mfg.name) return;

          if (state.manufacturers.find((m) => m.name === newName)) {
            alert("¡Ya existe una manufacturadora con ese nombre!");
            return;
          }

          // Update manufacturer
          const tx = db.transaction("manufacturers", "readwrite");
          const store = tx.objectStore("manufacturers");
          store.delete(mfg.name);
          store.put({ name: newName });

          // Update all coasters using this manufacturer
          const coastersToUpdate = state.coasters.filter(
            (c) => c.mfg === mfg.name,
          );
          if (coastersToUpdate.length > 0) {
            const coasterTx = db.transaction("coasters", "readwrite");
            const coasterStore = coasterTx.objectStore("coasters");
            coastersToUpdate.forEach((c) => {
              c.mfg = newName;
              coasterStore.put(c);
            });
            await new Promise((r) => (coasterTx.oncomplete = r));
          }

          await new Promise((r) => (tx.oncomplete = r));
          await loadData();
          renderMfgList();
          updateSelectOptions();
        });

      // Delete button
      item
        .querySelector(".mfg-item-btn.delete")
        .addEventListener("click", async () => {
          if (usageCount > 0) {
            if (
              !confirm(
                `Esta manufacturadora está siendo usada por ${usageCount} coaster(s). ¿Seguro que quieres borrarla? Las coasters quedarán sin manufacturadora`,
              )
            ) {
              return;
            }
          }

          const tx = db.transaction("manufacturers", "readwrite");
          const store = tx.objectStore("manufacturers");
          store.delete(mfg.name);
          await new Promise((r) => (tx.oncomplete = r));
          await loadData();
          renderMfgList();
          updateSelectOptions();
        });

      container.appendChild(item);
    });
  }

  function renderModelList() {
    const container = document.getElementById("model-list-container");
    container.innerHTML = "";

    if (state.models.length === 0) {
      container.innerHTML =
        '<p style="text-align: center; color: #999;">No hay modelos creados</p>';
      return;
    }

    state.models
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((model) => {
        if (model.name === "Desconocido") return;

        const item = document.createElement("div");
        item.className = "mfg-item"; // Reuse same styling

        const usageCount = state.coasters.filter(
          (c) => c.modelo === model.name,
        ).length;

        item.innerHTML = `
        <div class="mfg-item-name">${model.name} <span style="color: #999; font-size: 12px;">(${usageCount} coasters)</span></div>
        <div class="mfg-item-actions">
          <button class="mfg-item-btn" data-model="${model.name}">✏️ Editar</button>
          <button class="mfg-item-btn delete" data-model="${model.name}">🗑️ Borrar</button>
        </div>
      `;

        // Edit button
        item
          .querySelector(".mfg-item-btn:not(.delete)")
          .addEventListener("click", async () => {
            const newName = prompt(`Renombrar "${model.name}" a:`, model.name);
            if (!newName || newName === model.name) return;

            if (state.models.find((m) => m.name === newName)) {
              alert("¡Ya existe un modelo con ese nombre!");
              return;
            }

            // Update model
            const tx = db.transaction("models", "readwrite");
            const store = tx.objectStore("models");
            store.delete(model.name);
            store.put({ name: newName });

            // Update all coasters using this model
            const coastersToUpdate = state.coasters.filter(
              (c) => c.modelo === model.name,
            );
            if (coastersToUpdate.length > 0) {
              const coasterTx = db.transaction("coasters", "readwrite");
              const coasterStore = coasterTx.objectStore("coasters");
              coastersToUpdate.forEach((c) => {
                c.modelo = newName;
                coasterStore.put(c);
              });
              await new Promise((r) => (coasterTx.oncomplete = r));
            }

            await new Promise((r) => (tx.oncomplete = r));
            await loadData();
            renderModelList();
            updateSelectOptions();
          });

        // Delete button
        item
          .querySelector(".mfg-item-btn.delete")
          .addEventListener("click", async () => {
            if (usageCount > 0) {
              if (
                !confirm(
                  `Este modelo está siendo usado por ${usageCount} coaster(s). ¿Seguro que quieres borrarlo? Las coasters quedarán sin modelo asignado.`,
                )
              ) {
                return;
              }
            }

            const tx = db.transaction("models", "readwrite");
            const store = tx.objectStore("models");
            store.delete(model.name);
            await new Promise((r) => (tx.oncomplete = r));
            await loadData();
            renderModelList();
            updateSelectOptions();
          });

        container.appendChild(item);
      });
  }

  // --- TAB SWITCHING ---
  if (dom.mfgTabBtn) {
    dom.mfgTabBtn.addEventListener("click", () => {
      dom.mfgSection.classList.remove("hidden");
      dom.modelSection.classList.add("hidden");
      dom.mfgTabBtn.style.background = "#5e6ad2";
      dom.mfgTabBtn.style.color = "white";
      dom.modelTabBtn.style.background = "";
      dom.modelTabBtn.style.color = "";
      renderMfgList();
    });
  }

  if (dom.modelTabBtn) {
    dom.modelTabBtn.addEventListener("click", () => {
      dom.modelSection.classList.remove("hidden");
      dom.mfgSection.classList.add("hidden");
      dom.modelTabBtn.style.background = "#5e6ad2";
      dom.modelTabBtn.style.color = "white";
      dom.mfgTabBtn.style.background = "";
      dom.mfgTabBtn.style.color = "";
      renderModelList();
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      settingsModal.classList.remove("hidden");
      // Default to mfg tab
      dom.mfgSection.classList.remove("hidden");
      dom.modelSection.classList.add("hidden");
      dom.mfgTabBtn.style.background = "#5e6ad2";
      dom.mfgTabBtn.style.color = "white";
      dom.modelTabBtn.style.background = "";
      dom.modelTabBtn.style.color = "";
      renderMfgList();
    });
  }

  if (closeSettingsModal) {
    closeSettingsModal.addEventListener("click", () => {
      settingsModal.classList.add("hidden");
    });
  }

  if (addNewMfgBtn) {
    addNewMfgBtn.addEventListener("click", () => {
      settingsModal.classList.add("hidden");
      dom.modal.classList.remove("hidden");
      dom.forms.coaster.classList.add("hidden");
      dom.forms.park.classList.add("hidden");
      dom.forms.mfg.classList.remove("hidden");
      dom.forms.model.classList.add("hidden");
      dom.modalTitle.textContent = "Crear Manufacturadora";
      dom.mfgName.value = "";
      dom.mfgName.focus();
    });
  }

  if (dom.addNewModelBtn) {
    dom.addNewModelBtn.addEventListener("click", () => {
      settingsModal.classList.add("hidden");
      dom.modal.classList.remove("hidden");
      dom.forms.coaster.classList.add("hidden");
      dom.forms.park.classList.add("hidden");
      dom.forms.mfg.classList.add("hidden");
      dom.forms.model.classList.remove("hidden");
      dom.modalTitle.textContent = "Crear Modelo";
      dom.modelName.value = "";
      dom.modelName.focus();
    });
  }

  // Handle Create New triggers from selects
  dom.inputs.mfg.addEventListener("change", (e) => {
    if (e.target.value === "new_mfg") {
      dom.forms.coaster.classList.add("hidden");
      dom.forms.mfg.classList.remove("hidden");
      dom.modalTitle.textContent = "Crear Manufacturadora";
      dom.mfgName.value = "";
      dom.mfgName.focus();
    }
  });

  dom.inputs.model.addEventListener("change", (e) => {
    if (e.target.value === "new_model") {
      dom.forms.coaster.classList.add("hidden");
      dom.forms.model.classList.remove("hidden");
      dom.modalTitle.textContent = "Crear Modelo";
      dom.modelName.value = "";
      dom.modelName.focus();
    }
  });

  // Filter listener for models
  if (dom.filterModel) {
    dom.filterModel.addEventListener("change", (e) => {
      state.filterModel = e.target.value;
      renderApp();
    });
  }
}

window.editCoaster = (id) => {
  const coaster = state.coasters.find((c) => c.id === id);
  if (!coaster) return;

  state.editingCoaster = id;

  // Populate Selects FIRST so we don't overwrite values later
  updateSelectOptions();

  dom.modal.classList.remove("hidden");
  dom.forms.park.classList.add("hidden");
  dom.forms.mfg.classList.add("hidden");

  dom.forms.coaster.classList.remove("hidden");
  dom.modalTitle.textContent = "Editar Coaster";

  // Populate Values
  dom.inputs.name.value = coaster.name;
  dom.inputs.height.value = coaster.height;
  dom.inputs.park.value = coaster.park;
  dom.inputs.mfg.value = coaster.mfg;
  if (dom.inputs.model && coaster.modelo) {
    dom.inputs.model.value = coaster.modelo;
  }
  // Populate Rank
  document.getElementById("input-rank").value = coaster.rank || "";

  // Populate Text Bg
  if (coaster.textBgColor) {
    dom.coasterBgCheck.checked = true;
    dom.coasterBgColor.value = coaster.textBgColor;
  } else {
    dom.coasterBgCheck.checked = false;
    dom.coasterBgColor.value = "#000000";
  }
  document.getElementById("input-ride-count").value = coaster.rideCount || 0;

  // Handle coaster country if park is "Otro"
  const countryGroup = document.getElementById("coaster-country-group");
  const countrySelect = document.getElementById("coaster-country");
  if (coaster.park === "Otro") {
    countryGroup.style.display = "block";
    countrySelect.innerHTML =
      '<option value="" disabled selected>Selecciona País...</option>' +
      Object.keys(countryFlags)
        .map(
          (code) => `<option value="${code}">${getFlag(code)} ${code}</option>`,
        )
        .join("");
    if (coaster.country) {
      countrySelect.value = coaster.country;
    }
  } else {
    countryGroup.style.display = "none";
  }

  if (coaster.photo) {
    dom.photoPreview.innerHTML = `<img src="${coaster.photo}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`;
    dom.photoPreview.dataset.tempSrc = coaster.photo;
  } else {
    dom.photoPreview.innerHTML = "<span>📷 Toca para añadir foto</span>";
    dom.photoPreview.removeAttribute("data-temp-src");
  }
};

function updateSelectOptions() {
  const pSelect = dom.inputs.park;
  const mSelect = dom.inputs.mfg;
  const cSelect = dom.inputs.parkCountry;

  // Preserve current selection
  const pVal = pSelect.value;
  const mVal = mSelect.value;
  const modSelect = dom.inputs.model;
  const modVal = modSelect ? modSelect.value : "";
  const cVal = cSelect ? cSelect.value : "";

  pSelect.innerHTML =
    '<option value="" disabled selected>Selecciona un Parque...</option>' +
    state.parks
      .map((p) => `<option value="${p.name}">${p.name}</option>`)
      .join("");

  mSelect.innerHTML =
    '<option value="" disabled selected>Selecciona Manufacturadora...</option>' +
    state.manufacturers
      .map((m) => `<option value="${m.name}">${m.name}</option>`)
      .join("") +
    '<option value="new_mfg">+ Crear Nueva...</option>';

  if (modSelect) {
    modSelect.innerHTML =
      '<option value="" disabled selected>Selecciona Modelo...</option>' +
      state.models
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((m) => `<option value="${m.name}">${m.name}</option>`)
        .join("") +
      '<option value="new_model">+ Crear Nuevo...</option>';
  }

  // Update Filters
  // Update Filters
  const fPark = document.getElementById("filter-park");
  const fMfg = document.getElementById("filter-mfg");
  const fModel = document.getElementById("filter-model");

  if (fPark) {
    fPark.innerHTML =
      '<option value="">Todos los Parques</option>' +
      state.parks
        .filter((p) => p.name !== "Otro")
        .map((p) => `<option value="${p.name}">${p.name}</option>`)
        .join("");
    fPark.value = state.filterPark || "";
  }

  if (fMfg) {
    fMfg.innerHTML =
      '<option value="">Todas las Manufacturadoras</option>' +
      state.manufacturers
        .map((m) => `<option value="${m.name}">${m.name}</option>`)
        .join("");
    fMfg.value = state.filterMfg || "";
  }

  if (fModel) {
    fModel.innerHTML =
      '<option value="">Todos los Modelos</option>' +
      state.models
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((m) => `<option value="${m.name}">${m.name}</option>`)
        .join("");
    fModel.value = state.filterModel || "";
  }

  // Update Park Country Select
  if (cSelect) {
    cSelect.innerHTML =
      '<option value="" disabled selected>Selecciona País...</option>' +
      Object.keys(countryFlags)
        .map(
          (code) => `<option value="${code}">${getFlag(code)} ${code}</option>`,
        )
        .join("");
  }

  // Restore selection if valid
  if (pVal) pSelect.value = pVal;
  if (mVal) mSelect.value = mVal;
  if (modVal && modSelect) modSelect.value = modVal;
  if (cVal && cSelect) cSelect.value = cVal;
}

async function handleRankUpdate(storeName, item, targetRank, isNew = false) {
  const list = storeName === "coasters" ? state.coasters : state.parks;
  const keyProp = storeName === "coasters" ? "id" : "name";

  // Ensure fresh sort
  list.sort((a, b) => (a.rank || 0) - (b.rank || 0));

  // If new, just add to end first
  if (isNew) {
    item.rank = list.length + 1;
    list.push(item);
  }

  // If no target rank specified or invalid, just save as last
  if (!targetRank || targetRank < 1) {
    await addData(storeName, item);
    return;
  }

  // Remove item from current position in array (by reference/id)
  const currentIndex = list.findIndex((i) => i[keyProp] === item[keyProp]);
  if (currentIndex !== -1) {
    list.splice(currentIndex, 1);
  }

  // Clamp target index
  const safeTargetIndex = Math.max(0, Math.min(targetRank - 1, list.length));

  // Insert at new position
  list.splice(safeTargetIndex, 0, item);

  // Re-assign ALL ranks sequentially (1, 2, 3...)
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);

  for (let i = 0; i < list.length; i++) {
    list[i].rank = i + 1;
    store.put(list[i]);
  }

  await new Promise((r) => (tx.oncomplete = r));
}

// Legacy handleDragDrop function removed - replaced by saveNewOrderFromDOM

function updateRankBadge(card, newRank) {
  const badge = card.querySelector(".rank-badge");
  if (badge) {
    // Keep flag if present
    const flag = badge.querySelector(".flag-pop");
    const flagHTML = flag ? flag.outerHTML : "";
    badge.innerHTML = `${flagHTML} #${newRank}`;
  }
}

function updateRankStyles(card, rank) {
  const badge = card.querySelector(".rank-badge");
  if (!badge) return;

  // Remove old rank classes
  badge.classList.remove("rank-1", "rank-2", "rank-3");

  // Add new if applicable
  if (rank <= 3) {
    badge.classList.add(`rank-${rank}`);
  }
}

// function updateDragPlaceholder(fromIndex, toIndex) { ... }

// SortableJS handles auto-scroll and cleanup automatically.

// Global Stepper Helper
window.updateStepper = (inputId, change) => {
  const input = document.getElementById(inputId);
  let val = parseInt(input.value) || 0;
  val += change;
  if (val < 0) val = 0;
  input.value = val;
};
