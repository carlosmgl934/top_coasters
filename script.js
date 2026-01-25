/**
 * Coaster Top - Main Application Logic v2 (Tabs + Parks)
 */

// --- Database Configuration ---
const DB_NAME = "CoasterTopDB";
const DB_VERSION = 2; // Incremented for robustness if needed, though schema is same logic
let db;

// --- State ---
const state = {
  view: "coasters", // 'coasters' or 'parks'
  coasters: [],
  parks: [],
  manufacturers: [],
  filterPark: "",
  filterMfg: "",
  filterCountry: "",
  sortBy: "rank",
  isDeleteMode: false,
  selectedItems: new Set(),
  editingPark: null,
  editingCoaster: null,
  isMiniView: false, // New: Toggle for compact view
  dragState: null, // Tracks active drag operations
};

let cropper; // Global cropper instance

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
  },

  inputs: {
    name: document.getElementById("input-name"),
    height: document.getElementById("input-height"),
    park: document.getElementById("input-park"),
    mfg: document.getElementById("input-mfg"),
    file: document.getElementById("photo-input"),
    parkCountry: document.getElementById("park-country"), // New
  },

  parkName: document.getElementById("park-name"),
  mfgName: document.getElementById("mfg-name-input"),

  photoPreview: document.getElementById("photo-preview"),
};

// --- Init ---
async function init() {
  await initDB();
  await loadData();
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

  state.manufacturers = await getAll("manufacturers");

  // Initial sort by persistent rank (always load correct DB order)
  state.coasters.sort((a, b) => (a.rank || 0) - (b.rank || 0));
  state.parks.sort((a, b) => (a.rank || 0) - (b.rank || 0));
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
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.put(data);
    tx.oncomplete = () => resolve();
  });
}

// --- UI Logic ---
function renderApp() {
  // Header State
  if (state.isDeleteMode) {
    dom.trashBtn.textContent = "✔️"; // Click to confirm mass delete
    dom.trashBtn.style.background = "#ff4757";
    dom.title.textContent = `Borrar (${state.selectedItems.size})`;
    dom.filterBar.classList.add("hidden");
  } else {
    dom.trashBtn.textContent = "🗑️";
    dom.trashBtn.style.background = "rgba(255, 255, 255, 0.1)";

    if (state.view === "coasters") {
      dom.filterBar.classList.remove("hidden");
      dom.title.textContent = "Top Coasters";
    } else {
      dom.filterBar.classList.add("hidden");
      dom.title.textContent = "Top Parques";
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
  } else {
    // Assume already sorted by rank in state.coasters, but let's ensure
    displayList.sort((a, b) => (a.rank || 0) - (b.rank || 0));
  }

  if (displayList.length === 0) {
    dom.views.coasters.innerHTML = `<div class="empty-state"><p>Ranking Vacío</p></div>`;
    return;
  }

  let displayRank = 0; // Counter for displayed cards only

  displayList.forEach((coaster, index) => {
    const parkObj = state.parks.find((p) => p.name === coaster.park);
    // Use coaster's country if present (for "Otro" park), otherwise use park's country
    const country = coaster.country || (parkObj ? parkObj.country : null);

    if (state.filterPark && coaster.park !== state.filterPark) return;
    if (state.filterMfg && coaster.mfg !== state.filterMfg) return;
    if (state.filterCountry && country !== state.filterCountry) return;

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
                    <h3 class="${nameClass}">${coaster.name}</h3>
                    <div class="card-meta">
                        <span class="pill">${coaster.park}</span>
                        <span class="pill">${coaster.mfg}</span>
                        ${coaster.height ? `<span>${coaster.height}m</span>` : ""}
                    </div>
                </div>
            </div>
        `;
      card.onclick = () => editCoaster(coaster.id);

      // Enable Drag & Drop for reordering (only when no filters and in rank mode)
      if (
        state.sortBy === "rank" &&
        !state.filterPark &&
        !state.filterMfg &&
        !state.filterCountry
      ) {
        card.draggable = true;
        card.classList.add("draggable");
        card.dataset.dragIndex = index;

        card.ondragstart = (e) => {
          e.stopPropagation();
          card.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", index.toString());

          // Store drag state
          state.dragState = {
            fromIndex: index,
            currentHoverIndex: index,
            scrollInterval: null,
          };
        };

        card.ondragover = (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";

          const targetIndex = parseInt(card.dataset.dragIndex);

          // Update placeholder position if hovering over different card
          if (
            state.dragState &&
            state.dragState.currentHoverIndex !== targetIndex
          ) {
            updateDragPlaceholder(state.dragState.fromIndex, targetIndex);
            state.dragState.currentHoverIndex = targetIndex;
          }

          // Auto-scroll logic
          handleAutoScroll(e);
        };

        card.ondragleave = (e) => {
          // Don't remove on simple mouse movements
        };

        card.ondrop = async (e) => {
          e.preventDefault();
          e.stopPropagation();

          const fromIndex = parseInt(e.dataTransfer.getData("text/plain"));
          const toIndex = parseInt(card.dataset.dragIndex);

          if (fromIndex !== toIndex) {
            await handleDragDrop(fromIndex, toIndex);
          }

          cleanupDragState();
        };

        card.ondragend = (e) => {
          cleanupDragState();
        };
      }
    }
    dom.views.coasters.appendChild(card);
  });
}

function renderParkList() {
  dom.views.parks.innerHTML = "";

  if (state.parks.length === 0) {
    dom.views.parks.innerHTML = `<div class="empty-state"><p>No hay parques.</p></div>`;
    return;
  }

  state.parks.forEach((park, index) => {
    // Skip "Otro" in the parks list view
    if (park.name === "Otro") return;

    const isSelected = state.selectedItems.has(park.name);
    const card = document.createElement("div");
    card.className = `coaster-card ${state.isDeleteMode && isSelected ? "selected" : ""}`;
    card.style.height = "100px";

    let bgStyle = `<div class="card-bg-img" style="background: linear-gradient(45deg, #FF512F, #DD2476);"></div>`;
    const flag = park.country ? getFlag(park.country) : "";
    const flagHtml = flag ? `<span class="flag-pop">${flag}</span>` : "";

    if (state.isDeleteMode) {
      card.innerHTML = `
            ${bgStyle}
            <div class="selection-indicator ${isSelected ? "checked" : ""}">
                ${isSelected ? "✔" : ""}
            </div>
            <div class="card-content">
                <div class="card-info">
                  <h3>${park.name} ${flagHtml}</h3>
                  ${park.visitCount ? `<span class="visit-badge" style="margin-top: 5px;">🎟️ Nº Visitas: ${park.visitCount}</span>` : ""}
                </div>
            </div>
        `;
      card.onclick = () => toggleSelection(park.name);
    } else {
      let reorderControls = getReorderControls(index, state.parks.length);
      const rankClass = index + 1 <= 3 ? `rank-${index + 1}` : "";

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
                  <h3>
                    ${park.name} 
                  </h3>
                </div>
            </div>
        `;
      card.onclick = () => editPark(park.name);
    }

    dom.views.parks.appendChild(card);
  });
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

  if (!confirm(`¿Borrar ${state.selectedItems.size} elementos?`)) return;

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
  if (!confirm("¿Seguro que quieres borrarlo?")) return;

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
  dom.parkName.disabled = true; // Key cannot be changed easily

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
      state.editingCoaster = null; // Clear edit
      updateSelectOptions(); // Ensure up to date
    } else {
      dom.modalTitle.textContent = "Añadir Parque";
      dom.forms.park.classList.remove("hidden");
      dom.forms.park.reset();
      dom.parkName.disabled = false; // Reset
      state.editingPark = null; // Clear edit mode
      updateSelectOptions(); // Ensure country list is populated
    }
  });

  // Handle "New Mfg" select
  dom.inputs.mfg.addEventListener("change", (e) => {
    if (e.target.value === "new_mfg") {
      dom.forms.coaster.classList.add("hidden");
      dom.forms.mfg.classList.remove("hidden");
      dom.modalTitle.textContent = "Crear Manufacturadora";
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
    const photo = dom.photoPreview.dataset.tempSrc || null;
    const rankInput = document.getElementById("input-rank").value;
    const rideCount =
      parseInt(document.getElementById("input-ride-count").value) || 0;
    const coasterCountry =
      document.getElementById("coaster-country").value || null;

    let targetRank = rankInput ? parseInt(rankInput) : null;

    if (state.editingCoaster) {
      // Edit Mode
      const coaster = state.coasters.find((c) => c.id === state.editingCoaster);
      if (coaster) {
        coaster.name = name;
        coaster.height = height;
        coaster.park = park;
        coaster.mfg = mfg;
        coaster.rideCount = rideCount;
        coaster.country = coasterCountry;
        if (photo) coaster.photo = photo;

        await handleRankUpdate("coasters", coaster, targetRank);
      }
    } else {
      // Create Mode
      const newCoaster = {
        name,
        height,
        park,
        mfg,
        photo,
        rideCount,
        country: coasterCountry,
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
    const rankInput = document.getElementById("park-rank").value;
    let targetRank = rankInput ? parseInt(rankInput) : null;

    if (state.editingPark) {
      // Edit Mode
      const park = state.parks.find((p) => p.name === state.editingPark);
      if (park) {
        park.country = country;
        park.visitCount = visitCount;
        await handleRankUpdate("parks", park, targetRank);
      }
    } else {
      // Create Mode
      if (state.parks.find((p) => p.name === name)) {
        alert("¡El parque ya existe!");
        return;
      }
      const newPark = { name, country, visitCount };
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
      alert("¡Existe!");
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

  // Photo
  // Photo - Intercept for Cropper
  dom.inputs.file.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (file) {
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
  });

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
    dom.photoPreview.innerHTML = `<img src="${croppedDataUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`;
    dom.photoPreview.dataset.tempSrc = croppedDataUrl;

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

  if (importFile) {
    importFile.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const importedData = JSON.parse(e.target.result);

          if (
            !confirm(
              `Se importarán:\n- ${importedData.coasters?.length || 0} Coasters\n- ${importedData.parks?.length || 0} Parques\n\n¿Seguro? Esto fusionará/sobrescribirá datos.`,
            )
          ) {
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

          alert("¡Datos importados correctamente! 🚀");
          state.isDeleteMode = false; // Reset safe
          dataModal.classList.add("hidden");
          importFile.value = "";

          await loadData();
          renderApp();
        } catch (err) {
          alert("Error al leer el archivo JSON: " + err);
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
        '<p style="text-align: center; color: #999;">No hay manufacturadoras creadas.</p>';
      return;
    }

    state.manufacturers.forEach((mfg) => {
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
                `Esta manufacturadora está siendo usada por ${usageCount} coaster(s). ¿Seguro que quieres borrarla? Las coasters quedarán sin manufacturadora.`,
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

  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      settingsModal.classList.remove("hidden");
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
      dom.modalTitle.textContent = "Crear Manufacturadora";
      dom.mfgName.value = "";
      dom.mfgName.focus();
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
  document.getElementById("input-rank").value = coaster.rank;
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
  if (cVal && cSelect) cSelect.value = cVal;
}

async function handleRankUpdate(storeName, item, targetRank, isNew = false) {
  const list = storeName === "coasters" ? state.coasters : state.parks;
  // Ensure sorted
  list.sort((a, b) => (a.rank || 0) - (b.rank || 0));

  // If no target rank, or rank same as current (edit), simple save
  if (!targetRank || targetRank < 1) {
    if (isNew) {
      item.rank = list.length + 1;
    }
    await addData(storeName, item);
    return;
  }

  // Identify key
  const keyProp = storeName === "coasters" ? "id" : "name";

  // Find current position (if editing)
  const currentIndex = !isNew
    ? list.findIndex((i) => i[keyProp] === item[keyProp])
    : -1;
  const targetIndex = targetRank - 1;

  // OPTIMIZATION: Only update affected items
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);

  if (isNew) {
    // New item: shift down items from targetRank onwards
    item.rank = targetRank;
    store.put(item);

    // Only update items that need to shift down
    for (let i = targetIndex; i < list.length; i++) {
      if (list[i].rank >= targetRank) {
        list[i].rank++;
        store.put(list[i]);
      }
    }
  } else {
    // Editing existing: update item rank
    item.rank = targetRank;
    store.put(item);

    // Only update items between old and new position
    if (currentIndex !== -1 && currentIndex !== targetIndex) {
      const start = Math.min(currentIndex, targetIndex);
      const end = Math.max(currentIndex, targetIndex);

      for (let i = start; i <= end; i++) {
        if (i !== currentIndex) {
          const adjustedRank = i < targetIndex ? i + 1 : i + 2;
          if (list[i].rank !== adjustedRank) {
            list[i].rank = adjustedRank;
            store.put(list[i]);
          }
        }
      }
    }
  }

  await new Promise((r) => (tx.oncomplete = r));
}

// Global Drag & Drop Handler
async function handleDragDrop(fromIndex, toIndex) {
  const list = state.view === "coasters" ? state.coasters : state.parks;
  const storeName = state.view;

  // Remove item from old position
  const [movedItem] = list.splice(fromIndex, 1);

  // Insert at new position
  list.splice(toIndex, 0, movedItem);

  // Update ranks for affected items only
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);

  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);

  // Only update items between old and new position
  for (let i = start; i <= end; i++) {
    list[i].rank = i + 1;
    store.put(list[i]);
  }

  await new Promise((r) => (tx.oncomplete = r));
  renderApp();
}

// Spotify-style Drag & Drop Helpers
function updateDragPlaceholder(fromIndex, toIndex) {
  const cards = document.querySelectorAll(".coaster-card:not(.dragging)");

  cards.forEach((card, visualIndex) => {
    const cardIndex = parseInt(card.dataset.dragIndex);
    if (cardIndex === undefined) return;

    // Remove any existing placeholder classes
    card.classList.remove("drag-placeholder");
    card.style.transform = "";

    // Shift cards to make space for drop
    if (fromIndex < toIndex) {
      // Dragging down: shift cards up
      if (cardIndex > fromIndex && cardIndex <= toIndex) {
        card.style.transform = "translateY(-176px)"; // -(height + gap)
      }
    } else if (fromIndex > toIndex) {
      // Dragging up: shift cards down
      if (cardIndex >= toIndex && cardIndex < fromIndex) {
        card.style.transform = "translateY(176px)"; // height + gap
      }
    }
  });
}

function handleAutoScroll(e) {
  const container = document.querySelector(".content-area");
  if (!container) return;

  const scrollThreshold = 80; // Distance from edge to trigger scroll
  const scrollSpeed = 10;
  const rect = container.getBoundingClientRect();
  const mouseY = e.clientY;

  // Clear existing scroll interval
  if (state.dragState && state.dragState.scrollInterval) {
    clearInterval(state.dragState.scrollInterval);
    state.dragState.scrollInterval = null;
  }

  // Scroll up when dragging near top
  if (mouseY - rect.top < scrollThreshold) {
    state.dragState.scrollInterval = setInterval(() => {
      container.scrollTop -= scrollSpeed;
      if (container.scrollTop <= 0) {
        clearInterval(state.dragState.scrollInterval);
      }
    }, 16);
  }
  // Scroll down when dragging near bottom
  else if (rect.bottom - mouseY < scrollThreshold) {
    state.dragState.scrollInterval = setInterval(() => {
      container.scrollTop += scrollSpeed;
      const maxScroll = container.scrollHeight - container.clientHeight;
      if (container.scrollTop >= maxScroll) {
        clearInterval(state.dragState.scrollInterval);
      }
    }, 16);
  }
}

function cleanupDragState() {
  // Clear scroll interval
  if (state.dragState && state.dragState.scrollInterval) {
    clearInterval(state.dragState.scrollInterval);
  }

  // Remove all visual states
  document.querySelectorAll(".coaster-card").forEach((card) => {
    card.classList.remove("dragging", "drag-over", "drag-placeholder");
    card.style.transform = "";
  });

  state.dragState = null;
}

// Global Stepper Helper
window.updateStepper = (inputId, change) => {
  const input = document.getElementById(inputId);
  let val = parseInt(input.value) || 0;
  val += change;
  if (val < 0) val = 0;
  input.value = val;
};
