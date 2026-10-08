// =========================================================
// MY FUTURE PLANNER
// This file makes the page interactive. It's split into
// numbered sections so you can find things easily:
//
//   1. Saving and loading
//   2. Small helpers
//   3. Deadlines (how close, which color)
//   4. Tabs
//   5. The map
//   6. Finding a location's coordinates
//   7. The form (with validation)
//   8. The university list
//   9. The details panel
//  10. Summary stats
//  11. Toasts (pop-up messages)
//  12. The Profile tab
//  13. Start the app
// =========================================================


// =========================================================
// 1. SAVING AND LOADING
// localStorage is a small storage space in your browser that
// keeps data after you close the page. It only stores text,
// so we convert with JSON.stringify (data -> text) and
// JSON.parse (text -> data).
// =========================================================

const STORAGE_KEY = "future-planner-universities";

function loadUniversities() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    return []; // if anything goes wrong, start with an empty list
  }
}

function saveUniversities() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(universities));
  } catch (error) {
    // Some browsers block storage (for example in private mode).
    // The page still works, it just won't remember things.
  }
}

// Our main data: a list of university objects. One looks like this:
// {
//   id: 1712345678901,                 a unique number
//   name: "University of Edinburgh",
//   course: "BSc Computer Science",
//   city: "Edinburgh",
//   country: "United Kingdom",
//   deadline: "2027-01-15",             year-month-day, or "" if not set
//   requirements: "AAA at A-level",
//   applicationInfo: "Apply through UCAS",
//   pros: "Beautiful city\nStrong CS department",
//   cons: "Cold winters",
//   lat: 55.94, lng: -3.18              where the pin goes on the map
// }
let universities = loadUniversities();

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

function findUniversity(id) {
  return universities.find(function (uni) {
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

// The small colored label, e.g. "● 12 days left"
function makeDeadlineChip(dateText) {
  const status = getDeadlineStatus(dateText);
  return makeElement("span", "chip level-" + status.level, status.label);
}

// Soonest deadline first; universities without a date go last
function sortByDeadline(list) {
  return list.slice().sort(function (a, b) {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return parseDate(a.deadline) - parseDate(b.deadline);
  });
}


// =========================================================
// 4. TABS
// =========================================================

const tabButtons = document.querySelectorAll(".tab");

tabButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    // Highlight only the clicked tab
    tabButtons.forEach(function (b) {
      b.classList.remove("is-active");
    });
    button.classList.add("is-active");

    // Hide every section, then show the one this tab points to
    document.querySelectorAll(".tab-content").forEach(function (section) {
      section.hidden = true;
    });
    document.getElementById(button.dataset.tab).hidden = false;

    // A map that was hidden doesn't know its size, so we ask it to re-measure
    if (map) map.invalidateSize();
  });
});


// =========================================================
// 5. THE MAP (using the Leaflet library)
// =========================================================

let map = null;
const markers = {}; // each pin, stored by university id

// The graduation cap drawing used inside each pin
const CAP_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/>' +
  '<path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>';

if (typeof L === "undefined") {
  // Leaflet loads from the internet. If you're offline, show a message instead.
  const message = makeElement("p", "muted", "The map needs an internet connection to load.");
  message.style.padding = "24px";
  document.getElementById("map").appendChild(message);
} else {
  // Start with a view of the whole world: [latitude, longitude], zoom level 2
  map = L.map("map", { worldCopyJump: true, zoomControl: false }).setView([30, 10], 2);

  // Zoom buttons in the bottom-right, out of the details panel's way
  L.control.zoom({ position: "bottomright" }).addTo(map);

  // Map pictures ("tiles") from Esri. Free, and no API key needed.
  const esriTiles = "https://server.arcgisonline.com/ArcGIS/rest/services/";

  const streetMap = L.tileLayer(esriTiles + "World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors",
    maxZoom: 19,
    className: "tiles-street", // lets style.css soften the colors
  });

  const satelliteMap = L.tileLayer(esriTiles + "World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  });

  streetMap.addTo(map);

  // Button to switch between street map and satellite, in the top-left corner
  L.control.layers({ "Street map": streetMap, "Satellite": satelliteMap }, null, { position: "topleft" }).addTo(map);
}

// Build a pin. Its color comes from the deadline.
function makePinIcon(uni, isSelected) {
  const level = getDeadlineStatus(uni.deadline).level;
  return L.divIcon({
    className: "", // stops Leaflet adding its default white square
    html: '<div class="pin level-' + level +
      (isSelected ? " is-selected" : "") +
      (uni.id === newestId ? " is-new" : "") + '">' + CAP_ICON + "</div>",
    iconSize: [34, 34],
    iconAnchor: [17, 40], // the tip of the pin touches the location
  });
}

// Remove all pins and draw them again from the universities list
function drawPins() {
  if (!map) return;

  Object.keys(markers).forEach(function (id) {
    markers[id].remove();
    delete markers[id];
  });

  universities.forEach(function (uni) {
    const marker = L.marker([uni.lat, uni.lng], {
      icon: makePinIcon(uni, uni.id === selectedId),
      riseOnHover: true,                    // hovered pin comes to the front
      zIndexOffset: uni.id === selectedId ? 1000 : 0,
    }).addTo(map);

    // Tooltip shown on hover: name, plus city underneath
    const tooltip = document.createElement("div");
    tooltip.append(makeElement("strong", "", uni.name), makeElement("span", "", uni.city + ", " + uni.country));
    marker.bindTooltip(tooltip, { direction: "top", offset: [0, -42], className: "pin-tooltip" });

    marker.on("click", function () {
      selectUniversity(uni.id, false);
    });

    markers[uni.id] = marker;
  });
}

// Zoom the map so every pin fits on screen
function zoomToAllPins() {
  if (!map || universities.length === 0) return;

  const points = universities.map(function (uni) {
    return [uni.lat, uni.lng];
  });
  map.fitBounds(points, { padding: [60, 60], maxZoom: 6 });
}


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
// 7. THE FORM (with validation)
// =========================================================

const form = document.getElementById("uni-form");
const formCard = document.getElementById("form-card");
const formTitle = document.getElementById("form-title");
const formSubtitle = document.getElementById("form-subtitle");
const formMessage = document.getElementById("form-message");
const submitButton = document.getElementById("submit-button");
const submitLabel = document.getElementById("submit-label");
const cancelEditButton = document.getElementById("cancel-edit");

// Which data property goes with which input box (by its id)
const fields = {
  name: "name",
  course: "course",
  city: "city",
  country: "country",
  deadline: "deadline",
  requirements: "requirements",
  applicationInfo: "application-info",
  pros: "pros",
  cons: "cons",
};

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
  if (data.city.length < 2) problem("city", "Enter the city the university is in.");
  if (data.country.length < 2) problem("country", "Enter the country.");

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
  fillForm(uni);
  clearAllErrors();
  showFormMessage("");

  formTitle.textContent = "Edit university";
  formSubtitle.textContent = "Changing " + uni.name + ".";
  submitLabel.textContent = "Save changes";
  cancelEditButton.hidden = false;
  formCard.classList.add("is-editing");

  formCard.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("name").focus({ preventScroll: true });
}

function stopEditing() {
  editingId = null;
  form.reset();
  clearAllErrors();

  formTitle.textContent = "Add a university";
  formSubtitle.textContent = "We'll find it on the map for you.";
  submitLabel.textContent = "Add to map";
  cancelEditButton.hidden = true;
  formCard.classList.remove("is-editing");
}

cancelEditButton.addEventListener("click", function () {
  stopEditing();
  showFormMessage("");
});

// ----- Submitting the form -----
// "async" lets us wait for the location search to finish.
form.addEventListener("submit", async function (event) {
  event.preventDefault(); // stop the page from reloading

  const data = readForm();
  if (!validateForm(data)) return;

  const oldUni = editingId ? findUniversity(editingId) : null;

  // Only look up the location if it's new or has changed
  const placeChanged = !oldUni ||
    oldUni.name !== data.name || oldUni.city !== data.city || oldUni.country !== data.country;

  if (placeChanged) {
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
  } else {
    data.lat = oldUni.lat;
    data.lng = oldUni.lng;
  }

  let savedId;
  if (oldUni) {
    Object.assign(oldUni, data);       // copy the changes onto the existing one
    savedId = oldUni.id;
    showToast("Saved changes to " + data.name);
  } else {
    data.id = Date.now();              // a unique id
    universities.push(data);
    savedId = data.id;
    newestId = data.id;                // so its card animates in
    showToast(data.name + " added to your map");
  }

  saveUniversities();
  stopEditing();
  showFormMessage("");
  selectUniversity(savedId, true);     // open its details and fly the map to it
});


// =========================================================
// 8. THE UNIVERSITY LIST
// =========================================================

const uniList = document.getElementById("uni-list");
const emptyList = document.getElementById("empty-list");

function drawList() {
  uniList.innerHTML = "";
  emptyList.hidden = universities.length > 0;

  sortByDeadline(universities).forEach(function (uni) {
    const status = getDeadlineStatus(uni.deadline);

    // The card. Its class sets the colored strip on the left.
    const card = makeElement("li", "uni-card level-" + status.level);
    card.dataset.id = uni.id;
    if (uni.id === selectedId) card.classList.add("is-selected");
    if (uni.id === newestId) card.classList.add("is-new");

    // The clickable main part: name, course, location, deadline
    const main = makeElement("button", "uni-card-main");
    main.title = "Show on map";

    const meta = makeElement("div", "uni-meta");
    const course = makeElement("span");
    course.append(makeIcon("book-open"), uni.course);
    const place = makeElement("span");
    place.append(makeIcon("map-pin"), uni.city + ", " + uni.country);
    meta.append(course, place);

    const deadline = makeElement("div", "uni-deadline");
    deadline.append(makeDeadlineChip(uni.deadline));
    if (uni.deadline) deadline.append(formatDate(uni.deadline));

    main.append(makeElement("span", "uni-name", uni.name), meta, deadline);
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
    universities = universities.filter(function (u) {
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
// 9. THE DETAILS PANEL
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

// A section with a small heading and some text
function makePanelSection(title, iconName, text) {
  const section = makeElement("div", "panel-section");
  const heading = makeElement("h4", "eyebrow");
  heading.append(makeIcon(iconName), title);
  const body = text ? makeElement("p", "", text) : makeElement("p", "empty-text", "Not added yet");
  section.append(heading, body);
  return section;
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

  // Deadline chip at the top
  const statusRow = makeElement("div", "panel-status");
  statusRow.append(makeDeadlineChip(uni.deadline));

  // Key facts
  const facts = makeElement("div", "panel-facts");
  facts.append(
    makeFact("map-pin", uni.city + ", " + uni.country),
    makeFact("calendar", uni.deadline ? "Deadline " + formatDate(uni.deadline) : "No deadline set")
  );

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
  actions.append(editButton, deleteButton);

  panelBody.append(
    statusRow,
    makeElement("h2", "panel-title", uni.name),
    makeElement("p", "panel-course", uni.course),
    facts,
    makePanelSection("Entry requirements", "award", uni.requirements),
    makePanelSection("How to apply", "file-text", uni.applicationInfo),
    prosCons,
    actions
  );
  detailsPanel.scrollTop = 0;
}

// Select a university: highlight it everywhere and show its details.
// If flyToIt is true, the map glides over to its pin.
function selectUniversity(id, flyToIt) {
  selectedId = id;
  redrawEverything();

  const uni = findUniversity(id);
  if (!uni) return;

  if (map && flyToIt) {
    map.flyTo([uni.lat, uni.lng], 6, { duration: 0.9 });
  }

  // On small screens the panel is under the map, so scroll to it
  if (window.innerWidth <= 960 && flyToIt) {
    document.querySelector(".map-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}


// =========================================================
// 10. SUMMARY STATS
// =========================================================

function drawStats() {
  document.getElementById("stat-total").textContent = universities.length;

  // Count different countries (ignoring capital letters)
  const countries = new Set(universities.map(function (uni) {
    return uni.country.toLowerCase();
  }));
  document.getElementById("stat-countries").textContent = countries.size;

  // The soonest deadline that hasn't passed yet
  const upcoming = sortByDeadline(universities).find(function (uni) {
    return uni.deadline && daysUntil(uni.deadline) >= 0;
  });
  document.getElementById("stat-next").textContent = upcoming
    ? upcoming.name + " · " + getDeadlineStatus(upcoming.deadline).label
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
// 11. TOASTS (small messages that pop up in the corner)
// =========================================================

function showToast(message, iconName) {
  const toast = makeElement("div", "toast");
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
// 12. THE PROFILE TAB
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

document.querySelectorAll(".profile-field").forEach(function (textarea) {
  const storageKey = "future-planner-profile-" + textarea.dataset.key;

  // Load what was saved before
  try {
    textarea.value = localStorage.getItem(storageKey) || "";
  } catch (error) {
    // storage blocked: start empty
  }
  updateProfileStatus(textarea, false);

  // Save on every change
  textarea.addEventListener("input", function () {
    try {
      localStorage.setItem(storageKey, textarea.value);
    } catch (error) {
      // storage blocked: nothing we can do
    }
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
// 13. START THE APP
// =========================================================

document.getElementById("year").textContent = new Date().getFullYear();
redrawEverything();
zoomToAllPins();
