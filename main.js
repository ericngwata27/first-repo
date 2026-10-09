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

// Load everything once, update old data, then draw the page.
async function startApp() {
  await loadState();
  upgradeOldData();
  showEverything();
}

// Other files (timeline.js) wait for this before drawing: appReady.then(...)
const appReady = startApp();
