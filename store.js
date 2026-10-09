// =========================================================
// MY FUTURE PLANNER: store.js
// Your saved data: one in-memory `state`, loadState() and save().
//
// Sections: 1. Saving and loading
// (The site's JavaScript is split into files that load in this order:
//  store.js, helpers.js, dates.js, globe.js, autofill.js, universities.js,
//  profile.js, main.js, timeline.js. The section numbers run across all of them.)
//
// BACKEND: this is the only file that talks to storage. Swap
// loadState() and save() for server requests and nothing else changes.
// =========================================================

// =========================================================
// 1. SAVING AND LOADING
//
// All your data lives in one object, `state`, in memory.
//   - loadState() fills it ONCE when the page opens.
//   - save("part") writes one part of it back. It's the ONLY place
//     anything is written.
// The rest of the site just reads and changes `state`, then calls save().
//
// Right now loadState() and save() use localStorage, a small storage space
// in your browser that keeps data after you close the page.
//
// BACKEND: when your server is ready, only loadState() and save() change:
// loadState() fetches everything from the server, and save() sends the
// changed part. (loadState is already "async" for that reason.)
// See DATA_MODEL.md for every field.
// =========================================================

// The names everything is saved under in the browser, in one place
const STORAGE_KEYS = {
  universities: "future-planner-universities",
  timeline: "future-planner-timeline",
  timelineVersion: "future-planner-timeline-version",   // which one-time data updates have run
  searchCache: "future-planner-search-cache",
  apiKey: "future-planner-claude-key",
  academicProfile: "future-planner-academic-profile",   // start date, grade, school system, country
  globeSettings: "future-planner-globe-settings",       // the globe's on/off switches
  homePlace: "future-planner-home-place",               // where your home country is on the globe
  profilePrefix: "future-planner-profile-",             // + "personal", "statement", ...
};

// The Profile tab's text boxes (one saved text each)
const PROFILE_KEYS = ["personal", "achievements", "statement", "notes", "snippets"];

// Everything the site knows, in memory
const state = {
  universities: [],      // list of universities (DATA_MODEL.md section 1)
  timeline: {},          // timeline entry per university id (section 3)
  profile: {},           // profile texts, e.g. { personal: "...", statement: "..." } (section 5)
  academicProfile: {},   // start date, grade, school system, country (section 6)
  settings: {
    globe: {},           // the globe's switches
    homePlace: null,     // where your home country is on the globe
    apiKey: "",          // your Claude API key (never exported)
  },
  searchCache: {},       // remembered auto-fill searches
  meta: { timelineVersion: 0 },
};

// Reading and writing the browser's storage. Only loadState() and save() use it.
const DataStore = {
  // Read data saved as JSON (lists and objects). Returns `fallback` if
  // nothing is saved, or if the browser blocks storage (private mode).
  read: function (key, fallback) {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : fallback;
    } catch (error) {
      return fallback;
    }
  },

  // Save data as JSON. Returns true if it worked.
  write: function (key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false; // storage full or blocked
    }
  },

  // Read and save plain text (profile notes and the API key)
  readText: function (key) {
    try {
      return localStorage.getItem(key) || "";
    } catch (error) {
      return "";
    }
  },

  writeText: function (key, text) {
    try {
      if (text) localStorage.setItem(key, text);
      else localStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  },
};

// False until loadState() has finished. Until then save() refuses to
// write, so a failed load can never overwrite your real data with nothing.
let dataLoaded = false;

// Fill `state` from storage. Runs once, when the page opens.
// (With a backend this can fail; startApp in main.js shows an error then.)
async function loadState() {
  state.universities = DataStore.read(STORAGE_KEYS.universities, []);
  state.timeline = DataStore.read(STORAGE_KEYS.timeline, {});
  state.academicProfile = DataStore.read(STORAGE_KEYS.academicProfile, {});
  state.settings.globe = DataStore.read(STORAGE_KEYS.globeSettings, {});
  state.settings.homePlace = DataStore.read(STORAGE_KEYS.homePlace, null);
  state.settings.apiKey = DataStore.readText(STORAGE_KEYS.apiKey);
  state.searchCache = DataStore.read(STORAGE_KEYS.searchCache, {});
  state.meta.timelineVersion = DataStore.read(STORAGE_KEYS.timelineVersion, 0);
  state.profile = {};
  PROFILE_KEYS.forEach(function (key) {
    state.profile[key] = DataStore.readText(STORAGE_KEYS.profilePrefix + key);
  });
  dataLoaded = true;
}

// How each part of `state` is written to storage
const SAVERS = {
  universities: function () { return DataStore.write(STORAGE_KEYS.universities, state.universities); },
  timeline: function () { return DataStore.write(STORAGE_KEYS.timeline, state.timeline); },
  academicProfile: function () { return DataStore.write(STORAGE_KEYS.academicProfile, state.academicProfile); },
  globeSettings: function () { return DataStore.write(STORAGE_KEYS.globeSettings, state.settings.globe); },
  homePlace: function () { return DataStore.write(STORAGE_KEYS.homePlace, state.settings.homePlace); },
  apiKey: function () { return DataStore.writeText(STORAGE_KEYS.apiKey, state.settings.apiKey); },
  searchCache: function () { return DataStore.write(STORAGE_KEYS.searchCache, state.searchCache); },
  meta: function () { return DataStore.write(STORAGE_KEYS.timelineVersion, state.meta.timelineVersion); },
  profile: function () {
    return PROFILE_KEYS.every(function (key) {
      return DataStore.writeText(STORAGE_KEYS.profilePrefix + key, state.profile[key] || "");
    });
  },
};

// Save one part of `state` (e.g. save("universities")).
// Returns true if it worked. Either way it tells the page, with a
// "data-saved" or "data-save-failed" event, so the page can show it.
function save(part) {
  const ok = dataLoaded && SAVERS[part]();
  document.dispatchEvent(new CustomEvent(ok ? "data-saved" : "data-save-failed", { detail: part }));
  return ok;
}

// Save the universities and tell other pages (like the Timeline) they changed
function saveUniversities() {
  save("universities");
  document.dispatchEvent(new CustomEvent("universities-changed"));
}

// A university looks like this (all fields: DATA_MODEL.md section 1):
// {
//   id: "3b241101-e2bb-4255-...",       a unique ID (see newId)
//   name: "University of Edinburgh",
//   course: "BSc Computer Science",
//   city: "Edinburgh",
//   country: "United Kingdom",
//   deadline: "2027-01-15",             year-month-day, or "" if not set
//   requirements: "AAA at A-level",
//   applicationInfo: "Apply through UCAS",
//   applicationDates: [                 every date auto-fill found (autofill.js)
//     { label: "Round 1", campus: "Paris", date: "2026-11-18", type: "deadline", sourceUrl: "https://..." }
//   ],
//   rolling: false,                     true if the university uses rolling admissions
//   pros: "Beautiful city\nStrong CS department",
//   cons: "Cold winters",
//   lat: 55.94, lng: -3.18              where the pin goes on the globe
// }
