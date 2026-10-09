// =========================================================
// MY FUTURE PLANNER
// This file makes the page interactive. It's split into
// numbered sections so you can find things easily:
//
//   1. Saving and loading
//   2. Small helpers
//   3. Deadlines (how close, which color)
//  3b. Your dates (the timeline data every page shares, and getMyDate)
//   4. Tabs
//   5. The 3D globe
//   6. Finding a location's coordinates
//   7. Auto-fill: searching online
//   8. The form (with validation and auto-fill)
//   9. The university list
//  10. The details panel
//  11. Summary stats
//  12. Toasts (pop-up messages)
//  13. The Profile tab
//  14. Start the app
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

// Fill `state` from storage. Runs once, when the page opens.
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
  const ok = SAVERS[part]();
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
//   applicationDates: [                 every date auto-fill found (see section 7)
//     { label: "Round 1", campus: "Paris", date: "2026-11-18", type: "deadline", sourceUrl: "https://..." }
//   ],
//   rolling: false,                     true if the university uses rolling admissions
//   pros: "Beautiful city\nStrong CS department",
//   cons: "Cold winters",
//   lat: 55.94, lng: -3.18              where the pin goes on the globe
// }

let selectedId = null;  // the university shown in the details panel
let editingId = null;   // the university being edited in the form
let newestId = null;    // the one just added (so its card can animate in)


// =========================================================
// 2. SMALL HELPERS
// =========================================================

// Create an element, optionally with a class and some text.
// Using textContent means anything you typed is always shown
// as plain text, never run as code.
function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

// Create an icon. The Lucide library turns <i data-lucide="name">
// into a drawing when we call refreshIcons().
function makeIcon(name) {
  const icon = document.createElement("i");
  icon.setAttribute("data-lucide", name);
  return icon;
}

function refreshIcons() {
  if (window.lucide) {
    lucide.createIcons();
  }
}

// A new unique ID, e.g. "3b241101-e2bb-4255-8caf-4136c566a962".
// Safe to use on every device (unlike the time-based numbers used before).
function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  // Older browsers: build one from random numbers
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
}

function findUniversity(id) {
  return state.universities.find(function (uni) {
    return uni.id === id;
  });
}


// =========================================================
// 3. DEADLINES
// Works out how many days are left and picks a color level:
//   "later"  = green  (45+ days)
//   "soon"   = amber  (15 to 44 days)
//   "urgent" = red    (under 15 days)
//   "none"   = gray   (no date, or already passed)
// =========================================================

// Turn "2027-01-15" into a date. We split it ourselves so the
// date doesn't shift because of time zones.
function parseDate(text) {
  const parts = text.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function daysUntil(dateText) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round((parseDate(dateText) - today) / millisecondsPerDay);
}

// Show a date in a friendly way, e.g. "15 Jan 2027"
function formatDate(dateText) {
  return parseDate(dateText).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getDeadlineStatus(dateText) {
  if (!dateText) {
    return { level: "none", label: "No deadline" };
  }

  const days = daysUntil(dateText);

  if (days < 0) return { level: "none", label: "Closed", days: days };
  if (days === 0) return { level: "urgent", label: "Due today", days: days };

  const label = days === 1 ? "1 day left" : days + " days left";
  if (days < 15) return { level: "urgent", label: label, days: days };
  if (days < 45) return { level: "soon", label: label, days: days };
  return { level: "later", label: label, days: days };
}

// Soonest date first (your date, see getMyDate); universities without one go last
function sortByDeadline(list) {
  const dates = {};
  list.forEach(function (uni) { dates[uni.id] = getMyDate(uni).date; });
  return list.slice().sort(function (a, b) {
    if (!dates[a.id]) return dates[b.id] ? 1 : 0;
    if (!dates[b.id]) return -1;
    return dates[a.id] < dates[b.id] ? -1 : dates[a.id] > dates[b.id] ? 1 : 0;
  });
}


// =========================================================
// 3b. YOUR DATES (shared by every page)
// The Timeline tab saves your planned date, the deadline you chose
// and dates you added. This section reads them, so the map, the
// university list and the Timeline all show the same date:
// getMyDate(uni) is the one place that decides which date that is.
// =========================================================

// The steps of an application.
//   daysBefore: ideally done this many days before your planned date
const MILESTONES = [
  { key: "testsBooked",         label: "Tests booked",               daysBefore: 56 },
  { key: "statementDrafted",    label: "Personal statement drafted", daysBefore: 42 },
  { key: "referencesRequested", label: "References requested",       daysBefore: 42 },
  { key: "statementFinal",      label: "Personal statement final",   daysBefore: 14 },
  { key: "referencesReceived",  label: "References received",        daysBefore: 10 },
  { key: "formFilled",          label: "Online application filled",  daysBefore: 7 },
  { key: "finalReview",         label: "Final review",               daysBefore: 3 },
  { key: "submission",          label: "Submission day",             daysBefore: 0 },
];

// ----- Saving and loading timeline data -----
// Timeline data is saved separately from the universities, one entry
// per university (found by the university's id). One entry looks like this:
// {
//   plannedDate: "2026-11-10",     your planned submission date, or ""
//   status: "applying",            one of the STATUSES keys
//   targetId: "deadline|paris|round 1|2026-11-18",
//                                  the deadline you chose, or "" for none
//   generated: true,               true once you've clicked Generate Timeline
//                                  (until then, auto-fill's dates aren't shown)
//   manualDates: [                 dates you added yourself
//     { id: "3b241101-e2bb-...", label: "Scholarship", campus: "", date: "2027-01-10", type: "deadline" }
//   ],
//   removedDates: ["opens||applications open|2026-09-01"],
//                                  ids of found dates you deleted
//   milestones: {
//     statementDrafted: { done: true, date: "2026-10-01", auto: false },
//     ...one for every milestone. auto = true if the date was counted back
//     from your planned date, so it moves when you move that date.
//     Dates you type yourself are never moved.
//   },
//   updatedAt: 1791500000000       when it was last changed
// }
//
// BACKEND: this matches an "applications" table with a university_id
// column (manualDates can be its own "application_dates" table).
// Replace the insides of TimelineStore with fetch() calls.

// Timeline entries live in state.timeline (section 1); this reads and
// changes them, and saves through save("timeline").
const TimelineStore = {
  readAll: function () {
    return state.timeline;
  },

  // Get one university's entry, with every field filled in
  // (so the rest of the code never has to check for missing parts)
  get: function (uniId) {
    const saved = TimelineStore.readAll()[uniId] || {};
    const savedMilestones = saved.milestones || {};

    const milestones = {};
    MILESTONES.forEach(function (milestone) {
      const old = savedMilestones[milestone.key] || {};
      milestones[milestone.key] = { done: Boolean(old.done), date: isDateText(old.date) ? old.date : "", auto: Boolean(old.auto) };
    });

    return {
      plannedDate: isDateText(saved.plannedDate) ? saved.plannedDate : "",
      status: saved.status || "researching",
      targetId: typeof saved.targetId === "string" ? saved.targetId : "",
      generated: saved.generated === true,   // true once you've clicked Generate Timeline
      // Copies, so changes only count once they're saved
      manualDates: Array.isArray(saved.manualDates) ? saved.manualDates.slice() : [],
      removedDates: Array.isArray(saved.removedDates) ? saved.removedDates.slice() : [],
      milestones: milestones,
      updatedAt: saved.updatedAt || null,
    };
  },

  save: function (uniId, entry) {
    entry.updatedAt = Date.now();
    state.timeline[uniId] = entry;
    save("timeline");
  },

  // Remove entries for universities that have been deleted
  removeMissing: function (existingIds) {
    const all = TimelineStore.readAll();
    let changed = false;
    Object.keys(all).forEach(function (id) {
      if (existingIds.indexOf(String(id)) === -1) {
        delete all[id];
        changed = true;
      }
    });
    if (changed) save("timeline");
  },

  // Entries saved by the old planner had a recommended plan in them.
  // Keep your status, milestones and any planned date you typed;
  // drop the planner's own choices (target round, campus, dates it picked).
  // Rounds you added yourself become dates you added yourself.
  migrate: function () {
    const all = TimelineStore.readAll();
    let changed = false;

    Object.keys(all).forEach(function (id) {
      const old = all[id] || {};
      const isOld = ["plannedAuto", "targetRound", "campus", "manualRounds"].some(function (key) { return key in old; });
      if (!isOld) return;

      const milestones = old.milestones || {};
      if (old.plannedAuto) {
        // The planner chose that date, not you: forget it and the
        // milestone dates it counted back from it
        Object.keys(milestones).forEach(function (key) {
          if (milestones[key] && milestones[key].auto) milestones[key].date = "";
        });
      }

      all[id] = {
        plannedDate: old.plannedAuto ? "" : old.plannedDate || "",
        status: old.status || "researching",
        targetId: "",
        generated: true,
        manualDates: (Array.isArray(old.manualRounds) ? old.manualRounds : []).map(function (round, index) {
          const item = cleanDateItem({ label: round.label, date: round.date, type: "deadline" });
          if (item) item.id = round.key || "m" + index;
          return item;
        }).filter(Boolean),
        removedDates: [],
        milestones: milestones,
        updatedAt: old.updatedAt || null,
      };
      changed = true;
    });

    if (changed) save("timeline");
  },

  // The Timeline used to show auto-fill's dates straight away. Now you
  // click "Generate Timeline" first. Universities you added before that
  // change keep their timelines: this marks them as generated, once.
  markExistingGenerated: function (uniIds) {
    if (state.meta.timelineVersion >= 2) return;
    const all = TimelineStore.readAll();
    uniIds.forEach(function (id) {
      all[id] = all[id] || {};
      if (!("generated" in all[id])) all[id].generated = true;
    });
    state.meta.timelineVersion = 2;
    save("timeline");
    save("meta");
  },
};


// ----- Date helpers -----
// Dates are kept as "YYYY-MM-DD" text. Text dates in this format
// can be compared directly ("2026-11-01" < "2026-12-01").

// A date -> "2026-10-08"
function toDateText(date) {
  return date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0");
}

function todayText() {
  return toDateText(new Date());
}

function isDateText(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

// A date that has gone completely (a month counts as gone once it's over)
function isPastItem(item) {
  return itemEndDate(item) < todayText();
}

// ----- The dates for one university -----
// The deadline from the Universities tab and the dates you added, plus
// (once you've clicked Generate Timeline) every date auto-fill found.
// Dates you deleted are left out.
// Each one gets an id so it can be chosen or deleted.

function autoDateId(item) {
  return [item.type, item.campus, item.label, item.date].join("|").toLowerCase();
}

function cardDates(uni, entry) {
  const dates = [];
  // Before you click Generate Timeline, only your own dates are used
  const found = entry.generated ? uni.applicationDates || [] : [];

  found.forEach(function (raw) {
    const item = cleanDateItem(raw);
    if (!item) return;
    item.id = autoDateId(item);
    if (!dates.some(function (d) { return d.id === item.id; })) dates.push(item);
  });

  // The deadline on the Universities tab, if it isn't in the list already.
  // It's yours (you can type it in the form), so it always counts, even
  // before you click Generate Timeline.
  if (isDateText(uni.deadline) && !dates.some(function (d) { return d.type === "deadline" && d.date === uni.deadline; })) {
    dates.push({ id: "official", label: "Application deadline", campus: "", date: uni.deadline,
      type: "deadline", sourceUrl: (uni.sources && uni.sources[0]) || "", approximate: false });
  }

  entry.manualDates.forEach(function (raw) {
    const item = cleanDateItem(raw);
    if (!item) return;
    item.id = raw.id;
    item.manual = true;
    dates.push(item);
  });

  return sortDateItems(dates.filter(function (item) {
    return entry.removedDates.indexOf(item.id) === -1;
  }));
}

// The deadline you chose, or null
function findTarget(dates, entry) {
  return dates.find(function (item) { return item.id === entry.targetId && item.type === "deadline"; }) || null;
}


// ----- Your date: the one date every page shows -----
// In this order:
//   1. your planned submission date (slider or date box)  -> "Planned"
//   2. the deadline you chose on the Timeline              -> "Deadline"
//   3. the next upcoming deadline auto-fill found          -> "Next deadline"
//   4. nothing                                             -> "No date yet"
// Returns {
//   kind: "planned" | "deadline" | "next" | "none",
//   label: "Planned",
//   date: "2026-11-02"        (for counting days and sorting; "" if none)
//   dateText: "2 Nov 2026"    (how to show it; months say "approx.")
//   deadline: the hard limit to show underneath (your chosen deadline,
//             otherwise the next one), or null
// }
function getMyDate(uni) {
  const entry = TimelineStore.get(uni.id);
  const dates = cardDates(uni, entry);
  const target = findTarget(dates, entry);
  const next = dates.find(function (item) { return item.type === "deadline" && !isPastItem(item); }) || null;
  const deadline = target || next;

  if (entry.plannedDate) {
    return { kind: "planned", label: "Planned", date: entry.plannedDate, dateText: formatDate(entry.plannedDate), deadline: deadline };
  }
  if (deadline) {
    return { kind: target ? "deadline" : "next", label: target ? "Deadline" : "Next deadline",
      date: itemEndDate(deadline), dateText: itemDateText(deadline), deadline: deadline };
  }
  return { kind: "none", label: "No date yet", date: "", dateText: "", deadline: null };
}

// Days left and a color level for your date (like getDeadlineStatus).
// A planned date that has passed is "Overdue"; a deadline that has passed is "Closed".
function getMyDateStatus(myDate) {
  if (!myDate.date) return { level: "none", label: "No date yet" };
  const status = getDeadlineStatus(myDate.date);
  if (status.days < 0 && myDate.kind === "planned") return { level: "urgent", label: "Overdue", days: status.days };
  return status;
}

function makeMyDateChip(myDate) {
  const status = getMyDateStatus(myDate);
  return makeElement("span", "chip level-" + status.level, status.label);
}

// The two lines of text for your date, e.g.
//   main: "Planned · 2 Nov 2026"
//   sub:  "Deadline: Paris · Round 1 · 18 Nov 2026"
// For a deadline, sub says which one it is ("Paris · Round 1").
function describeMyDate(myDate) {
  if (myDate.kind === "none") return { main: "", sub: "" };   // the chip already says "No date yet"
  const main = myDate.label + " · " + myDate.dateText;
  if (myDate.kind === "planned") {
    return { main: main, sub: myDate.deadline ? "Deadline: " + itemText(myDate.deadline) : "" };
  }
  const item = myDate.deadline;
  return { main: main, sub: [item.campus, item.label].filter(Boolean).join(" · ") };
}


// =========================================================
// 4. TABS
// =========================================================

const tabButtons = document.querySelectorAll(".tab");

tabButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    // Highlight only the clicked tab (aria-selected tells screen readers)
    tabButtons.forEach(function (b) {
      b.classList.remove("is-active");
      b.setAttribute("aria-selected", "false");
    });
    button.classList.add("is-active");
    button.setAttribute("aria-selected", "true");

    // Hide every section, then show the one this tab points to
    document.querySelectorAll(".tab-content").forEach(function (section) {
      section.hidden = true;
    });
    document.getElementById(button.dataset.tab).hidden = false;

    // Pause the globe while its tab is hidden (saves battery), and resume it after
    if (globe) {
      if (button.dataset.tab === "universities-tab") globe.resumeAnimation();
      else globe.pauseAnimation();
    }

    // Let other pages know which tab opened (the Timeline refreshes itself)
    document.dispatchEvent(new CustomEvent("tab-opened", { detail: button.dataset.tab }));

    // Coming back to the Universities tab: redraw the list and pins, so they
    // show any date you changed on the Timeline (see getMyDate)
    if (button.dataset.tab === "universities-tab") redrawEverything();
  });
});


// =========================================================
// 5. THE 3D GLOBE (using the Globe.gl library)
//
// A dark, minimal, slowly spinning globe with glowing dots for your
// universities. The night side shows city lights, the side where the sun
// is up right now is gently lifted, with a soft line between them, a faint
// ocean shine and a blue glow around the edge (see "The Earth's look" below).
// Dot colors (same as the legend):
//   gold = your first choice (star it on its details card)
//   red  = your date is under 15 days away, or overdue (see getMyDate)
//   blue = everything else
// Click a dot to fly to it and open its details card.
//
// The gear button opens the settings (saved in this browser):
//   Spin, Borders, Arcs from home, Glow
// =========================================================

let globe = null;

// Where the globe pictures and country shapes come from (exact versions,
// so an update to the libraries can't change the site by surprise)
const GLOBE_FILES = {
  // NASA pictures, 4096 x 2048 pixels: they load quickly, so the globe appears fast
  night: "https://unpkg.com/three-globe@2.45.2/example/img/earth-night.jpg",
  day: "https://unpkg.com/three-globe@2.45.2/example/img/earth-blue-marble.jpg",
  water: "https://unpkg.com/three-globe@2.45.2/example/img/earth-water.png",   // white = ocean (for the shine)
  bumps: "https://unpkg.com/three-globe@2.45.2/example/img/earth-topology.png",
  // Sharper 8192 x 4096 versions, kept in this website's "textures" folder.
  // When they're there, they replace the 4K ones once downloaded.
  // If they're missing, the 4K ones simply stay.
  day8k: "textures/earth-day-8k.jpg",
  night8k: "textures/earth-night-8k.jpg",
  borders: "https://unpkg.com/globe.gl@2.46.2/example/datasets/ne_110m_admin_0_countries.geojson",
};

// How close you can zoom in, as a height above the globe (1 = one globe
// radius). The pictures only have so much detail, so we stop before they blur.
const ZOOM_LIMITS = {
  standard: 0.9,   // with the 4K pictures
  sharp: 0.5,      // with the 8K pictures
};
let globeIsSharp = false;   // true once the 8K pictures are showing
const GLOBE_RADIUS = 100;   // Globe.gl's globe is 100 units wide (from the center)

// How high the camera stops when it flies to a university: close enough
// to see the country, far enough that it stays sharp
function focusAltitude() {
  return globeIsSharp ? 0.8 : 1.15;
}

const PIN_COLORS = {
  firstChoice: "#f5c542",   // gold
  urgent: "#f3646b",        // red (same red as the rest of the site)
  normal: "#38bdf8",        // bright blue
};

// People who ask their device for less motion get a still globe by default
const PREFERS_LESS_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The globe's settings. Missing ones get these defaults.
function getGlobeSettings() {
  const saved = state.settings.globe;
  return {
    spin: typeof saved.spin === "boolean" ? saved.spin : !PREFERS_LESS_MOTION,
    borders: saved.borders === true,
    arcs: saved.arcs === true,
    glow: saved.glow === true,               // cinematic bloom: off unless you turn it on (it's heavy on phones)
  };
}

// Letters like < and & must be escaped before going into HTML
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
  });
}

// A university -> one dot on the globe. Universities without a
// map position are skipped.
function toGlobePoint(uni) {
  if (!Number.isFinite(uni.lat) || !Number.isFinite(uni.lng)) return null;
  const myDate = getMyDate(uni);
  return {
    id: uni.id,
    name: uni.name,
    lat: uni.lat,
    lng: uni.lng,
    isFirstChoice: Boolean(uni.firstChoice),
    isUrgent: getMyDateStatus(myDate).level === "urgent",
    isSelected: uni.id === selectedId,
    myDate: describeMyDate(myDate),
    place: uni.city + ", " + uni.country,
  };
}

function pinColor(point) {
  if (point.isFirstChoice) return PIN_COLORS.firstChoice;
  if (point.isUrgent) return PIN_COLORS.urgent;
  return PIN_COLORS.normal;
}

// One glowing dot. It's a normal web button, so it stays sharp at any
// zoom, glows and pulses with CSS (style.css section 6), and opens the
// details card when clicked. Its label shows on hover, and always when selected.
function makeGlobePin(point) {
  const pin = document.createElement("button");
  pin.type = "button";
  pin.className = "globe-pin" + (point.isSelected ? " is-selected" : "");
  pin.style.setProperty("--pin-color", pinColor(point));
  pin.setAttribute("aria-label", point.name + ", " + point.place + ". " + (point.myDate.main || "No date yet"));
  pin.innerHTML =
    '<span class="globe-pin-pulse"></span><span class="globe-pin-core"></span>' +
    '<span class="globe-pin-label">' +
      "<strong>" + (point.isFirstChoice ? "&#9733; " : "") + escapeHtml(point.name) + "</strong>" +
      "<span>" + escapeHtml(point.myDate.main || point.place) + "</span>" +
      (point.myDate.sub ? "<span>" + escapeHtml(point.myDate.sub) + "</span>" : "") +
    "</span>";
  pin.addEventListener("click", function (event) {
    event.stopPropagation();
    globe.pointOfView({ lat: point.lat, lng: point.lng, altitude: focusAltitude() }, 1500);
    selectUniversity(point.id, false);       // opens the same details card as before
  });
  return pin;
}

const globeBox = document.getElementById("globe");

// Show a message in the globe's place (no internet, or no 3D support)
function showGlobeMessage(text) {
  globeBox.append(makeElement("p", "muted globe-message", text));
}

if (typeof Globe === "undefined") {
  // Globe.gl loads from the internet. If you're offline, show a message instead.
  showGlobeMessage("The globe needs an internet connection to load.");
} else {
  try {
    globe = Globe({ animateIn: true })(globeBox)
      .backgroundColor("rgba(0,0,0,0)")          // no starfield: the dark gradient behind shows through
      .globeImageUrl(GLOBE_FILES.night)          // shown until the day/night look below is ready
      .bumpImageUrl(GLOBE_FILES.bumps)
      .showAtmosphere(true)
      .atmosphereColor("#3a8bff")
      .atmosphereAltitude(0.14)                  // a thin, crisp halo (the edge glow does the rest)
      .onGlobeReady(function () { globeBox.classList.add("is-ready"); })   // fade in
      // The glowing dots
      .htmlElementsData([])
      .htmlLat("lat")
      .htmlLng("lng")
      .htmlAltitude(0.01)
      .htmlElement(makeGlobePin)
      .htmlTransitionDuration(0)
      // Soft rings spreading out from the selected university
      .ringColor(function (point) {
        const color = pinColor(point);
        return function (t) { return color + Math.round((1 - t) * 200).toString(16).padStart(2, "0"); };
      })
      .ringMaxRadius(4)
      .ringPropagationSpeed(1.5)
      .ringRepeatPeriod(1400)
      .ringAltitude(0.005)
      // Arcs from your home country
      .arcColor(function () { return ["rgba(56, 189, 248, 0.15)", "rgba(56, 189, 248, 0.9)"]; })
      .arcStroke(0.35)
      .arcAltitudeAutoScale(0.35)
      .arcDashLength(0.5)
      .arcDashGap(0.25)
      .arcDashAnimateTime(4000)
      // Country borders (only drawn when the setting is on)
      .polygonCapColor(function () { return "rgba(0, 0, 0, 0)"; })
      .polygonSideColor(function () { return "rgba(0, 0, 0, 0)"; })
      .polygonStrokeColor(function () { return "rgba(147, 166, 255, 0.35)"; })
      .polygonAltitude(0.003);

    // Smooth, slow movement
    const controls = globe.controls();
    controls.autoRotateSpeed = 0.2;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lighting: a soft fill light plus a "sun" from the top left, for depth
    globe.lights().forEach(function (light) {
      if (light.isAmbientLight) light.intensity = 1.1;
      if (light.isDirectionalLight) {
        light.intensity = 2.4;
        light.position.set(-1, 1, 1.2);
      }
    });
    const material = globe.globeMaterial();
    material.bumpScale = 6;
    material.shininess = 12;

    // Sharp on retina screens, but not more than needed (saves battery)
    globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    setZoomLimit();
    globe.pointOfView({ lat: 30, lng: 10, altitude: 2.3 });

    // Fade in even if the "ready" signal never comes (for example a slow picture)
    setTimeout(function () { globeBox.classList.add("is-ready"); }, 4000);
  } catch (error) {
    // Happens on devices that can't draw 3D graphics (no WebGL)
    globe = null;
    globeBox.innerHTML = "";
    showGlobeMessage("Your browser can't show the 3D globe. Your universities are still in the list below.");
  }
}

// Keep the globe the same size as its box (window resizes, phones turning)
if (globe && "ResizeObserver" in window) {
  new ResizeObserver(function () {
    if (globeBox.clientWidth > 0) globe.width(globeBox.clientWidth).height(globeBox.clientHeight);
  }).observe(globeBox);
}

// ----- Zoom limit -----
function setZoomLimit() {
  if (!globe) return;
  const limit = globeIsSharp ? ZOOM_LIMITS.sharp : ZOOM_LIMITS.standard;
  globe.controls().minDistance = GLOBE_RADIUS * (1 + limit);
}

// ----- The Earth's look (a "shader": a small program the graphics card runs) -----
// One dark, minimal look. For every point on the globe it mixes:
//   dim daylight     where the sun is up right now: faded, cool and dark,
//                    so the globe stays dark overall
//   city lights      on the night side, with a soft line between the two
//   ocean shine      a faint highlight where sunlight meets the water
//   edge glow        a blue rim, brighter towards the edge of the globe
// It needs three.js (loaded from the import map in index.html). If that
// can't load, the globe keeps its plain night picture.
const EARTH_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vPositionWorld;
  void main() {
    vUv = uv;
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPositionWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const EARTH_FRAGMENT_SHADER = `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D waterMap;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vPositionWorld;

  void main() {
    vec3 normal = normalize(vNormalWorld);
    vec3 toCamera = normalize(cameraPosition - vPositionWorld);
    vec3 sun = normalize(sunDirection);

    // Day and night, with a soft line between them
    float sunAmount = dot(normal, sun);
    float dayAmount = smoothstep(-0.12, 0.22, sunAmount);
    // Daylight, but dark and minimal: faded towards grey, cooled towards blue, dimmed
    vec3 dayPicture = texture2D(dayMap, vUv).rgb;
    float grey = dot(dayPicture, vec3(0.299, 0.587, 0.114));
    vec3 day = mix(vec3(grey), dayPicture, 0.4) * vec3(0.68, 0.8, 1.0)
             * (0.12 + 0.22 * clamp(sunAmount, 0.0, 1.0));
    vec3 night = texture2D(nightMap, vUv).rgb * 1.35 + vec3(0.004, 0.008, 0.02);
    vec3 color = mix(night, day, dayAmount);

    // Ocean shine
    float water = texture2D(waterMap, vUv).r;
    vec3 halfway = normalize(sun + toCamera);
    float shine = pow(max(dot(normal, halfway), 0.0), 220.0) * water * dayAmount;
    color += shine * vec3(0.4, 0.6, 1.0) * 0.12;

    // Edge glow
    float rim = pow(1.0 - max(dot(normal, toCamera), 0.0), 4.0);
    color += rim * vec3(0.16, 0.42, 1.0) * 0.4;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

let earthMaterial = null;   // the shader, once it's ready

// Where the sun is overhead right now (roughly: good to within a degree)
function sunPosition(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - start) / 86400000;
  const lat = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
  let lng = (12 - hours) * 15;
  if (lng < -180) lng += 360;
  return { lat: lat, lng: lng };
}

function updateSun() {
  if (!earthMaterial) return;
  const sun = sunPosition(new Date());
  const point = globe.getCoords(sun.lat, sun.lng);
  const length = Math.hypot(point.x, point.y, point.z) || 1;
  earthMaterial.uniforms.sunDirection.value.set(point.x / length, point.y / length, point.z / length);
}

function setupEarthLook() {
  import("three").then(function (THREE) {
    const renderer = globe.renderer();
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");

    // Load a picture as a texture, with the settings that keep it crisp
    function loadTexture(url, isColor) {
      return new Promise(function (resolve, reject) {
        loader.load(url, function (texture) {
          if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = renderer.capabilities.getMaxAnisotropy();   // sharp at the edges of the globe too
          resolve(texture);
        }, undefined, reject);
      });
    }

    // 1. The 4K pictures first, so the new look appears quickly
    return Promise.all([loadTexture(GLOBE_FILES.day, true), loadTexture(GLOBE_FILES.night, true), loadTexture(GLOBE_FILES.water, false)])
      .then(function (textures) {
        earthMaterial = new THREE.ShaderMaterial({
          uniforms: {
            dayMap: { value: textures[0] },
            nightMap: { value: textures[1] },
            waterMap: { value: textures[2] },
            sunDirection: { value: new THREE.Vector3(1, 0, 0) },
          },
          vertexShader: EARTH_VERTEX_SHADER,
          fragmentShader: EARTH_FRAGMENT_SHADER,
        });
        globe.globeMaterial(earthMaterial);
        updateSun();
        setInterval(updateSun, 60000);   // the sun moves: update once a minute

        // 2. Then the 8K pictures, if they're on the website and this device can handle them
        // (Only on a real web address: a page opened straight from a file can't load them.)
        if (renderer.capabilities.maxTextureSize < 8192 || !/^https?:$/.test(location.protocol)) return;
        return Promise.all([loadTexture(GLOBE_FILES.day8k, true), loadTexture(GLOBE_FILES.night8k, true)])
          .then(function (sharp) {
            earthMaterial.uniforms.dayMap.value.dispose();
            earthMaterial.uniforms.nightMap.value.dispose();
            earthMaterial.uniforms.dayMap.value = sharp[0];
            earthMaterial.uniforms.nightMap.value = sharp[1];
            globeIsSharp = true;
            setZoomLimit();
          })
          .catch(function () { /* no 8K pictures on the website yet: the 4K ones stay */ });
      });
  }).catch(function () { /* three.js couldn't load: the plain night picture stays */ });
}

if (globe) setupEarthLook();

// ----- Glow (bloom) -----
// A soft cinematic glow on the brightest parts (city lights, the atmosphere).
// It needs a few extra three.js files, loaded only the first time it's on.
let bloomPass = null;
let bloomLoading = false;
function setGlow(on) {
  if (!globe) return;
  const composer = globe.postProcessingComposer();
  if (!on) {
    if (bloomPass) bloomPass.enabled = false;
    return;
  }
  if (bloomPass) {
    bloomPass.enabled = true;
    return;
  }
  if (bloomLoading) return;
  bloomLoading = true;
  // "three" and "three/addons/" come from the import map in index.html
  Promise.all([import("three"), import("three/addons/postprocessing/UnrealBloomPass.js")])
    .then(function (modules) {
      bloomPass = new modules[1].UnrealBloomPass(
        new modules[0].Vector2(globeBox.clientWidth, globeBox.clientHeight),
        0.45,    // strength: a soft glow, not a haze
        0.3,     // radius
        0.9);    // only the brightest parts glow (city lights, the atmosphere's rim)
      composer.addPass(bloomPass);
      bloomPass.enabled = getGlobeSettings().glow;
    })
    .catch(function () { /* no glow this time: the globe works fine without it */ })
    .finally(function () { bloomLoading = false; });
}

// Turn the settings into globe settings
let borderShapes = null;   // the country shapes, downloaded the first time Borders is turned on
function applyGlobeSettings() {
  if (!globe) return;
  const settings = getGlobeSettings();

  // Spin, but not while a university's details are open
  globe.controls().autoRotate = settings.spin && selectedId === null;
  setGlow(settings.glow);

  if (!settings.borders) {
    globe.polygonsData([]);
  } else if (borderShapes) {
    globe.polygonsData(borderShapes);
  } else {
    fetch(GLOBE_FILES.borders)
      .then(function (response) { return response.json(); })
      .then(function (data) {
        borderShapes = data.features;
        if (getGlobeSettings().borders) globe.polygonsData(borderShapes);
      })
      .catch(function () { /* no borders this time; the setting can be tried again */ });
  }

  drawArcs();
}

// Where your home country is, found once with the map search (section 6)
// and remembered. Returns null until it's known.
let homeLookupRunning = false;
function getHomePlace(callback) {
  const country = getAcademicProfile().countryOfResidence;
  if (!country) return callback(null);

  const saved = state.settings.homePlace;
  if (saved && saved.country === country) return callback(saved);

  if (homeLookupRunning) return callback(null);
  homeLookupRunning = true;
  fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(country))
    .then(function (response) { return response.json(); })
    .then(function (results) {
      if (!results[0]) return callback(null);
      const place = { country: country, lat: Number(results[0].lat), lng: Number(results[0].lon) };
      state.settings.homePlace = place;
      save("homePlace");
      callback(place);
    })
    .catch(function () { callback(null); })
    .finally(function () { homeLookupRunning = false; });
}

// Arcs from your home country (Profile tab) to each university
let globePoints = [];
function drawArcs() {
  if (!globe) return;
  if (!getGlobeSettings().arcs) {
    globe.arcsData([]);
    return;
  }
  getHomePlace(function (home) {
    if (!home || !getGlobeSettings().arcs) {
      globe.arcsData([]);
      return;
    }
    globe.arcsData(globePoints.map(function (point) {
      return { startLat: home.lat, startLng: home.lng, endLat: point.lat, endLng: point.lng };
    }));
  });
}

// Draw all the dots again from the universities list
function drawPins() {
  if (!globe) return;
  globePoints = state.universities.map(toGlobePoint).filter(Boolean);
  globe.htmlElementsData(globePoints);
  globe.ringsData(globePoints.filter(function (point) { return point.isSelected; }));
  applyGlobeSettings();
}

// Turn the globe so the dots are in view
function zoomToAllPins() {
  if (!globe || globePoints.length === 0) return;

  // Point at the middle of all the dots
  let x = 0, y = 0, z = 0;
  globePoints.forEach(function (point) {
    const lat = point.lat * Math.PI / 180, lng = point.lng * Math.PI / 180;
    x += Math.cos(lat) * Math.cos(lng);
    y += Math.cos(lat) * Math.sin(lng);
    z += Math.sin(lat);
  });
  const lng = Math.atan2(y, x) * 180 / Math.PI;
  const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI;
  globe.pointOfView({ lat: lat, lng: lng, altitude: globePoints.length === 1 ? 1.2 : 1.8 }, 1600);
}

// ----- The gear button and its settings -----
const globeSettingsButton = document.getElementById("globe-settings-button");
const globeSettingsMenu = document.getElementById("globe-settings");

function setSettingsOpen(open) {
  globeSettingsMenu.hidden = !open;
  globeSettingsButton.setAttribute("aria-expanded", String(open));
}

globeSettingsButton.disabled = !globe;
globeSettingsButton.addEventListener("click", function (event) {
  event.stopPropagation();
  setSettingsOpen(globeSettingsMenu.hidden);
});
// Clicking anywhere else (or pressing Escape) closes it
document.addEventListener("click", function (event) {
  if (!globeSettingsMenu.hidden && !globeSettingsMenu.contains(event.target)) setSettingsOpen(false);
});
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && !globeSettingsMenu.hidden) setSettingsOpen(false);
});

// Tick the switches to match the saved settings (called at startup)
function showGlobeSettings() {
  document.querySelectorAll("[data-globe-setting]").forEach(function (box) {
    box.checked = getGlobeSettings()[box.dataset.globeSetting];
  });
}

document.querySelectorAll("[data-globe-setting]").forEach(function (box) {
  box.addEventListener("change", function () {
    const settings = getGlobeSettings();
    settings[box.dataset.globeSetting] = box.checked;
    state.settings.globe = settings;
    save("globeSettings");
    applyGlobeSettings();
    if (box.dataset.globeSetting === "arcs" && box.checked && !getAcademicProfile().countryOfResidence) {
      showToast("Add your country of residence on the Profile tab to see arcs from home.", "circle-alert");
    }
  });
});


// =========================================================
// 6. FINDING A LOCATION'S COORDINATES ("geocoding")
// The map needs numbers (latitude and longitude), not words.
// A free OpenStreetMap service called Nominatim converts them.
// =========================================================

async function searchLocation(query) {
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(query);
  const response = await fetch(url);
  const results = await response.json();

  if (results.length === 0) return null;
  return { lat: Number(results[0].lat), lng: Number(results[0].lon) };
}

async function findCoordinates(name, city, country) {
  // Try the university itself first, so the pin lands on the campus...
  const exact = await searchLocation(name + ", " + city + ", " + country);
  if (exact) return exact;

  // ...otherwise use the city
  return await searchLocation(city + ", " + country);
}


// =========================================================
// 7. AUTO-FILL: SEARCHING ONLINE FOR UNIVERSITY DATA
//
// When you press "Find details", lookUpUniversity() runs two steps:
//
//   Step A - Wikidata and Wikipedia (free, no key needed)
//     Wikidata is a big public database of facts. It gives us the
//     university's official name, city, country, exact position
//     on the map and official website. Wikipedia gives a short
//     description of the university.
//
//   Step B - Claude with web search (only if you added an API key)
//     Claude searches ONLY the university's official website (the
//     one Wikidata gave us), reads the course pages, and sends back
//     the deadline, entry requirements and so on.
//
// If every page Claude used is on the official website, the result
// gets the "Verified from official sources" label.
// =========================================================

const CLAUDE_MODEL = "claude-opus-5-5";

function getApiKey() {
  return state.settings.apiKey;
}

// "https://www.ed.ac.uk/study" -> "ed.ac.uk"
function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (error) {
    return "";
  }
}

// True if a web address belongs to a domain (or one of its subdomains)
function isOnDomain(url, domain) {
  const host = getDomain(url);
  return host === domain || host.endsWith("." + domain);
}

// Only allow normal web links (http or https). Returns null for anything else.
function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch (error) {
    return null;
  }
}

// Keep the first few sentences of a long text
function firstSentences(text, count) {
  const sentences = (text || "").match(/[^.!?]+[.!?]+/g) || [];
  return sentences.slice(0, count).join("").trim() || (text || "").trim();
}


// ----- Step A: Wikidata -----

// Ask Wikidata's public API a question and get the answer as data.
// "origin=*" tells Wikidata it's fine for any web page to read the answer.
async function askWikidata(params) {
  const url = "https://www.wikidata.org/w/api.php?format=json&origin=*&" + new URLSearchParams(params);
  const response = await fetch(url);
  if (!response.ok) throw new Error("Wikidata didn't answer.");
  return response.json();
}

// Wikidata stores each fact as a "claim" with a property code:
// P17 = country, P131 = located in, P625 = map position, P856 = website.
// This returns the value of the best claim for one property.
function getClaim(entity, property) {
  const claims = (entity.claims && entity.claims[property]) || [];
  const best = claims.find(function (c) { return c.rank === "preferred"; }) ||
               claims.find(function (c) { return c.rank !== "deprecated"; });
  return best && best.mainsnak.datavalue ? best.mainsnak.datavalue.value : null;
}

async function findOnWikidata(name) {
  // 1. Search Wikidata for things with this name
  const search = await askWikidata({
    action: "wbsearchentities", search: name, language: "en", type: "item", limit: "8",
  });

  // 2. Pick the first result described as a university, college, etc.
  const looksLikeUniversity = /universit|college|institut|school|academy|polytechnic|conservatoire|hochschule/i;
  const match = (search.search || []).find(function (result) {
    return looksLikeUniversity.test(result.description || "");
  });
  if (!match) return null;

  // 3. Get its full record
  const data = await askWikidata({
    action: "wbgetentities", ids: match.id, props: "labels|claims|sitelinks",
    languages: "en", sitefilter: "enwiki",
  });
  const entity = data.entities[match.id];

  const position = getClaim(entity, "P625");
  const website = getClaim(entity, "P856");
  const countryId = (getClaim(entity, "P17") || {}).id;
  const cityId = (getClaim(entity, "P131") || getClaim(entity, "P276") || {}).id;

  // 4. City and country are stored as codes (like "Q145"), so look up their names
  const names = {};
  const ids = [countryId, cityId].filter(Boolean);
  if (ids.length > 0) {
    const labels = await askWikidata({ action: "wbgetentities", ids: ids.join("|"), props: "labels", languages: "en" });
    ids.forEach(function (id) {
      const item = labels.entities[id];
      names[id] = item && item.labels.en ? item.labels.en.value : "";
    });
  }

  return {
    officialName: entity.labels.en ? entity.labels.en.value : match.label,
    city: cityId ? names[cityId] : "",
    country: countryId ? names[countryId] : "",
    lat: position ? position.latitude : null,
    lng: position ? position.longitude : null,
    website: safeUrl(website) || "",
    wikipediaTitle: entity.sitelinks && entity.sitelinks.enwiki ? entity.sitelinks.enwiki.title : "",
  };
}

// A short description of the university from Wikipedia
async function getWikipediaSummary(title) {
  if (!title) return "";
  const response = await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" +
    encodeURIComponent(title.replace(/ /g, "_")));
  if (!response.ok) return "";
  const page = await response.json();
  return firstSentences(page.extract, 2);
}


// ----- Step B: Claude searches the official website -----

// The instructions Claude follows when it searches (your extractor rules).
// Each answer comes back as one line, "Label: value", so we can read it.
const SEARCH_INSTRUCTIONS = [
  "You are an academic data extractor.",
  "Your goal is to quickly and efficiently find concise, factual information about a university and a specific course.",
  "",
  "Search only the university's official website (e.g., *.edu, *.ac.uk, *.edu.au, etc.) and stop after reading the most relevant pages.",
  "",
  "Return clean, structured text with these sections, each on its own line as 'Section: value', using exactly these section names:",
  "University:",
  "Course:",
  "City:",
  "Country:",
  "Application Deadline:",
  "Entry Requirements:",
  "How to Apply:",
  "Course Description:",
  "Important Notes:",
  "Application Dates:",
  "Rolling Admissions:",
  "",
  "Rules:",
  "- Keep each section short (1-2 sentences max). Application Dates is the exception: list every date.",
  "- Do NOT include commentary, disclaimers, or search-limit notes.",
  "- Do NOT explain what you did or why.",
  "- Do NOT recommend when to apply.",
  "- If information is missing, write \"Not available\".",
  "- Never repeat the same data in multiple sections. Exception: Application Dates lists every date, even if one of them is also the Application Deadline.",
  "- Prioritize official admissions and course pages.",
  "- Stop reading after 3 pages.",
  "- Keep total output under 3000 characters.",
  "- Use plain text only - no markdown, no bullet points, no extra formatting.",
  "- Never invent a day. If a page only gives a month, write just the month and year (for example: June 2027).",
  "- Application Deadline: the next deadline that hasn't passed yet, with day, month and year (for example 14 January 2027).",
  "- Application Dates: list EVERY application-related date, in date order, separated by semicolons. " +
    "Write each one as: type | campus | name | date | page URL. " +
    "type is one of: opens, deadline, decision, start, other. " +
    "campus is the campus name, or - if the date is the same for every campus. " +
    "name is short, for example: Round 1, Early deadline, Final deadline, Scholarship deadline, Round 1 results, Applications open, Course starts. " +
    "page URL is the official page where you found the date. " +
    "Include every round or stage, application opening dates, early or priority deadlines, final deadlines, scholarship deadlines, " +
    "decision or result dates and the course start date. If dates differ by campus, include ALL campuses. " +
    "Example: opens | - | Applications open | 1 September 2026 | https://www.example.edu/apply; " +
    "deadline | Paris | Round 1 | 18 November 2026 | https://www.example.edu/dates",
  "- Rolling Admissions: write yes if applications are reviewed as they arrive or places are filled in order, otherwise no.",
  "- Intake: give dates only for the admissions cycle for the applicant's intended start date, never for an earlier or later intake.",
  "- School system: give Entry Requirements for the applicant's school system when the page lists them (for example the Abitur grade or IB points).",
  "- Country of residence: use it only for rules that depend on residence (such as fees or a separate application route). " +
    "Never use it to choose or leave out a campus.",
].join("\n");

// The section names Claude uses, matched to our form's boxes
const SECTION_KEYS = {
  "university": "university",
  "course": "course",
  "city": "city",
  "country": "country",
  "application deadline": "deadline",
  "entry requirements": "requirements",
  "how to apply": "applicationInfo",
  "course description": "courseDescription",
  "important notes": "notes",
  "application dates": "applicationDates",
  "rolling admissions": "rolling",
};

// Turn an error code from the Claude API into a message a person can act on
function explainApiError(status) {
  if (status === 401) return "Your Claude API key wasn't accepted. Check it in Auto-fill settings.";
  if (status === 403) return "Your Claude API key isn't allowed to do this. Check your Anthropic account.";
  if (status === 429) return "Too many searches at once. Wait a minute and try again.";
  if (status === 400) return "The search request was rejected. Check that your Anthropic account has credit.";
  return "The online search isn't available right now (error " + status + "). Try again later.";
}

// Read Claude's answer, which looks like:
//   City: Edinburgh
//   Application Deadline: 14 January 2027
// and turn it into { city: "Edinburgh", deadline: "14 January 2027", ... }
function parseSections(text) {
  const result = {};
  let currentKey = null;

  text.split("\n").forEach(function (rawLine) {
    // Remove any stray formatting like "**" or "- " at the start
    const line = rawLine.replace(/\*\*/g, "").replace(/^\s*[-•]\s*/, "").trim();
    if (!line) return;

    const match = line.match(/^([A-Za-z ]+?)\s*:\s*(.*)$/);
    const key = match ? SECTION_KEYS[match[1].trim().toLowerCase()] : null;

    if (key) {
      currentKey = key;
      result[key] = match[2].trim();
    } else if (currentKey) {
      // A line without a section name belongs to the section above it.
      // (Application dates keep their line breaks: each line can be one date.)
      const joiner = currentKey === "applicationDates" ? "\n" : " ";
      result[currentKey] = (result[currentKey] + joiner + line).trim();
    }
  });
  return result;
}

// Tidy up one answer: must be text, not "Not available", not too long
function cleanAnswer(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (/^(not available|n\/a|none|unknown|null|not (published|found|stated))\.?$/i.test(text)) return "";
  return text.slice(0, 700);
}

// Real month names and their usual short forms. (Checking the whole word
// stops "Decision" from being read as "December".)
const MONTH_NAMES = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const MONTH_WORD = new RegExp("^(?:" + MONTH_NAMES + ")$", "i");

// "November" -> 11, "Sept" -> 9, "Decision" -> 0 (not a month)
function monthFromWord(word) {
  if (!MONTH_WORD.test(word)) return 0;
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    .indexOf(word.slice(0, 3).toLowerCase()) + 1;
}

// Turn a written date into "YYYY-MM-DD" so it fits the date box.
// Understands "14 January 2027", "January 14, 2027" and "2027-01-14".
// Returns "" if it can't find a full date.
function parseDeadline(text) {
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];

  const pad = function (n) { return String(n).padStart(2, "0"); };

  // "14 January 2027" or "14th Jan 2027" (checks every candidate, so
  // "Decision 1, 2026" is skipped and a real date later on is still found)
  for (const m of text.matchAll(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})\.?,?\s+(\d{4})/g)) {
    if (monthFromWord(m[2])) return m[3] + "-" + pad(monthFromWord(m[2])) + "-" + pad(m[1]);
  }

  // "January 14, 2027"
  for (const m of text.matchAll(/([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/g)) {
    if (monthFromWord(m[1])) return m[3] + "-" + pad(monthFromWord(m[1])) + "-" + pad(m[2]);
  }

  return "";
}

// Like parseDeadline, but also understands dates without a year
// ("15 November", "Nov 15"). Those get the next time that day comes round.
// Returns "" if there's no date. (The Timeline uses this too.)
function parseLooseDate(text) {
  const fullDate = parseDeadline(text);
  if (fullDate) return fullDate;

  let day = 0;
  let month = 0;
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,})/g)) {
    if (monthFromWord(m[2])) { day = Number(m[1]); month = monthFromWord(m[2]); break; }
  }
  if (!month) {
    for (const m of text.matchAll(/\b([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/g)) {
      if (monthFromWord(m[1])) { day = Number(m[2]); month = monthFromWord(m[1]); break; }
    }
  }
  if (!day || day > 31) return "";

  const pad = function (n) { return String(n).padStart(2, "0"); };
  const today = new Date();
  const todayText = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());
  let year = today.getFullYear();
  if (year + "-" + pad(month) + "-" + pad(day) < todayText) year++;   // already passed this year
  return year + "-" + pad(month) + "-" + pad(day);
}

// "June 2027" or "rolling until June" -> the last day of that month.
// Months without a year get the next time that month ends.
function endOfMonthDate(text) {
  let match = null;
  for (const m of text.matchAll(new RegExp("\\b(" + MONTH_NAMES + ")\\b\\.?(?:\\s+(\\d{4}))?", "gi"))) {
    // "may" without a year is usually the verb ("you may apply")
    if (/^may$/i.test(m[1]) && !m[2]) continue;
    match = m;
    break;
  }
  if (!match) return "";

  const month = monthFromWord(match[1]);
  const today = new Date();
  let year = match[2] ? Number(match[2]) : today.getFullYear();
  let lastDay = new Date(year, month, 0);
  if (!match[2] && lastDay < today) {
    year++;
    lastDay = new Date(year, month, 0);
  }
  return year + "-" + String(month).padStart(2, "0") + "-" + String(lastDay.getDate()).padStart(2, "0");
}

// Take the date out of a round's text and tidy what's left into a name
function roundLabel(item) {
  const month = "(?:" + MONTH_NAMES + ")\\b\\.?";
  const datePatterns = [
    new RegExp("\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?" + month + ",?(?:\\s+\\d{4})?", "gi"),   // 18 November (2026)
    new RegExp(month + "\\s+\\d{1,2}(?!\\d)(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?", "gi"),               // November 18 (, 2026)
    /\d{4}-\d{2}-\d{2}/g,                                                                    // 2026-11-18
    new RegExp(month + "\\s+\\d{4}", "gi"),                                                // November 2026 (month only)
  ];
  let label = item;
  datePatterns.forEach(function (pattern) { label = label.replace(pattern, " "); });
  label = label
    .replace(/[:\u2013\u2014]/g, " ")          // colons and long dashes between parts
    .replace(/\s+-\s+|\s+-$|^-\s+/g, " ")      // short dashes used as separators
    .replace(/[(),]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (label || "Round").slice(0, 40);
}

// Words that start a round's name ("Round 1", "Early Decision", ...).
// Anything written before them can be the campus ("Paris Round 1").
// "deadline" isn't one of them: in "Application deadline" or
// "Early bird deadline" the first word is not a campus.
const ROUND_WORDS = /\b(?:round|stage|phase|early decision|early action|restrictive early action|regular decision)\b/i;

// Words that describe applicants or deadlines, never a campus
const NOT_CAMPUS = /\b(?:applicants?|students?|international|domestic|home|overseas|eu|non-eu|deadlines?|applications?|early bird|priority|regular|main|final|general|standard|opens?|opening|starts?|results?|decisions?|course|intake|scholarships?)\b/i;

// "Paris: Round 1 - 18 November" -> { campus: "Paris", rest: "Round 1 - 18 November" }
// "Paris/Madrid Round 1 - 18 Nov" -> { campus: "Paris/Madrid", rest: "Round 1 - 18 Nov" }
// "Round 1 - 18 November"        -> { campus: "", rest: "Round 1 - 18 November" }
// "Application deadline - 30 Jun" -> { campus: "", rest: "Application deadline - 30 Jun" }
function splitCampus(item) {
  const text = item.trim();
  const tidy = function (campus) {
    return campus.replace(/\s*campus$/i, "").trim();   // "Paris campus" -> "Paris"
  };
  const isCampus = function (before) {
    return before && !/\d/.test(before) && !NOT_CAMPUS.test(before) && !ROUND_WORDS.test(before);
  };

  const colon = text.indexOf(":");
  if (colon > 0) {
    const before = tidy(text.slice(0, colon));
    if (isCampus(before)) return { campus: before, rest: text.slice(colon + 1).trim() };
  }
  const roundWord = text.search(ROUND_WORDS);
  if (roundWord > 0) {
    const before = tidy(text.slice(0, roundWord).replace(/[-:,\s]+$/, ""));
    if (isCampus(before)) return { campus: before, rest: text.slice(roundWord) };
  }
  return { campus: "", rest: text };
}

// ----- Application dates -----
// Auto-fill collects every date it finds. Each one is saved like this:
//   { label: "Round 1", campus: "Paris", date: "2026-11-18",
//     type: "deadline", sourceUrl: "https://..." }
// type is one of DATE_TYPES. When only the month is known, date is
// "2027-06" and approximate is true (we never make up a day).

const DATE_TYPES = ["opens", "deadline", "decision", "start", "other"];

// "Deadline", "Round 1 closes", "Results" -> one of DATE_TYPES
function dateType(text) {
  const value = (text || "").toLowerCase().trim();
  if (DATE_TYPES.indexOf(value) !== -1) return value;
  if (/decision|result|notif|offer|outcome|answer|response/.test(value)) return "decision";
  if (/\bopen/.test(value)) return "opens";
  if (/start|begin|commence|orientation|induction|welcome/.test(value)) return "start";
  if (/deadline|close|closing|round|stage|phase|due|last day|apply by|submit/.test(value)) return "deadline";
  return "other";
}

// "June 2027" -> "2027-06". A month without a year gets the next time
// that month comes round. Returns "" if no month is mentioned.
function parseMonthOnly(text) {
  const end = endOfMonthDate(text);
  return end ? end.slice(0, 7) : "";
}

// Read one date. Returns { date, approximate } or null.
function readItemDate(text) {
  const exact = parseDeadline(text) || parseLooseDate(text);
  if (exact) return { date: exact, approximate: false };
  const month = parseMonthOnly(text);
  return month ? { date: month, approximate: true } : null;
}

// The last day a date could be: "2027-06" -> "2027-06-30", "2026-11-18" stays.
// Used to sort dates and to tell whether one has passed.
function itemEndDate(item) {
  if (!/^\d{4}-\d{2}$/.test(item.date)) return item.date;
  const parts = item.date.split("-");
  return item.date + "-" + String(new Date(Number(parts[0]), Number(parts[1]), 0).getDate()).padStart(2, "0");
}

// "Paris · Round 1 · 18 Nov 2026" (or "Jun 2027 (approx.)" for a month)
function itemDateText(item) {
  if (item.approximate) {
    const parts = item.date.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, 1)
      .toLocaleDateString(undefined, { month: "short", year: "numeric" }) + " (approx.)";
  }
  return formatDate(item.date);
}

function itemText(item) {
  return [item.campus, item.label, itemDateText(item)].filter(Boolean).join(" · ");
}

// Turn one date into a tidy, safe item (also used for dates saved
// by older versions). Returns null if there's no usable date.
function cleanDateItem(raw) {
  if (!raw || typeof raw.date !== "string") return null;
  const date = String(raw.date || "");
  const exact = /^\d{4}-\d{2}-\d{2}$/.test(date);
  if (!exact && !/^\d{4}-\d{2}$/.test(date)) return null;
  const text = function (value, max) { return typeof value === "string" ? value.trim().slice(0, max) : ""; };
  return {
    label: text(raw.label, 60) || "Date",
    campus: text(raw.campus, 40),
    date: date,
    type: dateType(raw.type),
    sourceUrl: safeUrl(raw.sourceUrl) || "",
    approximate: !exact,
  };
}

// Claude's answer, e.g.
//   "deadline | Paris | Round 1 | 18 November 2026 | https://...; opens | - | Applications open | September 2026 | https://..."
// -> a list of date items, in date order. Older free-text answers
// ("Paris: Round 1 - 18 November 2026") still work.
function parseApplicationDates(text) {
  if (typeof text !== "string" || /^\s*(not available|n\/a|none|unknown)\.?\s*$/i.test(text)) return [];
  const items = [];

  // One date per line, or separated by "; " (a web address can contain ";")
  text.split(/\n|;\s+|;(?=[a-z]+\s*\|)/i).forEach(function (piece) {
    const part = piece.trim();
    if (!part) return;
    let raw;

    const fields = part.split("|").map(function (field) { return field.trim(); });
    if (fields.length >= 4) {
      // type | campus | name | date | URL
      const found = readItemDate(fields[3]);
      if (!found) return;
      const campus = fields[1] === "-" || /^(all|any|none|n\/a)$/i.test(fields[1]) ? "" : fields[1];
      raw = { type: dateType(fields[0]), campus: campus, label: fields[2], date: found.date, sourceUrl: fields[4] || "" };
    } else {
      // Free text: "Paris: Round 1 - 18 November 2026"
      const found = readItemDate(part);
      if (!found) return;
      const split = splitCampus(part);
      const label = roundLabel(split.rest.replace(/https?:\/\/\S+/g, ""));
      const url = (part.match(/https?:\/\/\S+/) || [""])[0];
      raw = { type: dateType(label), campus: split.campus, label: label, date: found.date, sourceUrl: url };
    }

    const item = cleanDateItem(raw);
    const duplicate = item && items.some(function (other) {
      return other.type === item.type && other.date === item.date &&
        other.label.toLowerCase() === item.label.toLowerCase() && other.campus.toLowerCase() === item.campus.toLowerCase();
    });
    if (item && !duplicate) items.push(item);
  });

  return sortDateItems(items).slice(0, 40);
}

// Earliest first
function sortDateItems(items) {
  return items.slice().sort(function (a, b) {
    const x = itemEndDate(a), y = itemEndDate(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

// "yes" -> true. Anything else -> false.
function parseRolling(text) {
  return /^\s*yes\b/i.test(text || "") || /^\s*rolling\b/i.test(text || "");
}

// Universities saved by older versions had admissionsType,
// admissionsRounds and recommendedWindow. Turn the rounds into
// application dates, keep "rolling" as a flag, and drop the rest.
// Returns true if anything changed.
function migrateUniversity(uni) {
  const old = "admissionsRounds" in uni || "admissionsType" in uni || "recommendedWindow" in uni;
  if (!old) return false;

  if (!Array.isArray(uni.applicationDates)) {
    uni.applicationDates = sortDateItems((uni.admissionsRounds || []).map(function (round) {
      if (!round) return null;
      let campus = round.campus || "";
      let label = round.label || "Round";
      if (!campus) {             // very old saves had the campus inside the label
        const split = splitCampus(label);
        campus = split.campus;
        label = split.rest || label;
      }
      return cleanDateItem({ type: "deadline", campus: campus, label: label, date: round.date });
    }).filter(Boolean));
  }
  if (typeof uni.rolling !== "boolean") uni.rolling = uni.admissionsType === "rolling";

  delete uni.admissionsType;
  delete uni.admissionsRounds;
  delete uni.recommendedWindow;
  return true;
}

// ----- Your academic profile (set on the Profile tab) -----
// { intendedStartDate: "2027-09", currentGradeLevel: "Year 13 (Grade 12)",
//   schoolSystem: "Abitur", countryOfResidence: "Germany" }

function getAcademicProfile() {
  const saved = state.academicProfile;
  const text = function (value) { return typeof value === "string" ? value.trim().slice(0, 80) : ""; };
  return {
    intendedStartDate: /^\d{4}-\d{2}$/.test(saved.intendedStartDate || "") ? saved.intendedStartDate : "",
    currentGradeLevel: text(saved.currentGradeLevel),
    schoolSystem: text(saved.schoolSystem),
    countryOfResidence: text(saved.countryOfResidence),
  };
}

// "2027-09" -> "September 2027"
function intakeLabel(intake) {
  if (!intake) return "";
  const parts = intake.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, 1)
    .toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

async function searchOfficialPages(apiKey, uniName, course, found) {
  const domain = found && found.website ? getDomain(found.website) : "";
  const today = new Date().toISOString().slice(0, 10);
  const profile = getAcademicProfile();

  const question = [
    "University: " + uniName,
    "Course: " + course,
    domain ? "Official website: " + found.website : "",
    "Today's date: " + today,
    // Your academic profile, so the cycle, grades and rules match you
    profile.intendedStartDate ? "Intended start date: " + intakeLabel(profile.intendedStartDate) : "",
    profile.currentGradeLevel ? "Current grade level: " + profile.currentGradeLevel : "",
    profile.schoolSystem ? "School system: " + profile.schoolSystem : "",
    profile.countryOfResidence ? "Country of residence: " + profile.countryOfResidence : "",
  ].filter(Boolean).join("\n");

  // The web search tool. max_uses: 3 matches the "stop after 3 pages" rule,
  // and allowed_domains limits it to the official website when we know it.
  const webSearch = { type: "web_search_20260209", name: "web_search", max_uses: 3 };
  if (domain) webSearch.allowed_domains = [domain];

  let messages = [{ role: "user", content: question }];
  const allBlocks = [];
  let reply = null;

  // Long searches can pause part-way ("pause_turn"). When that happens we
  // send back what we have so far and the search carries on, up to 2 times.
  // (Each time re-sends everything found so far, so more rounds cost more.)
  for (let round = 0; round < 3; round++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        // Lets the search switch to a backup model if the main one declines
        "anthropic-beta": "server-side-fallback-2026-07-01",
        // Needed because this request comes straight from a web page
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        // "low" effort = faster, shorter searches, as the extractor rules ask
        output_config: { effort: "low" },
        fallbacks: "default",
        system: SEARCH_INSTRUCTIONS,
        tools: [webSearch],
        messages: messages,
      }),
    });

    if (!response.ok) throw new Error(explainApiError(response.status));
    reply = await response.json();
    allBlocks.push.apply(allBlocks, reply.content || []);

    if (reply.stop_reason !== "pause_turn") break;
    messages = [messages[0], { role: "assistant", content: reply.content }];
  }

  if (reply.stop_reason === "refusal") {
    throw new Error("The online search was declined. Try writing the course name differently.");
  }

  // Claude's final answer is the text in its last reply
  const answerText = (reply.content || [])
    .filter(function (block) { return block.type === "text"; })
    .map(function (block) { return block.text; })
    .join("");
  const answer = parseSections(answerText);
  if (Object.keys(answer).length === 0) {
    throw new Error("The online search didn't return usable details. Try again.");
  }

  // The pages used: first the ones Claude cited, then the pages its searches found
  const sources = [];
  allBlocks.forEach(function (block) {
    (block.citations || []).forEach(function (citation) {
      if (citation.url) sources.push(citation.url);
    });
  });
  allBlocks.forEach(function (block) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      block.content.forEach(function (result) {
        if (result.url) sources.push(result.url);
      });
    }
  });
  const cleanSources = sources.map(safeUrl).filter(Boolean)
    .filter(function (url, index, list) { return list.indexOf(url) === index; }) // remove repeats
    .slice(0, 3);

  // Every application date found (rounds, opening dates, decisions...)
  const applicationDates = parseApplicationDates(answer.applicationDates);

  // The deadline box needs a full date. If the page only gives a month,
  // we don't make up a day: the box stays empty and the notes say the month.
  let notes = cleanAnswer(answer.notes);
  const deadlineText = cleanAnswer(answer.deadline);
  let deadline = deadlineText ? parseDeadline(deadlineText) || parseLooseDate(deadlineText) : "";

  // No exact deadline? Use the next deadline in the list that has an exact day.
  if (!deadline) {
    const next = applicationDates.find(function (item) {
      return item.type === "deadline" && !item.approximate && daysUntil(item.date) >= 0;
    });
    if (next) deadline = next.date;
  }

  if (deadline && daysUntil(deadline) < 0) {
    notes = ("The last published deadline (" + formatDate(deadline) + ") has passed. " +
      "Check the website for the next one. " + notes).trim();
    deadline = "";
  } else if (deadlineText && !deadline) {
    notes = ("Application deadline: " + deadlineText + " " + notes).trim();
  }

  return {
    deadline: deadline,
    requirements: cleanAnswer(answer.requirements),
    applicationInfo: cleanAnswer(answer.applicationInfo),
    courseDescription: cleanAnswer(answer.courseDescription),
    notes: notes,
    city: cleanAnswer(answer.city),
    country: cleanAnswer(answer.country),
    sources: cleanSources,
    domain: domain,
    applicationDates: applicationDates,
    rolling: parseRolling(answer.rolling),   // just a flag, nothing is worked out from it
    // Verified = we knew the official website, and every page used is on it
    verified: Boolean(domain) && cleanSources.length > 0 && cleanSources.every(function (url) {
      return isOnDomain(url, domain);
    }),
  };
}


// =========================================================
// 8. THE FORM (with validation and auto-fill)
// =========================================================

const form = document.getElementById("uni-form");
const formCard = document.getElementById("form-card");
const formTitle = document.getElementById("form-title");
const formSubtitle = document.getElementById("form-subtitle");
const formMessage = document.getElementById("form-message");
const submitButton = document.getElementById("submit-button");
const submitIcon = document.getElementById("submit-icon");
const submitLabel = document.getElementById("submit-label");
const searchAgainButton = document.getElementById("search-again");
const cancelEditButton = document.getElementById("cancel-edit");
const foundSection = document.getElementById("found-section");
const lookupStatus = document.getElementById("lookup-status");

// Which data property goes with which input box (by its id)
const fields = {
  name: "name",
  course: "course",
  city: "city",
  country: "country",
  deadline: "deadline",
  requirements: "requirements",
  applicationInfo: "application-info",
  courseDescription: "course-description",
  notes: "notes",
  pros: "pros",
  cons: "cons",
};

// The boxes that the search fills in
const AUTO_FIELDS = ["city", "country", "deadline", "requirements", "applicationInfo", "courseDescription", "notes"];

// The result of the last search (null means no search yet)
let lookup = null;

function readForm() {
  const data = {};
  for (const key in fields) {
    data[key] = document.getElementById(fields[key]).value.trim();
  }
  return data;
}

function fillForm(uni) {
  for (const key in fields) {
    document.getElementById(fields[key]).value = uni[key] || "";
  }
}

// The main button changes depending on what happens next:
// "find" = Find details, "add" = Add to map, "save" = Save changes
function setSubmitMode(mode) {
  const icons = { find: "search", add: "plus", save: "check" };
  const labels = { find: "Find details", add: "Add to map", save: "Save changes" };
  submitIcon.innerHTML = '<i data-lucide="' + icons[mode] + '"></i>';
  submitLabel.textContent = labels[mode];
  refreshIcons();
}

// Fill one auto-filled box, and mark it as found or missing
function setAutoField(key, value, wasSearched) {
  const input = document.getElementById(fields[key]);
  const field = input.closest(".field");
  input.value = value || "";
  field.classList.toggle("is-filled", Boolean(value));
  field.classList.toggle("is-missing", !value);

  if (key === "city" || key === "country") {
    input.placeholder = "Not found. Please type it in.";
  } else if (wasSearched) {
    input.placeholder = "Not published";
  } else {
    input.placeholder = "Not looked up. Add it yourself, or turn on AI search in Auto-fill settings.";
  }
}

function clearAutoFieldMarks() {
  AUTO_FIELDS.forEach(function (key) {
    const input = document.getElementById(fields[key]);
    input.closest(".field").classList.remove("is-filled", "is-missing");
    input.placeholder = "";
  });
}

// ----- The loading animation -----
function showSteps(steps, activeIndex) {
  const list = makeElement("ul", "lookup-steps");
  steps.forEach(function (text, index) {
    const item = makeElement("li");
    if (index < activeIndex) {
      item.className = "is-done";
      item.append(makeIcon("check"));
    } else if (index === activeIndex) {
      item.className = "is-active";
      item.append(makeElement("span", "spinner"));
    } else {
      item.append(makeElement("span", "step-dot"));
    }
    item.append(makeElement("span", "", text));
    list.append(item);
  });

  lookupStatus.innerHTML = "";
  lookupStatus.append(list, makeElement("div", "shimmer-bar"));
  lookupStatus.hidden = false;
  refreshIcons();
}

// ----- The label shown after a search -----
function showLookupResult(result, errorText, cachedAt) {
  const box = makeElement("div", "lookup-result");
  const badge = makeElement("span", "source-badge");
  let message = "";

  if (result.verified) {
    badge.classList.add("is-verified");
    badge.append(makeIcon("shield-check"), "Verified from official sources");
    message = "Everything below comes from " + result.domain + ". Double-check important details there before you apply.";
  } else if (result.aiSearched) {
    badge.classList.add("is-partial");
    badge.append(makeIcon("info"), "From web sources, not verified");
    message = "Some details came from sites other than the official one. Check them on the university's website.";
  } else if (result.foundOnWikidata) {
    badge.classList.add("is-partial");
    badge.append(makeIcon("info"), "Location found");
    message = "We found the location and website. Add a Claude API key in Auto-fill settings to also look up deadlines and entry requirements.";
  } else {
    box.classList.add("is-error");
    badge.classList.add("is-partial");
    badge.append(makeIcon("circle-alert"), "University not found");
    message = "Check the spelling of the university's name, or type the city and country below yourself.";
  }

  box.append(badge, makeElement("p", "", message));
  if (cachedAt) {
    box.append(makeElement("p", "", "Saved search from " +
      new Date(cachedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) +
      ", so it was free. Use Search again for the latest details."));
  }
  if (errorText) {
    const error = makeElement("p", "", errorText);
    error.style.color = "var(--red)";
    box.append(error);
  }

  lookupStatus.innerHTML = "";
  lookupStatus.append(box);
  lookupStatus.hidden = false;
  refreshIcons();
}

// ----- Remembering searches (saves money) -----
// A Claude search costs money, so a successful one is remembered in this
// browser for 7 days. Looking up the same university and course again
// then costs nothing. "Search again" always does a fresh search.

// Bumped when the saved search format changes, so older saved searches
// (in an older format) are searched again once
const CACHE_VERSION = 4;   // 4: every application date is saved (no recommendations)
const CACHE_DAYS = 7;

// Your academic profile is part of the key: a search for a different
// start date or school system is a different search
function searchCacheKey(name, course) {
  const p = getAcademicProfile();
  return [name, course, p.intendedStartDate, p.currentGradeLevel, p.schoolSystem, p.countryOfResidence]
    .join("|").toLowerCase().replace(/\s+/g, " ");
}

function loadSearchCache() {
  return state.searchCache;
}

// Returns a remembered search, or null if there isn't a usable one
function getCachedSearch(key) {
  const entry = loadSearchCache()[key];
  if (!entry || entry.version !== CACHE_VERSION) return null;

  const ageInDays = (Date.now() - entry.savedAt) / (24 * 60 * 60 * 1000);
  if (ageInDays > CACHE_DAYS) return null;

  // If the remembered deadline has passed since, search again for the new one
  if (entry.details.deadline && daysUntil(entry.details.deadline) < 0) return null;
  return entry;
}

function saveCachedSearch(key, entry) {
  const cache = loadSearchCache();
  cache[key] = entry;

  // Keep only the 30 most recent searches so storage doesn't fill up
  const keys = Object.keys(cache).sort(function (a, b) {
    return cache[b].savedAt - cache[a].savedAt;
  });
  keys.slice(30).forEach(function (oldKey) {
    delete cache[oldKey];
  });

  // (if storage is full or blocked, the search still works, it just isn't remembered)
  state.searchCache = cache;
  save("searchCache");
}

// ----- Running a search -----
// options.fresh = true skips remembered searches (used by "Search again")
async function lookUpUniversity(options) {
  const fresh = Boolean(options && options.fresh);
  const name = document.getElementById("name").value.trim();
  const course = document.getElementById("course").value.trim();

  clearAllErrors();
  if (name.length < 2 || course.length < 2) {
    if (name.length < 2) setFieldError("name", "Enter the university's name.");
    if (course.length < 2) setFieldError("course", "Enter the course you're interested in.");
    document.getElementById(name.length < 2 ? "name" : "course").focus();
    return;
  }

  const apiKey = getApiKey();
  const steps = apiKey
    ? ["Finding the university", "Searching the official website", "Filling in the form"]
    : ["Finding the university", "Filling in the form"];

  submitButton.disabled = true;
  searchAgainButton.disabled = true;
  showFormMessage("");
  showSteps(steps, 0);

  // Use a remembered search if there is one (only for AI searches, since
  // those are the ones that cost money)
  const cacheKey = searchCacheKey(name, course);
  const cached = apiKey && !fresh ? getCachedSearch(cacheKey) : null;

  let found = null;
  let about = "";
  let details = null;
  let errorText = "";

  if (cached) {
    found = cached.found;
    about = cached.about;
    details = cached.details;
  } else {
    // Step A: Wikidata
    try {
      found = await findOnWikidata(name);
    } catch (error) {
      found = null; // carry on: Step B can still find the city and country
    }

    // The Wikipedia description runs at the same time as Step B,
    // because Step B doesn't need it. (If it fails, we just skip it.)
    const aboutRequest = found
      ? getWikipediaSummary(found.wikipediaTitle).catch(function () { return ""; })
      : Promise.resolve("");

    // Step B: Claude searches the official website (only with an API key)
    if (apiKey) {
      showSteps(steps, 1);
      try {
        details = await searchOfficialPages(apiKey, found ? found.officialName : name, course, found);
      } catch (error) {
        errorText = error.message || "The online search failed. Try again.";
      }
    }

    about = await aboutRequest;
    showSteps(steps, steps.length - 1);

    // Remember a successful AI search for next time
    if (details) {
      saveCachedSearch(cacheKey, { version: CACHE_VERSION, savedAt: Date.now(), found: found, about: about, details: details });
    }
  }

  // Combine the two. For city and country the official website wins,
  // because it knows which campus teaches the course.
  const result = {
    name: name,
    course: course,
    city: (details && details.city) || (found && found.city) || "",
    country: (details && details.country) || (found && found.country) || "",
    lat: found ? found.lat : null,
    lng: found ? found.lng : null,
    website: found ? found.website : "",
    about: about,
    sources: details ? details.sources : [],
    domain: details ? details.domain : "",
    verified: Boolean(details && details.verified),
    aiSearched: Boolean(details),
    foundOnWikidata: Boolean(found),
    applicationDates: details ? details.applicationDates || [] : [],
    rolling: Boolean(details && details.rolling),
    intake: details ? getAcademicProfile().intendedStartDate : "",   // the start date these dates are for
  };

  // Fill in the form
  foundSection.hidden = false;
  setAutoField("city", result.city, true);
  setAutoField("country", result.country, true);
  AUTO_FIELDS.slice(2).forEach(function (key) {
    setAutoField(key, details ? details[key] : "", result.aiSearched);
  });

  lookup = result;
  showLookupResult(result, errorText, cached ? cached.savedAt : null);
  submitButton.disabled = false;
  searchAgainButton.disabled = false;
  searchAgainButton.hidden = false;
  setSubmitMode(editingId ? "save" : "add");
}

searchAgainButton.addEventListener("click", function () {
  lookUpUniversity({ fresh: true });
});

// If you change the name or course after a search, the button goes back
// to "Find details" so the information matches what you typed
["name", "course"].forEach(function (id) {
  document.getElementById(id).addEventListener("input", function () {
    if (lookup && !editingId) {
      lookup = null;
      setSubmitMode("find");
    }
  });
});

// ----- Validation: show or clear a message under one field -----
function setFieldError(inputId, message) {
  const field = document.getElementById(inputId).closest(".field");
  field.classList.toggle("has-error", Boolean(message));
  document.getElementById(inputId + "-error").textContent = message || "";
}

function clearAllErrors() {
  ["name", "course", "city", "country", "deadline"].forEach(function (id) {
    setFieldError(id, "");
  });
}

// Check the form. Returns true if everything is OK.
function validateForm(data) {
  clearAllErrors();
  let firstProblem = null;

  function problem(inputId, message) {
    setFieldError(inputId, message);
    if (!firstProblem) firstProblem = inputId;
  }

  // Required fields
  if (data.name.length < 2) problem("name", "Enter the university's name.");
  if (data.course.length < 2) problem("course", "Enter the course you're interested in.");
  if (data.city.length < 2) problem("city", "We couldn't find the city automatically. Please type it in.");
  if (data.country.length < 2) problem("country", "We couldn't find the country automatically. Please type it in.");

  // The deadline is optional, but if there is one it must be a real date
  const deadlineInput = document.getElementById("deadline");
  if (deadlineInput.validity.badInput) {
    problem("deadline", "That date isn't complete. Pick a day, month and year.");
  } else if (data.deadline) {
    const year = Number(data.deadline.slice(0, 4));
    const oldUni = editingId ? findUniversity(editingId) : null;
    const isUnchanged = oldUni && oldUni.deadline === data.deadline;

    if (year < 2000 || year > 2100) {
      problem("deadline", "Check the year. It should look like " + new Date().getFullYear() + ".");
    } else if (daysUntil(data.deadline) < 0 && !isUnchanged) {
      problem("deadline", "That date has already passed. Check the deadline, or leave it empty.");
    }
  }

  // Move the cursor to the first field with a problem
  if (firstProblem) {
    document.getElementById(firstProblem).focus();
    return false;
  }
  return true;
}

// Clear a field's error as soon as you start fixing it
["name", "course", "city", "country", "deadline"].forEach(function (id) {
  document.getElementById(id).addEventListener("input", function () {
    setFieldError(id, "");
  });
});

function showFormMessage(text, type) {
  formMessage.textContent = text || "";
  formMessage.className = "form-message" + (type ? " is-" + type : "");
}

// ----- Edit mode -----
function startEditing(id) {
  const uni = findUniversity(id);
  editingId = id;
  lookup = null;
  fillForm(uni);
  clearAllErrors();
  clearAutoFieldMarks();
  showFormMessage("");

  formTitle.textContent = "Edit university";
  formSubtitle.textContent = "Changing " + uni.name + ". Use Search again to refresh the details.";
  setSubmitMode("save");
  foundSection.hidden = false;
  lookupStatus.hidden = true;
  searchAgainButton.hidden = false;
  cancelEditButton.hidden = false;
  formCard.classList.add("is-editing");

  formCard.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("name").focus({ preventScroll: true });
}

// Put the form back to its starting state
function stopEditing() {
  editingId = null;
  lookup = null;
  form.reset();
  clearAllErrors();
  clearAutoFieldMarks();

  formTitle.textContent = "Add a university";
  formSubtitle.textContent = "Type the university and course. We'll look up the rest.";
  setSubmitMode("find");
  foundSection.hidden = true;
  lookupStatus.hidden = true;
  searchAgainButton.hidden = true;
  cancelEditButton.hidden = true;
  formCard.classList.remove("is-editing");
}

cancelEditButton.addEventListener("click", function () {
  stopEditing();
  showFormMessage("");
});

// ----- Submitting the form -----
// First press (no search yet): run the search.
// Second press: save the university and add its pin.
form.addEventListener("submit", async function (event) {
  event.preventDefault(); // stop the page from reloading

  if (!lookup && !editingId) {
    await lookUpUniversity();
    return;
  }

  const data = readForm();
  if (!validateForm(data)) return;

  const oldUni = editingId ? findUniversity(editingId) : null;

  // Extra details from the search that don't have their own box
  if (lookup) {
    data.website = lookup.website;
    data.about = lookup.about;
    data.sources = lookup.sources;
    data.verified = lookup.verified;
    data.aiSearched = lookup.aiSearched;

    // Application dates (only from a Claude search, so a search
    // without an API key doesn't wipe out what an earlier search found)
    if (lookup.aiSearched) {
      data.applicationDates = lookup.applicationDates;
      data.rolling = lookup.rolling;
      data.intake = lookup.intake;
    }
  }

  // Where to put the pin:
  //  1. Wikidata's exact position, if the city and country weren't changed
  //  2. the old position, if editing and the place didn't change
  //  3. otherwise, look it up with the map search (as before)
  const placeUnchanged = oldUni &&
    oldUni.name === data.name && oldUni.city === data.city && oldUni.country === data.country;

  if (lookup && lookup.lat !== null && lookup.city === data.city && lookup.country === data.country) {
    data.lat = lookup.lat;
    data.lng = lookup.lng;
  } else if (placeUnchanged) {
    data.lat = oldUni.lat;
    data.lng = oldUni.lng;
  } else {
    submitButton.disabled = true;
    showFormMessage("Finding " + data.city + " on the map...", "working");

    try {
      const coords = await findCoordinates(data.name, data.city, data.country);
      if (!coords) {
        setFieldError("city", "We couldn't find this place. Check the spelling of the city and country.");
        showFormMessage("");
        document.getElementById("city").focus();
        return;
      }
      data.lat = coords.lat;
      data.lng = coords.lng;
    } catch (error) {
      showFormMessage("Couldn't reach the map search. Check your internet connection and try again.", "error");
      return;
    } finally {
      submitButton.disabled = false; // "finally" runs whether it worked or not
    }
  }

  let savedId;
  if (oldUni) {
    Object.assign(oldUni, data);       // copy the changes onto the existing one
    savedId = oldUni.id;
    showToast("Saved changes to " + data.name);
  } else {
    data.id = newId();                 // a unique id
    state.universities.push(data);
    savedId = data.id;
    newestId = data.id;                // so its card animates in
    showToast(data.name + " added to your map");
  }

  saveUniversities();
  stopEditing();
  showFormMessage("");
  selectUniversity(savedId, true);     // open its details and fly the map to it
});


// ----- Your academic profile: the boxes on the Profile tab -----
const ACADEMIC_FIELDS = {
  intendedStartDate: "profile-start",
  currentGradeLevel: "profile-grade",
  schoolSystem: "profile-system",
  countryOfResidence: "profile-country",
};

function showAcademicProfile() {
  const profile = getAcademicProfile();
  for (const key in ACADEMIC_FIELDS) {
    document.getElementById(ACADEMIC_FIELDS[key]).value = profile[key];
  }

  const intake = intakeLabel(profile.intendedStartDate);
  const status = document.getElementById("academic-status");
  const searchFor = document.getElementById("search-for");
  status.textContent = intake
    ? "Searches look for the admissions cycle for " + intake + " entry" +
      (profile.schoolSystem ? ", with entry requirements for " + profile.schoolSystem : "") + "."
    : "Set your intended start date so searches find deadlines for the right year.";
  searchFor.textContent = intake
    ? "Searching for " + intake + " entry. Change this on the Profile tab."
    : "Set your intended start date on the Profile tab, so searches find the right year.";
  status.classList.toggle("is-warning", !intake);
  searchFor.classList.toggle("is-warning", !intake);
}

function saveAcademicProfile() {
  const profile = {};
  for (const key in ACADEMIC_FIELDS) {
    profile[key] = document.getElementById(ACADEMIC_FIELDS[key]).value.trim();
  }
  state.academicProfile = profile;
  save("academicProfile");
  showAcademicProfile();
  document.dispatchEvent(new CustomEvent("universities-changed"));   // the Timeline re-checks start dates
}

for (const key in ACADEMIC_FIELDS) {
  document.getElementById(ACADEMIC_FIELDS[key]).addEventListener("change", saveAcademicProfile);
}

// ----- Auto-fill settings: saving your API key -----
const apiKeyInput = document.getElementById("api-key");
const aiState = document.getElementById("ai-state");

function updateAiState() {
  const key = getApiKey();
  aiState.textContent = key ? "AI search on" : "AI search off";
  aiState.classList.toggle("is-on", Boolean(key));
  apiKeyInput.value = "";
  apiKeyInput.placeholder = key ? "Saved key ending in " + key.slice(-4) : "sk-ant-...";
}

document.getElementById("save-key").addEventListener("click", function () {
  const key = apiKeyInput.value.trim();
  if (!key.startsWith("sk-ant-")) {
    showToast("That doesn't look like a Claude API key. It should start with sk-ant-", "circle-alert");
    return;
  }
  state.settings.apiKey = key;
  if (!save("apiKey")) {
    showToast("Your browser blocked saving the key.", "circle-alert");
    return;
  }
  updateAiState();
  showToast("API key saved. AI search is on.");
});

document.getElementById("remove-key").addEventListener("click", function () {
  state.settings.apiKey = "";
  save("apiKey");
  updateAiState();
  showToast("API key removed. AI search is off.", "trash-2");
});


// =========================================================
// 9. THE UNIVERSITY LIST
// =========================================================

const uniList = document.getElementById("uni-list");
const emptyList = document.getElementById("empty-list");

function drawList() {
  uniList.innerHTML = "";
  emptyList.hidden = state.universities.length > 0;

  sortByDeadline(state.universities).forEach(function (uni) {
    const myDate = getMyDate(uni);           // your planned date, chosen deadline or next deadline
    const status = getMyDateStatus(myDate);

    // The card. Its class sets the colored strip on the left.
    const card = makeElement("li", "uni-card level-" + status.level);
    card.dataset.id = uni.id;
    if (uni.id === selectedId) card.classList.add("is-selected");
    if (uni.id === newestId) card.classList.add("is-new");

    // The clickable main part: name, course, location, deadline
    const main = makeElement("button", "uni-card-main");
    main.title = "Show on the globe";

    const meta = makeElement("div", "uni-meta");
    const course = makeElement("span");
    course.append(makeIcon("book-open"), uni.course);
    const place = makeElement("span");
    place.append(makeIcon("map-pin"), uni.city + ", " + uni.country);
    meta.append(course, place);

    // e.g. [24 days left] Planned · 2 Nov 2026
    //      Deadline: Paris · Round 1 · 18 Nov 2026
    const text = describeMyDate(myDate);
    const deadline = makeElement("div", "uni-deadline");
    deadline.append(makeMyDateChip(myDate), makeElement("span", "", text.main));
    const deadlineSub = makeElement("div", "uni-deadline-sub", text.sub);
    deadlineSub.hidden = !text.sub;

    const nameRow = makeElement("span", "uni-name", uni.name);
    // a small green shield if the details came from the official website
    if (uni.verified) {
      const mark = makeElement("span", "verified-mark");
      mark.title = "Verified from official sources";
      mark.append(makeIcon("shield-check"));
      nameRow.append(mark);
    }

    main.append(nameRow, meta, deadline, deadlineSub);
    main.addEventListener("click", function () {
      selectUniversity(uni.id, true);
    });

    // Edit and delete buttons with icons
    const actions = makeElement("div", "uni-actions");

    const editButton = makeElement("button", "icon-button");
    editButton.title = "Edit";
    editButton.setAttribute("aria-label", "Edit " + uni.name);
    editButton.append(makeIcon("pencil"));
    editButton.addEventListener("click", function () {
      startEditing(uni.id);
    });

    const deleteButton = makeElement("button", "icon-button danger");
    deleteButton.title = "Delete";
    deleteButton.setAttribute("aria-label", "Delete " + uni.name);
    deleteButton.append(makeIcon("trash-2"));
    deleteButton.addEventListener("click", function () {
      deleteUniversity(uni.id);
    });

    actions.append(editButton, deleteButton);
    card.append(main, actions);
    uniList.appendChild(card);
  });

  newestId = null; // only animate a new card once
}

// Delete a university, with a short fade-out animation first
function deleteUniversity(id) {
  const uni = findUniversity(id);

  // confirm() shows a pop-up with OK and Cancel. It returns true for OK.
  if (!confirm("Delete " + uni.name + "? This can't be undone.")) return;

  const card = uniList.querySelector('[data-id="' + id + '"]');
  if (card) card.classList.add("is-leaving");

  // Wait for the animation (260ms) to finish, then really remove it
  setTimeout(function () {
    state.universities = state.universities.filter(function (u) {
      return u.id !== id;
    });
    if (editingId === id) stopEditing();
    if (selectedId === id) selectedId = null;

    saveUniversities();
    redrawEverything();
    showToast(uni.name + " removed", "trash-2");
  }, 260);
}


// =========================================================
// 10. THE DETAILS PANEL
// =========================================================

const detailsPanel = document.getElementById("details-panel");
const panelBody = document.getElementById("panel-body");

document.getElementById("close-panel").addEventListener("click", function () {
  selectedId = null;
  redrawEverything();
});

// Close the panel with the Escape key too
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && selectedId !== null) {
    selectedId = null;
    redrawEverything();
  }
});

// A row with an icon, e.g. [calendar icon] 15 Jan 2027
function makeFact(iconName, text) {
  const row = makeElement("div", "fact");
  row.append(makeIcon(iconName), makeElement("span", "", text));
  return row;
}

// A section with a small heading and some text.
// If the online search ran but found nothing, it says "Not published".
function makePanelSection(title, iconName, text, wasSearched) {
  const section = makeElement("div", "panel-section");
  const heading = makeElement("h4", "eyebrow");
  heading.append(makeIcon(iconName), title);

  let body;
  if (text) {
    body = makeElement("p", "", text);
  } else if (wasSearched) {
    body = makeElement("p", "not-published", "Not published");
  } else {
    body = makeElement("p", "empty-text", "Not added yet");
  }
  section.append(heading, body);
  return section;
}

// Every application date auto-fill found, one per line, e.g.
// "Paris · Round 1 · 18 Nov 2026"
function makeAdmissionsSection(uni) {
  const parts = (uni.applicationDates || []).map(itemText);
  if (uni.rolling) parts.push("Rolling admissions");
  if (uni.intake) parts.push("For " + intakeLabel(uni.intake) + " entry");

  const section = makeElement("div");
  if (parts.length > 0) {
    section.append(makePanelSection("Application dates", "calendar", parts.join("\n")));
  }
  return section;
}

// a link that opens in a new tab (only for normal web addresses)
function makeLink(url, text) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = text;
  return link;
}

// A colored box with a bullet list (used for pros and cons)
function makeListBox(className, title, iconName, text) {
  const box = makeElement("div", className);
  const heading = makeElement("h4", "eyebrow");
  heading.append(makeIcon(iconName), title);

  const lines = (text || "").split("\n").filter(function (line) {
    return line.trim() !== "";
  });

  box.append(heading);
  if (lines.length === 0) {
    box.append(makeElement("p", "empty-text", "None added"));
  } else {
    const list = document.createElement("ul");
    lines.forEach(function (line) {
      list.append(makeElement("li", "", line));
    });
    box.append(list);
  }
  return box;
}

function drawDetails() {
  const uni = findUniversity(selectedId);
  detailsPanel.classList.toggle("is-open", Boolean(uni));
  if (!uni) return;

  panelBody.innerHTML = "";

  // Your date chip and where the details came from
  const myDate = getMyDate(uni);
  const myDateText = describeMyDate(myDate);
  const statusRow = makeElement("div", "panel-badges");
  statusRow.append(makeMyDateChip(myDate));
  if (uni.verified) {
    const badge = makeElement("span", "source-badge is-verified");
    badge.append(makeIcon("shield-check"), "Verified from official sources");
    statusRow.append(badge);
  } else if (uni.aiSearched) {
    const badge = makeElement("span", "source-badge is-partial");
    badge.append(makeIcon("info"), "Not verified");
    statusRow.append(badge);
  }

  // Key facts
  const facts = makeElement("div", "panel-facts");
  facts.append(
    makeFact("map-pin", uni.city + ", " + uni.country),
    makeFact("calendar", myDateText.main || "No date yet")
  );
  if (myDateText.sub) facts.append(makeFact("flag", myDateText.sub));

  // link to the official website
  const website = safeUrl(uni.website);
  if (website) {
    const row = makeElement("div", "fact");
    row.append(makeIcon("external-link"), makeLink(website, getDomain(website)));
    facts.append(row);
  }

  // the pages the details came from
  const sourcesSection = makeElement("div", "panel-section");
  const sourceUrls = (uni.sources || []).map(safeUrl).filter(Boolean);
  if (sourceUrls.length > 0) {
    const heading = makeElement("h4", "eyebrow");
    heading.append(makeIcon("link"), "Sources");
    const list = makeElement("ul", "sources");
    sourceUrls.forEach(function (url) {
      const item = document.createElement("li");
      item.append(makeLink(url, url.replace(/^https?:\/\/(www\.)?/, "")));
      list.append(item);
    });
    sourcesSection.append(heading, list);
  }

  // the short description from Wikipedia
  const aboutSection = makeElement("div", "panel-section");
  if (uni.about) {
    const heading = makeElement("h4", "eyebrow");
    heading.append(makeIcon("info"), "About the university (Wikipedia)");
    aboutSection.append(heading, makeElement("p", "", uni.about));
  }

  // Pros and cons side by side
  const prosCons = makeElement("div", "pros-cons");
  prosCons.append(
    makeListBox("pros-box", "Pros", "thumbs-up", uni.pros),
    makeListBox("cons-box", "Cons", "thumbs-down", uni.cons)
  );

  // Edit and delete buttons
  const actions = makeElement("div", "panel-actions");
  const editButton = makeElement("button", "button");
  editButton.append(makeIcon("pencil"), "Edit");
  editButton.addEventListener("click", function () {
    startEditing(uni.id);
  });
  const deleteButton = makeElement("button", "button button-danger");
  deleteButton.append(makeIcon("trash-2"), "Delete");
  deleteButton.addEventListener("click", function () {
    deleteUniversity(uni.id);
  });
  // Star it as your first choice (gold pin on the globe). Only one at a time.
  const starButton = makeElement("button", "button" + (uni.firstChoice ? " is-first-choice" : ""));
  starButton.setAttribute("aria-pressed", String(Boolean(uni.firstChoice)));
  starButton.append(makeIcon("star"), uni.firstChoice ? "First choice" : "Mark as first choice");
  starButton.addEventListener("click", function () {
    const makeFirst = !uni.firstChoice;
    state.universities.forEach(function (other) { delete other.firstChoice; });
    if (makeFirst) uni.firstChoice = true;
    saveUniversities();
    redrawEverything();
  });
  actions.append(starButton, editButton, deleteButton);

  panelBody.append(
    statusRow,
    makeElement("h2", "panel-title", uni.name),
    makeElement("p", "panel-course", uni.course),
    facts,
    makePanelSection("Course description", "book-open", uni.courseDescription, uni.aiSearched),
    makePanelSection("Entry requirements", "award", uni.requirements, uni.aiSearched),
    makePanelSection("How to apply", "file-text", uni.applicationInfo, uni.aiSearched),
    makePanelSection("Important notes", "lightbulb", uni.notes, uni.aiSearched),
    makeAdmissionsSection(uni),
    aboutSection,
    prosCons,
    sourcesSection,
    actions
  );
  detailsPanel.scrollTop = 0;
}

// Select a university: highlight it everywhere and show its details.
// If flyToIt is true, the globe turns to its pin.
function selectUniversity(id, flyToIt) {
  selectedId = id;
  redrawEverything();

  const uni = findUniversity(id);
  if (!uni) return;

  if (globe && flyToIt && Number.isFinite(uni.lat)) {
    globe.pointOfView({ lat: uni.lat, lng: uni.lng, altitude: focusAltitude() }, 1500);
  }

  // On small screens the panel is under the map, so scroll to it
  if (window.innerWidth <= 960 && flyToIt) {
    document.querySelector(".map-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}


// =========================================================
// 11. SUMMARY STATS
// =========================================================

function drawStats() {
  document.getElementById("stat-total").textContent = state.universities.length;

  // Count different countries (ignoring capital letters)
  const countries = new Set(state.universities.map(function (uni) {
    return uni.country.toLowerCase();
  }));
  document.getElementById("stat-countries").textContent = countries.size;

  // The soonest of your dates that hasn't passed yet
  const upcoming = sortByDeadline(state.universities).map(function (uni) {
    return { uni: uni, myDate: getMyDate(uni) };
  }).find(function (item) {
    return item.myDate.date && daysUntil(item.myDate.date) >= 0;
  });
  document.getElementById("stat-next").textContent = upcoming
    ? upcoming.uni.name + " · " + upcoming.myDate.label + " · " + getMyDateStatus(upcoming.myDate).label
    : "None yet";
}

// Update the pins, list, panel and stats all at once
function redrawEverything() {
  drawPins();
  drawList();
  drawDetails();
  drawStats();
  refreshIcons();
}


// =========================================================
// 12. TOASTS (small messages that pop up in the corner)
// =========================================================

function showToast(message, iconName) {
  const toast = makeElement("div", "toast");
  if (iconName === "circle-alert") toast.classList.add("is-warning"); // amber icon for warnings
  toast.append(makeIcon(iconName || "circle-check"), makeElement("span", "", message));
  document.getElementById("toast-area").append(toast);
  refreshIcons();

  // After 3 seconds, fade it out and then remove it
  setTimeout(function () {
    toast.classList.add("is-leaving");
    setTimeout(function () {
      toast.remove();
    }, 300);
  }, 3000);
}


// =========================================================
// 13. THE PROFILE TAB
// Each text box saves itself every time you type.
// =========================================================

// Update the line under a text box, e.g. "1,234 / 4,000 characters · Saved"
function updateProfileStatus(textarea, justSaved) {
  const status = document.getElementById(textarea.id + "-status");
  const length = textarea.value.length;
  const limit = textarea.dataset.limit ? Number(textarea.dataset.limit) : null;

  let text = length.toLocaleString() + " characters";
  if (limit) text = length.toLocaleString() + " / " + limit.toLocaleString() + " characters";
  if (justSaved) text += " · Saved";

  status.textContent = text;
  status.classList.toggle("is-over", limit !== null && length > limit);

  // The personal statement's progress bar
  if (limit) {
    const meter = document.getElementById("statement-meter");
    const percent = Math.min(100, (length / limit) * 100);
    meter.style.width = percent + "%";
    meter.classList.toggle("is-near", length > limit * 0.9 && length <= limit);
    meter.classList.toggle("is-over", length > limit);
  }
}

// Fill in the texts saved before (called at startup)
function showProfileTexts() {
  document.querySelectorAll(".profile-field").forEach(function (textarea) {
    textarea.value = state.profile[textarea.dataset.key] || "";
    updateProfileStatus(textarea, false);
  });
}

// Save on every change
document.querySelectorAll(".profile-field").forEach(function (textarea) {
  textarea.addEventListener("input", function () {
    state.profile[textarea.dataset.key] = textarea.value;
    save("profile");
    updateProfileStatus(textarea, true);
  });
});

// "Copy to clipboard" buttons
document.querySelectorAll(".copy-button").forEach(function (button) {
  const label = button.querySelector("span");

  button.addEventListener("click", async function () {
    const textarea = document.getElementById(button.dataset.target);

    try {
      await navigator.clipboard.writeText(textarea.value);
    } catch (error) {
      // Older way of copying, used if the newer one isn't allowed
      textarea.select();
      document.execCommand("copy");
    }

    // Turn green and say "Copied" for 1.5 seconds
    button.classList.add("is-copied");
    label.textContent = "Copied";
    setTimeout(function () {
      button.classList.remove("is-copied");
      label.textContent = "Copy to clipboard";
    }, 1500);
  });
});


// =========================================================
// 14. START THE APP
// =========================================================

document.getElementById("year").textContent = new Date().getFullYear();

// Load everything once, update data saved by older versions, then draw the page.
async function startApp() {
  await loadState();

  // Update universities saved by older versions to the current format
  // (see migrateUniversity in section 7), and save them once if anything changed.
  // IDs are text. (Universities saved before had numbers: keep the same
  // value, as text, so their Timeline data and calendar events still match.)
  let idsChanged = false;
  state.universities.forEach(function (uni) {
    if (typeof uni.id !== "string") {
      uni.id = String(uni.id);
      idsChanged = true;
    }
  });
  if (state.universities.map(migrateUniversity).some(Boolean) || idsChanged) {
    save("universities");
  }
  TimelineStore.migrate();   // the same for timeline entries saved by the old planner
  TimelineStore.markExistingGenerated(state.universities.map(function (uni) { return uni.id; }));

  updateAiState();        // show whether AI search is on
  showAcademicProfile();  // fill in your academic profile
  showProfileTexts();     // and your profile texts
  showGlobeSettings();    // tick the globe's switches
  applyGlobeSettings();
  redrawEverything();
  zoomToAllPins();
}

// Other files (timeline.js) wait for this before drawing: appReady.then(...)
const appReady = startApp();
