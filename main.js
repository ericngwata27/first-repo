// =========================================================
// MY FUTURE PLANNER: main.js
// Starts the app: load the data, update old data, draw every page.
//
// Sections: 15. Start the app
// (The site's JavaScript is split into files that load in this order:
//  store.js, helpers.js, dates.js, globe.js, autofill.js, universities.js,
//  profile.js, main.js, timeline.js. The section numbers run across all of them.)
// =========================================================

// =========================================================
// 15. START THE APP
// =========================================================

document.getElementById("year").textContent = new Date().getFullYear();

// ----- Updating data saved by older versions -----
// Everything that turns old saved data into today's format is called
// from here, so it's easy to find and, one day, delete.
//
// RETIRING IT: an exported file is always in today's format. Once you
// (and anyone else using the planner) have exported and re-imported, or
// moved to the backend, nothing old is left and these can go:
//   - the number-to-text ID fix below
//   - migrateUniversity (autofill.js, section 7)
//   - TimelineStore.migrate and markExistingGenerated (dates.js, section 3b)
// Keep upgradeOldData() itself as an empty function until then.
function upgradeOldData() {
  // IDs are text. (Universities saved before had numbers: keep the same
  // value, as text, so their Timeline data and calendar events still match.)
  let idsChanged = false;
  state.universities.forEach(function (uni) {
    if (typeof uni.id !== "string") {
      uni.id = String(uni.id);
      idsChanged = true;
    }
  });
  // Old round-based universities become application dates
  if (state.universities.map(migrateUniversity).some(Boolean) || idsChanged) {
    save("universities");
  }
  TimelineStore.migrate();   // the same for timeline entries saved by the old planner
  TimelineStore.markExistingGenerated(state.universities.map(function (uni) { return uni.id; }));
}

// Fill in every part of the page from `state`
function showEverything() {
  updateAiState();        // show whether AI search is on
  showAcademicProfile();  // fill in your academic profile
  showProfileTexts();     // and your profile texts
  showGlobeSettings();    // tick the globe's switches
  applyGlobeSettings();
  redrawEverything();
  zoomToAllPins();
}

// ----- Loading, saved, and "couldn't save" -----
// The little status in the header. save() (store.js) sends a
// "data-saved" or "data-save-failed" event after every change.

const saveStatus = document.getElementById("save-status");
const saveStatusText = document.getElementById("save-status-text");
const failedParts = new Set();   // parts whose last save didn't work
let warnedAboutSaving = false;

// kind: "loading", "saved" or "error"
function setSaveStatus(kind, text) {
  saveStatus.dataset.state = kind;
  saveStatusText.textContent = text;
}

// Caches (remembered searches, your home's map position) don't count:
// if they aren't saved, nothing of yours is lost
const CACHE_PARTS = ["searchCache", "homePlace"];

document.addEventListener("data-saved", function (event) {
  failedParts.delete(event.detail);
  if (failedParts.size === 0) setSaveStatus("saved", "Saved");
});

document.addEventListener("data-save-failed", function (event) {
  if (!dataLoaded || CACHE_PARTS.includes(event.detail)) return;
  failedParts.add(event.detail);
  setSaveStatus("error", "Not saved");
  // Explain once; the header keeps showing "Not saved" until saving works again
  if (!warnedAboutSaving) {
    warnedAboutSaving = true;
    showToast("Your browser didn't save that change (storage is full or blocked). " +
      "Use Export my data on the Profile tab to keep a copy.", "circle-alert");
  }
});

document.getElementById("retry-load").addEventListener("click", function () {
  location.reload();
});


// ----- Starting -----

// Load everything once, update old data, then draw the page.
// Returns true if it worked, false if the data couldn't be loaded.
async function startApp() {
  try {
    await loadState();
  } catch (error) {
    setSaveStatus("error", "Couldn't load");
    document.getElementById("load-error").hidden = false;
    document.body.classList.remove("is-loading");
    return false;
  }
  upgradeOldData();
  showEverything();
  setSaveStatus("saved", "Saved");
  document.body.classList.remove("is-loading");
  return true;
}

// Other files (timeline.js) wait for this before drawing:
// appReady.then(function (loaded) { ... })
const appReady = startApp();
