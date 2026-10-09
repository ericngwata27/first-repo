// =========================================================
// PLANMYFUTURE: helpers.js
// Small tools every other file uses: making elements, tabs, toasts.
//
// Sections: 2. Small helpers, 4. Tabs, 12. Toasts
// (The site's JavaScript is split into files that load in this order:
//  store.js, helpers.js, dates.js, globe.js, autofill.js, universities.js,
//  profile.js, auth.js, sync.js, main.js, timeline.js. The section numbers run across all of them.)
// =========================================================

// ----- Page state (which university is selected or being edited) -----
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
