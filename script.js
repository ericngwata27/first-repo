// =========================================================
// MY FUTURE PLANNER
// This file makes the page interactive. It is split into
// numbered sections so you can find things easily.
// =========================================================


// =========================================================
// 1. SAVING AND LOADING
// localStorage is a small storage space in your browser.
// Data saved there is still there after you close the page.
// It can only store text, so we turn our data into text with
// JSON.stringify, and back into data with JSON.parse.
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

// This is our main "data structure": a list (array) of university objects.
// Each university looks like this:
// {
//   id: 1712345678901,               a unique number
//   name: "University of Edinburgh",
//   course: "BSc Computer Science",
//   city: "Edinburgh",
//   country: "United Kingdom",
//   deadline: "2027-01-15",           year-month-day, or "" if not set
//   requirements: "AAA at A-level",
//   applicationInfo: "Apply through UCAS",
//   pros: "Beautiful city\nStrong CS department",
//   cons: "Cold winters",
//   lat: 55.94, lng: -3.18            where to put the pin on the map
// }
let universities = loadUniversities();

// The id of the university shown in the details panel (or null if none)
let selectedId = null;

// The id of the university being edited in the form (or null when adding)
let editingId = null;


// =========================================================
// 2. TABS
// Clicking a tab shows its section and hides the others.
// =========================================================

const tabButtons = document.querySelectorAll(".tab");

tabButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    // Highlight only the clicked tab
    tabButtons.forEach(function (b) {
      b.classList.remove("active");
    });
    button.classList.add("active");

    // Hide every section, then show the one this tab points to
    document.querySelectorAll(".tab-content").forEach(function (section) {
      section.hidden = true;
    });
    document.getElementById(button.dataset.tab).hidden = false;

    // A map that was hidden doesn't know its size, so we tell it to re-measure
    if (map) {
      map.invalidateSize();
    }
  });
});


// =========================================================
// 3. THE MAP (using the Leaflet library)
// Leaflet is loaded in index.html and gives us the "L" object.
// =========================================================

let map = null;
const markers = {}; // remembers each pin, so we can find it by university id

if (typeof L === "undefined") {
  // Leaflet loads from the internet. If you're offline, show a message instead.
  document.getElementById("map").innerHTML =
    '<p class="hint" style="padding:20px">The map needs an internet connection to load.</p>';
} else {
  // Create the map inside <div id="map"> and start with a view of the whole world.
  // setView takes [latitude, longitude] and a zoom level (2 = whole world).
  map = L.map("map", { worldCopyJump: true }).setView([25, 10], 2);

  // The map pictures ("tiles") come from CARTO, using OpenStreetMap data.
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);
}

// Make the pin shape. We use our own design (see .pin in style.css).
function makePinIcon(isSelected) {
  return L.divIcon({
    className: "", // stops Leaflet adding its default white square
    html: '<div class="pin' + (isSelected ? " selected" : "") + '"></div>',
    iconSize: [26, 26],
    iconAnchor: [13, 30], // the point of the pin that touches the location
  });
}

// Remove all pins and draw them again from the universities list
function drawPins() {
  if (!map) return;

  // Remove the old pins
  Object.keys(markers).forEach(function (id) {
    markers[id].remove();
    delete markers[id];
  });

  // Add a pin for each university
  universities.forEach(function (uni) {
    const marker = L.marker([uni.lat, uni.lng], {
      icon: makePinIcon(uni.id === selectedId),
      title: uni.name,
    }).addTo(map);

    // A small label that appears when you hover over the pin.
    // We build it as an element with textContent so it's always plain text.
    const label = document.createElement("span");
    label.textContent = uni.name;
    marker.bindTooltip(label, { direction: "top", offset: [0, -30] });

    // Clicking the pin shows the details panel
    marker.on("click", function () {
      selectUniversity(uni.id);
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
  map.fitBounds(points, { padding: [50, 50], maxZoom: 6 });
}


// =========================================================
// 4. FINDING A LOCATION'S COORDINATES ("geocoding")
// A map needs latitude and longitude, not "Edinburgh, UK".
// We ask a free service called Nominatim (from OpenStreetMap)
// to turn the words into numbers.
// =========================================================

async function searchLocation(query) {
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(query);
  const response = await fetch(url);
  const results = await response.json();

  if (results.length === 0) {
    return null; // nothing found
  }
  return { lat: Number(results[0].lat), lng: Number(results[0].lon) };
}

async function findCoordinates(name, city, country) {
  // First try to find the university itself, so the pin lands on the campus...
  const exact = await searchLocation(name + ", " + city + ", " + country);
  if (exact) return exact;

  // ...and if that doesn't work, just use the city
  return await searchLocation(city + ", " + country);
}


// =========================================================
// 5. THE ADD / EDIT FORM
// =========================================================

const form = document.getElementById("uni-form");
const formTitle = document.getElementById("form-title");
const formMessage = document.getElementById("form-message");
const submitButton = document.getElementById("submit-button");
const cancelEditButton = document.getElementById("cancel-edit");

// The names of the form fields, matched to the id of each input box
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

// Read everything typed in the form into one object
function readForm() {
  const data = {};
  for (const key in fields) {
    data[key] = document.getElementById(fields[key]).value.trim();
  }
  return data;
}

// Put a university's info into the form (used when editing)
function fillForm(uni) {
  for (const key in fields) {
    document.getElementById(fields[key]).value = uni[key] || "";
  }
}

function showFormMessage(text, type) {
  formMessage.textContent = text;
  formMessage.className = "form-message " + (type || "");
}

// Switch the form into "edit" mode for one university
function startEditing(id) {
  const uni = findUniversity(id);
  editingId = id;
  fillForm(uni);
  formTitle.textContent = "Edit " + uni.name;
  submitButton.textContent = "Save changes";
  cancelEditButton.hidden = false;
  showFormMessage("");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Switch the form back to "add" mode
function stopEditing() {
  editingId = null;
  form.reset();
  formTitle.textContent = "Add a university";
  submitButton.textContent = "Add to map";
  cancelEditButton.hidden = true;
}

cancelEditButton.addEventListener("click", function () {
  stopEditing();
  showFormMessage("");
});

// What happens when you press "Add to map" or "Save changes".
// "async" lets us wait for the location search to finish.
form.addEventListener("submit", async function (event) {
  event.preventDefault(); // stop the page from reloading

  const data = readForm();
  const oldUni = editingId ? findUniversity(editingId) : null;

  // Only look up the location again if it's new or has changed
  const placeChanged = !oldUni ||
    oldUni.name !== data.name || oldUni.city !== data.city || oldUni.country !== data.country;

  if (placeChanged) {
    submitButton.disabled = true;
    showFormMessage("Finding " + data.city + " on the map...");

    try {
      const coords = await findCoordinates(data.name, data.city, data.country);
      if (!coords) {
        showFormMessage("Couldn't find " + data.city + ", " + data.country + ". Check the spelling and try again.", "error");
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

  if (oldUni) {
    // Editing: copy the new info onto the existing university
    Object.assign(oldUni, data);
    showFormMessage("Saved changes to " + data.name + ".", "success");
  } else {
    // Adding: give it a unique id and add it to the list
    data.id = Date.now();
    universities.push(data);
    showFormMessage("Added " + data.name + " to the map.", "success");
  }

  const savedId = oldUni ? oldUni.id : data.id;
  saveUniversities();
  stopEditing();
  selectUniversity(savedId, true); // show it in the details panel and fly to it
});


// =========================================================
// 6. THE LIST OF UNIVERSITIES
// =========================================================

const uniList = document.getElementById("uni-list");
const emptyList = document.getElementById("empty-list");
const uniCount = document.getElementById("uni-count");

function findUniversity(id) {
  return universities.find(function (uni) {
    return uni.id === id;
  });
}

// Turn "2027-01-15" into a date. We split it ourselves so the
// date isn't shifted by time zones.
function parseDate(text) {
  const parts = text.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

// How many days from today until the deadline (negative = already passed)
function daysUntil(dateText) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round((parseDate(dateText) - today) / millisecondsPerDay);
}

// Make the small colored deadline label, e.g. "12 days left"
function makeDeadlineBadge(dateText) {
  const badge = document.createElement("span");
  badge.className = "deadline-badge";

  if (!dateText) {
    badge.textContent = "No deadline set";
    badge.classList.add("passed");
    return badge;
  }

  const days = daysUntil(dateText);
  if (days < 0) {
    badge.textContent = "Deadline passed";
    badge.classList.add("passed");
  } else if (days === 0) {
    badge.textContent = "Due today";
    badge.classList.add("soon");
  } else {
    badge.textContent = days + (days === 1 ? " day left" : " days left");
    if (days <= 30) badge.classList.add("soon"); // orange when it's close
  }
  return badge;
}

// Sort so the soonest deadline is first, and ones without a date go last
function sortByDeadline(list) {
  return list.slice().sort(function (a, b) {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return parseDate(a.deadline) - parseDate(b.deadline);
  });
}

function drawList() {
  uniList.innerHTML = ""; // clear the old list
  uniCount.textContent = universities.length;
  emptyList.hidden = universities.length > 0;

  sortByDeadline(universities).forEach(function (uni) {
    const item = document.createElement("li");

    // Each university is a button so you can click it (or use the keyboard)
    const button = document.createElement("button");
    button.className = "uni-item" + (uni.id === selectedId ? " selected" : "");

    const name = document.createElement("strong");
    name.textContent = uni.name;

    const sub = document.createElement("span");
    sub.className = "uni-sub";
    sub.textContent = uni.course + " · " + uni.city + ", " + uni.country;

    button.append(name, makeDeadlineBadge(uni.deadline), sub);
    button.addEventListener("click", function () {
      selectUniversity(uni.id, true);
    });

    item.appendChild(button);
    uniList.appendChild(item);
  });
}


// =========================================================
// 7. THE DETAILS PANEL
// =========================================================

const detailsPanel = document.getElementById("details-panel");
const emptyPanelHTML = detailsPanel.innerHTML; // remember the "Pick a university" message

// Small helper: create an element with some text inside it
function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

// A titled section like "ENTRY REQUIREMENTS" followed by the text
function makeDetailSection(title, text) {
  const section = makeElement("div", "detail-section");
  section.append(makeElement("h3", "", title), makeElement("p", "", text || "Not added yet"));
  return section;
}

// Turn "line one\nline two" into a bullet list
function makeBulletList(text) {
  const list = document.createElement("ul");
  const lines = (text || "").split("\n").filter(function (line) {
    return line.trim() !== "";
  });
  if (lines.length === 0) lines.push("None added");
  lines.forEach(function (line) {
    list.appendChild(makeElement("li", "", line));
  });
  return list;
}

function drawDetails() {
  const uni = findUniversity(selectedId);

  if (!uni) {
    detailsPanel.innerHTML = emptyPanelHTML;
    return;
  }

  detailsPanel.innerHTML = "";

  // Top part: location, name, course, deadline
  detailsPanel.append(
    makeElement("p", "details-location", uni.city + ", " + uni.country),
    makeElement("h2", "", uni.name),
    makeElement("p", "details-course", uni.course),
    makeDeadlineBadge(uni.deadline)
  );

  // Show the deadline date in a friendly format, e.g. "15 Jan 2027"
  const deadlineText = uni.deadline
    ? parseDate(uni.deadline).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "";

  detailsPanel.append(
    makeDetailSection("Application deadline", deadlineText),
    makeDetailSection("Entry requirements", uni.requirements),
    makeDetailSection("Application info", uni.applicationInfo)
  );

  // Pros and cons side by side
  const prosCons = makeElement("div", "pros-cons");
  const pros = makeElement("div", "detail-section pros");
  pros.append(makeElement("h3", "", "Pros"), makeBulletList(uni.pros));
  const cons = makeElement("div", "detail-section cons");
  cons.append(makeElement("h3", "", "Cons"), makeBulletList(uni.cons));
  prosCons.append(pros, cons);
  detailsPanel.appendChild(prosCons);

  // Edit and Delete buttons
  const actions = makeElement("div", "details-actions");
  const editButton = makeElement("button", "button", "Edit");
  const deleteButton = makeElement("button", "button danger", "Delete");

  editButton.addEventListener("click", function () {
    startEditing(uni.id);
  });

  deleteButton.addEventListener("click", function () {
    // confirm() shows a pop-up with OK and Cancel. It returns true for OK.
    if (!confirm("Delete " + uni.name + "? This can't be undone.")) return;

    universities = universities.filter(function (u) {
      return u.id !== uni.id;
    });
    if (editingId === uni.id) stopEditing();
    selectedId = null;
    saveUniversities();
    redrawEverything();
  });

  actions.append(editButton, deleteButton);
  detailsPanel.appendChild(actions);
}

// Select a university: highlight it everywhere and show its details.
// If flyToIt is true, the map smoothly moves to its pin.
function selectUniversity(id, flyToIt) {
  selectedId = id;
  redrawEverything();

  const uni = findUniversity(id);
  if (map && uni && flyToIt) {
    map.flyTo([uni.lat, uni.lng], 6, { duration: 1 });
  }
}

// Update the pins, the list and the details panel all at once
function redrawEverything() {
  drawPins();
  drawList();
  drawDetails();
}


// =========================================================
// 8. THE PROFILE TAB
// Each text box saves itself every time you type.
// =========================================================

const profileFields = document.querySelectorAll(".profile-field");

// Update the small line under a text box, e.g. "1,234 / 4,000 characters · Saved"
function updateProfileStatus(textarea, justSaved) {
  const status = document.querySelector('.profile-status[data-for="' + textarea.id + '"]');
  const length = textarea.value.length;
  const limit = status.dataset.limit ? Number(status.dataset.limit) : null;

  let text = length.toLocaleString() + " characters";
  if (limit) {
    text = length.toLocaleString() + " / " + limit.toLocaleString() + " characters";
  }
  if (justSaved) {
    text += " · Saved";
  }

  status.textContent = text;
  status.classList.toggle("over-limit", limit !== null && length > limit);
}

profileFields.forEach(function (textarea) {
  const storageKey = "future-planner-profile-" + textarea.dataset.key;

  // Load what was saved before
  try {
    textarea.value = localStorage.getItem(storageKey) || "";
  } catch (error) {
    // storage blocked; just start empty
  }
  updateProfileStatus(textarea, false);

  // Save every time the text changes
  textarea.addEventListener("input", function () {
    try {
      localStorage.setItem(storageKey, textarea.value);
    } catch (error) {
      // storage blocked; nothing we can do
    }
    updateProfileStatus(textarea, true);
  });
});

// Copy buttons: copy the text box's contents to the clipboard
document.querySelectorAll(".copy-button").forEach(function (button) {
  button.addEventListener("click", async function () {
    const textarea = document.getElementById(button.dataset.target);

    try {
      await navigator.clipboard.writeText(textarea.value);
    } catch (error) {
      // Older way of copying, used if the newer one isn't allowed
      textarea.select();
      document.execCommand("copy");
    }

    // Show "Copied!" for 1.5 seconds, then go back to "Copy"
    button.textContent = "Copied!";
    setTimeout(function () {
      button.textContent = "Copy";
    }, 1500);
  });
});


// =========================================================
// 9. START THE APP
// Draw everything that was saved last time.
// =========================================================

redrawEverything();
zoomToAllPins();
