// =========================================================
// MY FUTURE PLANNER: profile.js
// The Profile tab: your texts, your academic profile, and Export / Import.
//
// Sections: 13. The Profile tab, 14. Export and import
// (The site's JavaScript is split into files that load in this order:
//  store.js, helpers.js, dates.js, globe.js, autofill.js, universities.js,
//  profile.js, main.js, timeline.js. The section numbers run across all of them.)
// =========================================================

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
// 14. EXPORT AND IMPORT YOUR DATA
// One JSON file with everything you've saved (see DATA_MODEL.md,
// "Export file"). Use it as a backup, to move to another browser,
// and later to move your data into the backend.
// The API key and the search cache are NEVER put in the file.
// =========================================================

const EXPORT_VERSION = 1;   // raise this if the file's shape ever changes

// Save text as a file in the Downloads folder
function downloadFile(text, fileName, type) {
  const file = new Blob([text], { type: type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
}

// Everything that goes in the file (never the API key)
function buildExport() {
  return {
    app: "my-future-planner",
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    universities: state.universities,
    timeline: state.timeline,
    profile: state.profile,
    academicProfile: state.academicProfile,
    settings: { globe: state.settings.globe },
  };
}

document.getElementById("export-data").addEventListener("click", function () {
  const today = new Date().toISOString().slice(0, 10);
  const fileName = "my-future-planner-" + today + ".json";
  downloadFile(JSON.stringify(buildExport(), null, 2), fileName, "application/json");
  showToast("Saved your data to " + fileName + ". Keep it somewhere safe.", "download");
});

// True for a plain object like { a: 1 } (not a list, not null)
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Check an imported file and keep only the parts we understand.
// Throws an Error with a friendly message if it isn't our file.
function readExportFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error("That file isn't a My Future Planner export (it isn't valid JSON).");
  }
  if (!isPlainObject(data) || data.app !== "my-future-planner" || !Array.isArray(data.universities)) {
    throw new Error("That file isn't a My Future Planner export.");
  }
  if (Number(data.version) > EXPORT_VERSION) {
    throw new Error("That file was made by a newer version of the planner. Reload the page and try again.");
  }

  // Keep only text for the profile and academic profile
  function onlyText(object, keys) {
    const result = {};
    keys.forEach(function (key) {
      if (isPlainObject(object) && typeof object[key] === "string") result[key] = object[key];
    });
    return result;
  }
  const globe = {};
  const savedGlobe = isPlainObject(data.settings) && isPlainObject(data.settings.globe) ? data.settings.globe : {};
  ["spin", "borders", "arcs", "glow"].forEach(function (key) {
    if (typeof savedGlobe[key] === "boolean") globe[key] = savedGlobe[key];
  });

  return {
    universities: data.universities.filter(function (uni) {
      return isPlainObject(uni) && typeof uni.name === "string" && uni.name.trim() !== "";
    }).map(function (uni) {
      if (uni.id === undefined || uni.id === null || uni.id === "") uni.id = newId();
      return uni;
    }),
    timeline: isPlainObject(data.timeline) ? data.timeline : {},
    profile: onlyText(data.profile, PROFILE_KEYS),
    academicProfile: onlyText(data.academicProfile, ["intendedStartDate", "currentGradeLevel", "schoolSystem", "countryOfResidence"]),
    globe: globe,
  };
}

const importInput = document.getElementById("import-file");

document.getElementById("import-data").addEventListener("click", function () {
  importInput.value = "";   // so choosing the same file twice still works
  importInput.click();
});

importInput.addEventListener("change", async function () {
  const file = importInput.files[0];
  if (!file) return;

  let imported;
  try {
    imported = readExportFile(await file.text());
  } catch (error) {
    showToast(error.message, "circle-alert");
    return;
  }

  // Importing replaces what's here, so ask first
  const count = state.universities.length;
  if (count > 0 && !confirm("Importing replaces the " + count + (count === 1 ? " university" : " universities") +
      " and everything else saved in this browser with the file's data. Your API key stays. Continue?")) {
    return;
  }

  state.universities = imported.universities;
  state.timeline = imported.timeline;
  state.profile = imported.profile;
  state.academicProfile = imported.academicProfile;
  state.settings.globe = imported.globe;
  selectedId = null;
  upgradeOldData();   // in case the file came from an older version

  const saved = ["universities", "timeline", "profile", "academicProfile", "globeSettings"].map(save);
  showEverything();
  document.dispatchEvent(new CustomEvent("universities-changed"));   // redraw the Timeline

  if (saved.every(Boolean)) {
    const n = state.universities.length;
    showToast("Imported " + n + (n === 1 ? " university" : " universities") + " and your profile.", "upload");
  } else {
    showToast("Imported, but your browser blocked saving. Your data will be lost when you close this page.", "circle-alert");
  }
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
