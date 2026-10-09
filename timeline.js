// =========================================================
// MY FUTURE PLANNER - APPLICATION TIMELINE
//
// This file builds the Timeline tab. It loads after script.js
// and reuses things from it: the `universities` list, DataStore,
// STORAGE_KEYS, parseDate, daysUntil, formatDate, sortByDeadline,
// makeElement, makeIcon, refreshIcons, showToast, intakeLabel and
// the application date helpers (itemText, itemEndDate, sortDateItems,
// cleanDateItem, DATE_TYPES).
//
// The Timeline SHOWS you information. It doesn't choose for you:
// every date auto-fill found is listed, you pick a target deadline
// (if you want one) and drag the slider to your planned date.
//
// Sections in this file:
//   1. Settings (milestones and statuses)
//   2. Saving and loading timeline data
//   3. Date helpers
//   4. The dates shown on a card
//   5. Timeline cards
//   6. The timeline bar with a slider
//   7. The summary at the top
//   8. Calendar export (.ics files)
//   9. Drawing the page
// =========================================================


// =========================================================
// 1. SETTINGS
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

const STATUSES = [
  { key: "researching", label: "Researching" },
  { key: "applying",    label: "Applying" },
  { key: "submitted",   label: "Submitted" },
  { key: "offer",       label: "Offer" },
  { key: "rejected",    label: "Rejected" },
];

// Once an application is in one of these states, deadlines no longer matter
const FINISHED_STATUSES = ["submitted", "offer", "rejected"];

// Names for the date types (in the list and the "Add date" form)
const DATE_TYPE_LABELS = {
  deadline: "Deadline",
  opens: "Applications open",
  decision: "Decision / results",
  start: "Course starts",
  other: "Other",
};


// =========================================================
// 2. SAVING AND LOADING TIMELINE DATA
//
// Timeline data is saved separately from the universities, one entry
// per university (found by the university's id). One entry looks like this:
// {
//   plannedDate: "2026-11-10",     your planned submission date, or ""
//   status: "applying",            one of the STATUSES keys
//   targetId: "deadline|paris|round 1|2026-11-18",
//                                  the deadline you chose, or "" for none
//   manualDates: [                 dates you added yourself
//     { id: "m1712345678901", label: "Scholarship", campus: "", date: "2027-01-10", type: "deadline" }
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
// =========================================================

const TimelineStore = {
  readAll: function () {
    return DataStore.read(STORAGE_KEYS.timeline, {});
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
      manualDates: Array.isArray(saved.manualDates) ? saved.manualDates : [],
      removedDates: Array.isArray(saved.removedDates) ? saved.removedDates : [],
      milestones: milestones,
      updatedAt: saved.updatedAt || null,
    };
  },

  save: function (uniId, entry) {
    const all = TimelineStore.readAll();
    entry.updatedAt = Date.now();
    all[uniId] = entry;
    DataStore.write(STORAGE_KEYS.timeline, all);
  },

  // Remove entries for universities that have been deleted
  removeMissing: function (existingIds) {
    const all = TimelineStore.readAll();
    let changed = false;
    Object.keys(all).forEach(function (id) {
      if (existingIds.indexOf(Number(id)) === -1) {
        delete all[id];
        changed = true;
      }
    });
    if (changed) DataStore.write(STORAGE_KEYS.timeline, all);
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

    if (changed) DataStore.write(STORAGE_KEYS.timeline, all);
  },
};


// =========================================================
// 3. DATE HELPERS
// Dates are kept as "YYYY-MM-DD" text, like the rest of the site.
// Text dates in this format can be compared directly ("2026-11-01" < "2026-12-01").
// =========================================================

const DAY = 24 * 60 * 60 * 1000;

// A date -> "2026-10-08"
function toDateText(date) {
  return date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0");
}

function todayText() {
  return toDateText(new Date());
}

// "2026-10-08" plus 3 days -> "2026-10-11" (use a negative number to go back)
function addDays(dateText, days) {
  const date = parseDate(dateText);
  date.setDate(date.getDate() + days);
  return toDateText(date);
}

// Number of days from one date to another
function daysBetween(fromText, toText) {
  return Math.round((parseDate(toText) - parseDate(fromText)) / DAY);
}

function laterDate(a, b) { return a > b ? a : b; }

// "2026-10-08" -> "8 Oct"
function shortDate(dateText) {
  return parseDate(dateText).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// "in 5 days", "today", "3 days ago"
function relativeDays(dateText) {
  const days = daysUntil(dateText);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 0) return "in " + days + " days";
  return Math.abs(days) + (days === -1 ? " day ago" : " days ago");
}

function isDateText(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

// A date that has gone completely (a month counts as gone once it's over)
function isPastItem(item) {
  return itemEndDate(item) < todayText();
}

// Where a date sits on the timeline bar. A month on its own goes in the middle.
function itemBarDate(item) {
  return item.approximate ? item.date + "-15" : item.date;
}


// =========================================================
// 4. THE DATES SHOWN ON A CARD
// Every date auto-fill found, the deadline from the Universities tab,
// and the dates you added. Dates you deleted are left out.
// Each one gets an id so it can be chosen or deleted.
// =========================================================

function autoDateId(item) {
  return [item.type, item.campus, item.label, item.date].join("|").toLowerCase();
}

function cardDates(uni, entry) {
  const dates = [];

  (uni.applicationDates || []).forEach(function (raw) {
    const item = cleanDateItem(raw);
    if (!item) return;
    item.id = autoDateId(item);
    if (!dates.some(function (d) { return d.id === item.id; })) dates.push(item);
  });

  // The deadline on the Universities tab, if it isn't in the list already
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


// =========================================================
// 5. TIMELINE CARDS
// One card per university. When something changes, only the
// parts that depend on it are redrawn (so the box you're typing
// in keeps its place).
// =========================================================

// Give dates to the milestones, counting back from YOUR planned date.
// If there's less time than ideal, every step is squeezed in proportion.
// Only counted-back dates (or empty ones) are changed: dates you typed
// yourself are never moved.
function scheduleMilestones(entry, submitDate) {
  const today = todayText();
  const window = Math.max(daysBetween(today, submitDate), 0);
  let longest = 0;
  MILESTONES.forEach(function (milestone) {
    if (!entry.milestones[milestone.key].done) longest = Math.max(longest, milestone.daysBefore);
  });
  const squeeze = longest > window && longest > 0 ? window / longest : 1;

  MILESTONES.forEach(function (milestone) {
    const state = entry.milestones[milestone.key];
    if (state.done || (state.date && !state.auto)) return;
    state.date = laterDate(today, addDays(submitDate, -Math.round(milestone.daysBefore * squeeze)));
    state.auto = true;
  });
}

function buildCard(uni) {
  const entry = TimelineStore.get(uni.id);
  const idPrefix = "tl-" + uni.id + "-";

  const card = makeElement("article", "card tl-card");
  card.dataset.id = uni.id;

  function save() {
    TimelineStore.save(uni.id, entry);
    drawSummary();
  }

  // Save the change, then redraw the parts of the card that show it
  function saveAndRefresh() {
    save();
    refresh();
  }

  // Set your planned date (from the slider or the date box)
  function setPlannedDate(dateText) {
    entry.plannedDate = isDateText(dateText) ? dateText : "";
    if (entry.plannedDate) {
      scheduleMilestones(entry, entry.plannedDate);   // count back from your date
      updateMilestoneInputs();
    }
  }

  // ----- Header: name, course and status -----
  const header = makeElement("div", "tl-header");
  const titles = makeElement("div", "tl-titles");
  titles.append(
    makeElement("h3", "", uni.name),
    makeElement("p", "muted", uni.course + " · " + uni.city + ", " + uni.country +
      (uni.intake ? " · For " + intakeLabel(uni.intake) + " entry" : ""))
  );

  const statusSelect = document.createElement("select");
  statusSelect.className = "status-select";
  statusSelect.id = idPrefix + "status";
  statusSelect.setAttribute("aria-label", "Application status for " + uni.name);
  STATUSES.forEach(function (status) {
    const option = document.createElement("option");
    option.value = status.key;
    option.textContent = status.label;
    statusSelect.append(option);
  });
  statusSelect.value = entry.status;
  statusSelect.addEventListener("change", function () {
    entry.status = statusSelect.value;
    saveAndRefresh();
  });

  header.append(titles, statusSelect);

  // ----- Left side: the dates, then the timeline bar -----
  const left = makeElement("div", "tl-left");

  const datesHeading = makeElement("h4", "eyebrow", "Application dates");
  const dateList = makeElement("ul", "tl-date-list");
  const dateTools = makeElement("div", "tl-date-tools");   // add / restore buttons and the add form

  // One short line, only for rolling admissions
  const rollingLine = makeElement("p", "tl-rolling");
  rollingLine.append(makeIcon("info"), "Rolling admissions: earlier is better.");
  rollingLine.hidden = !uni.rolling;

  // Planned submission date: the slider and the date box
  const planBox = makeElement("div", "tl-plan");
  const plannedRow = makeElement("div", "tl-planned-row");
  const plannedLabel = makeElement("label", "tl-date-label", "Planned submission");
  plannedLabel.htmlFor = idPrefix + "planned";
  const plannedInput = document.createElement("input");
  plannedInput.type = "date";
  plannedInput.id = idPrefix + "planned";
  plannedInput.value = entry.plannedDate;
  plannedInput.addEventListener("change", function () {
    setPlannedDate(plannedInput.value);
    saveAndRefresh();
  });
  plannedRow.append(plannedLabel, plannedInput);

  const barHolder = makeElement("div");
  const warning = makeElement("p", "tl-warning");
  warning.setAttribute("role", "status");
  planBox.append(plannedRow, barHolder, warning);

  left.append(datesHeading, dateList, dateTools, rollingLine, planBox);

  // Show a small warning if your planned date is after the deadline you chose
  function updateWarning(dateText, target) {
    const late = Boolean(target && dateText && dateText > itemEndDate(target));
    warning.hidden = !late;
    warning.innerHTML = "";
    if (late) {
      warning.append(makeIcon("triangle-alert"), "Your planned date is after your target deadline (" + itemText(target) + ").");
      refreshIcons();
    }
  }

  // The list of dates
  function drawDates(dates, target) {
    dateList.innerHTML = "";
    if (dates.length === 0) {
      dateList.append(makeElement("li", "tl-date-empty muted", "No application dates found yet. Add one below."));
    }

    dates.forEach(function (item) {
      const isDeadline = item.type === "deadline";
      const isTarget = Boolean(target && target.id === item.id);
      const row = makeElement("li", "tl-date-item tl-type-" + item.type +
        (isPastItem(item) ? " is-past" : "") + (isTarget ? " is-target" : ""));

      // Deadlines are buttons: click to choose one as your target, click again to unselect
      const main = makeElement(isDeadline ? "button" : "span", "tl-date-main");
      main.append(makeElement("i", "tl-dot"), makeElement("span", "tl-date-text", itemText(item)));
      if (isDeadline) {
        main.type = "button";
        main.setAttribute("aria-pressed", String(isTarget));
        main.title = isTarget ? "Your target. Click to unselect." : "Click to make this your target deadline";
        main.addEventListener("click", function () {
          entry.targetId = isTarget ? "" : item.id;
          saveAndRefresh();
        });
        if (isTarget) main.append(makeElement("span", "tl-target-badge", "Target"));
      } else {
        main.append(makeElement("span", "tl-type-tag", DATE_TYPE_LABELS[item.type]));
      }
      row.append(main);

      if (item.sourceUrl) {
        const source = document.createElement("a");
        source.className = "tl-date-source";
        source.href = item.sourceUrl;
        source.target = "_blank";
        source.rel = "noopener noreferrer";
        source.title = "Open the page this date came from";
        source.setAttribute("aria-label", "Source for " + itemText(item));
        source.append(makeIcon("external-link"));
        row.append(source);
      }

      const remove = makeElement("button", "tl-date-remove");
      remove.type = "button";
      remove.title = "Delete this date";
      remove.setAttribute("aria-label", "Delete " + itemText(item));
      remove.append(makeIcon("x"));
      remove.addEventListener("click", function () {
        if (item.manual) {
          entry.manualDates = entry.manualDates.filter(function (d) { return d.id !== item.id; });
        } else {
          entry.removedDates.push(item.id);
        }
        if (entry.targetId === item.id) entry.targetId = "";
        saveAndRefresh();
      });
      row.append(remove);

      dateList.append(row);
    });

    // A short hint while no deadline is chosen
    if (!target && dates.some(function (item) { return item.type === "deadline"; })) {
      dateList.append(makeElement("li", "tl-date-hint", "Tap a deadline to make it your target."));
    }
  }

  // "Add date" and "Restore deleted dates"
  function drawDateTools() {
    dateTools.innerHTML = "";

    const addButton = makeElement("button", "tl-add-date");
    addButton.type = "button";
    addButton.append(makeIcon("plus"), "Add date");
    dateTools.append(addButton);

    if (entry.removedDates.length > 0) {
      const restore = makeElement("button", "tl-add-date");
      restore.type = "button";
      restore.append(makeIcon("rotate-ccw"),
        "Restore " + entry.removedDates.length + (entry.removedDates.length === 1 ? " deleted date" : " deleted dates"));
      restore.addEventListener("click", function () {
        entry.removedDates = [];
        saveAndRefresh();
      });
      dateTools.append(restore);
    }

    // A small form for adding a date yourself
    const addForm = makeElement("div", "tl-add-form");
    addForm.hidden = true;
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "e.g. Round 2";
    nameInput.maxLength = 60;
    nameInput.setAttribute("aria-label", "Date name");
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.setAttribute("aria-label", "Date");
    const typeSelect = document.createElement("select");
    typeSelect.setAttribute("aria-label", "Type of date");
    DATE_TYPES.forEach(function (type) {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = DATE_TYPE_LABELS[type];
      typeSelect.append(option);
    });
    const saveButton = makeElement("button", "button button-small", "Add");
    saveButton.type = "button";
    saveButton.addEventListener("click", function () {
      if (!isDateText(dateInput.value)) {
        showToast("Pick the date first.", "circle-alert");
        return;
      }
      entry.manualDates.push({ id: "m" + Date.now(), label: nameInput.value.trim() || DATE_TYPE_LABELS[typeSelect.value],
        campus: "", date: dateInput.value, type: typeSelect.value });
      saveAndRefresh();
    });
    const cancelButton = makeElement("button", "button button-small", "Cancel");
    cancelButton.type = "button";
    cancelButton.addEventListener("click", function () {
      addForm.hidden = true;
      addButton.hidden = false;
    });
    addForm.append(nameInput, dateInput, typeSelect, saveButton, cancelButton);

    addButton.addEventListener("click", function () {
      addButton.hidden = true;
      addForm.hidden = false;
      nameInput.focus();
    });
    dateTools.append(addForm);
  }

  // ----- Right side: the milestone checklist -----
  const right = makeElement("div", "tl-right");
  const milestoneHeader = makeElement("div", "tl-milestone-header");
  const progressText = makeElement("span", "tl-progress-text");
  milestoneHeader.append(makeElement("h4", "eyebrow", "Milestones"), progressText);

  const progressBar = makeElement("div", "meter");
  const progressFill = makeElement("div", "meter-fill");
  progressBar.append(progressFill);

  const list = makeElement("ul", "tl-milestones");
  const rows = {};
  MILESTONES.forEach(function (milestone) {
    const state = entry.milestones[milestone.key];
    const row = makeElement("li", "tl-milestone");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = idPrefix + milestone.key;
    checkbox.checked = state.done;
    checkbox.addEventListener("change", function () {
      state.done = checkbox.checked;
      saveAndRefresh();
    });

    const label = makeElement("label", "tl-milestone-label", milestone.label);
    label.htmlFor = checkbox.id;

    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.className = "tl-milestone-date";
    dateInput.value = state.date;
    dateInput.setAttribute("aria-label", "Target date for " + milestone.label);
    dateInput.addEventListener("change", function () {
      state.date = isDateText(dateInput.value) ? dateInput.value : "";
      state.auto = false;   // you set it, so it won't be moved
      saveAndRefresh();
    });

    row.append(checkbox, label, dateInput);
    list.append(row);
    rows[milestone.key] = { row: row, dateInput: dateInput };
  });

  function updateMilestoneInputs() {
    MILESTONES.forEach(function (milestone) {
      rows[milestone.key].dateInput.value = entry.milestones[milestone.key].date;
    });
  }

  function updateMilestoneProgress() {
    const doneCount = MILESTONES.filter(function (m) { return entry.milestones[m.key].done; }).length;
    progressText.textContent = doneCount + " of " + MILESTONES.length + " done";
    progressFill.style.width = (doneCount / MILESTONES.length) * 100 + "%";

    // Mark done steps, and steps whose date has passed without being done
    MILESTONES.forEach(function (milestone) {
      const state = entry.milestones[milestone.key];
      const overdue = !state.done && state.date && daysUntil(state.date) < 0;
      rows[milestone.key].row.classList.toggle("is-done", state.done);
      rows[milestone.key].row.classList.toggle("is-overdue", Boolean(overdue));
    });
  }

  right.append(milestoneHeader, progressBar, list);

  // ----- Footer: calendar export -----
  const footer = makeElement("div", "tl-footer");
  const exportButton = makeElement("button", "button button-small");
  exportButton.type = "button";
  exportButton.append(makeIcon("calendar-plus"), "Export to calendar");
  exportButton.addEventListener("click", function () {
    exportCalendar([uni], slugify(uni.name) + "-timeline.ics");
  });
  footer.append(exportButton);

  // ----- Put the card together -----
  const body = makeElement("div", "tl-body");
  body.append(left, right);
  card.append(header, body, footer);

  // Redraw everything that depends on the saved data
  function refresh() {
    const dates = cardDates(uni, entry);
    const target = findTarget(dates, entry);

    // Status color on the card and the dropdown
    STATUSES.forEach(function (status) {
      card.classList.toggle("status-" + status.key, entry.status === status.key);
    });

    drawDates(dates, target);
    drawDateTools();

    plannedInput.value = entry.plannedDate;
    barHolder.innerHTML = "";
    barHolder.append(buildTimelineBar(uni, dates, target, entry, {
      // While dragging: show the date and the warning, but don't save yet
      preview: function (dateText) {
        plannedInput.value = dateText;
        updateWarning(dateText, target);
      },
      // When you let go (or press an arrow key): save it
      commit: function (dateText) {
        setPlannedDate(dateText);
        plannedInput.value = entry.plannedDate;
        updateWarning(entry.plannedDate, target);
        updateMilestoneProgress();
        save();
      },
    }));
    updateWarning(entry.plannedDate, target);

    updateMilestoneProgress();
    refreshIcons();
  }

  refresh();
  return card;
}


// =========================================================
// 6. THE TIMELINE BAR WITH A SLIDER
// A bar from today to the latest date found. Every date is a dot
// (deadlines are red diamonds). Hover or tap a dot to see what it is.
// Drag the handle to set your planned submission date: it snaps to
// whole days. Works with a mouse, a finger, or the arrow keys.
// =========================================================

function buildTimelineBar(uni, dates, target, entry, actions) {
  const box = makeElement("div", "tl-bar-box");
  const today = todayText();

  // Dates still to come (past dates are only in the list, greyed out)
  const upcoming = dates.filter(function (item) { return !isPastItem(item); });

  // The bar runs from today to the latest date, plus a little extra
  // so you can drag past the last deadline (at least 30 days long)
  let latest = today;
  upcoming.forEach(function (item) { latest = laterDate(latest, itemBarDate(item)); });
  if (entry.plannedDate) latest = laterDate(latest, entry.plannedDate);
  const span = daysBetween(today, latest);
  const end = addDays(today, Math.max(span + Math.max(14, Math.round(span * 0.08)), 30));
  const totalDays = daysBetween(today, end);

  // Where a date sits on the bar, as a percentage from the left
  function position(dateText) {
    const days = Math.min(Math.max(daysBetween(today, dateText), 0), totalDays);
    return (days / totalDays) * 100;
  }

  const bar = makeElement("div", "tl-bar");
  const inner = makeElement("div", "tl-bar-inner");   // the part dates are placed on
  const fill = makeElement("div", "tl-bar-fill");     // today -> your planned date
  inner.append(makeElement("div", "tl-bar-line"), fill);

  // "Today" at the start
  const todayMark = makeElement("span", "tl-bar-today");
  todayMark.append(makeElement("span", "tl-bar-today-label", "Today"));
  inner.append(todayMark);

  // A dot for each date. Dates on the same day share one dot.
  const groups = [];
  upcoming.forEach(function (item) {
    const date = laterDate(itemBarDate(item), today);
    const group = groups.find(function (g) { return g.date === date; });
    if (group) group.items.push(item);
    else groups.push({ date: date, items: [item] });
  });
  groups.forEach(function (group) {
    const hasDeadline = group.items.some(function (item) { return item.type === "deadline"; });
    const hasTarget = Boolean(target) && group.items.some(function (item) { return item.id === target.id; });
    const marker = makeElement("button", "tl-bar-marker" + (hasDeadline ? " is-deadline" : "") + (hasTarget ? " is-target" : ""));
    marker.type = "button";
    const left = position(group.date);
    marker.style.left = left + "%";
    // Keep the label inside the card near the ends
    if (left > 70) marker.classList.add("tip-left");
    if (left < 30) marker.classList.add("tip-right");
    const text = group.items.map(itemText).join("\n");
    marker.setAttribute("aria-label", text);
    marker.append(makeElement("span", "tl-bar-tip", text));
    inner.append(marker);
  });

  // The handle you drag
  const handle = makeElement("div", "tl-bar-handle");
  handle.tabIndex = 0;
  handle.setAttribute("role", "slider");
  handle.setAttribute("aria-label", "Planned submission date for " + uni.name);
  handle.setAttribute("aria-valuemin", "0");
  handle.setAttribute("aria-valuemax", String(totalDays));
  const bubble = makeElement("span", "tl-bar-bubble");
  handle.append(bubble);
  inner.append(handle);

  bar.append(inner);

  // Scale under the bar
  const scale = makeElement("div", "tl-bar-scale");
  scale.append(makeElement("span", "", shortDate(today)), makeElement("span", "", formatDate(end)));

  // Move the handle to a date (without saving)
  let current = entry.plannedDate;
  function show(dateText) {
    current = dateText;
    const isSet = Boolean(dateText);
    const left = isSet ? position(dateText) : 0;
    handle.style.left = left + "%";
    fill.style.width = left + "%";
    handle.classList.toggle("is-unset", !isSet);
    bubble.textContent = isSet ? formatDate(dateText) : "Drag to plan";
    handle.setAttribute("aria-valuenow", String(isSet ? Math.max(daysBetween(today, dateText), 0) : 0));
    handle.setAttribute("aria-valuetext", isSet ? formatDate(dateText) : "Not set");
    // Keep the bubble inside the card near the ends
    bubble.classList.toggle("is-start", left < 12);
    bubble.classList.toggle("is-end", left > 88);
  }
  show(entry.plannedDate);

  // A point on the screen -> the nearest whole day
  function dateAt(clientX) {
    const rect = inner.getBoundingClientRect();
    const fraction = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return addDays(today, Math.round(fraction * totalDays));
  }

  // Dragging (pointer events cover mouse, touch and pen)
  let dragging = false;
  bar.addEventListener("pointerdown", function (event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // Tapping a dot shows what it is instead of moving the handle
    if (event.target.closest(".tl-bar-marker")) return;
    dragging = true;
    bar.setPointerCapture(event.pointerId);
    bar.classList.add("is-dragging");
    show(dateAt(event.clientX));
    actions.preview(current);
    handle.focus({ preventScroll: true });
    event.preventDefault();
  });
  bar.addEventListener("pointermove", function (event) {
    if (!dragging) return;
    const date = dateAt(event.clientX);
    if (date !== current) {
      show(date);
      actions.preview(current);
    }
  });
  function stopDragging() {
    if (!dragging) return;
    dragging = false;
    bar.classList.remove("is-dragging");
    actions.commit(current);
  }
  bar.addEventListener("pointerup", stopDragging);
  bar.addEventListener("pointercancel", stopDragging);

  // Keyboard: arrows move one day, Page Up/Down one week
  handle.addEventListener("keydown", function (event) {
    const steps = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 7, PageDown: -7 };
    let date = null;
    if (event.key in steps) {
      date = addDays(current || today, steps[event.key]);
      if (date < today) date = today;
      if (date > end) date = end;
    } else if (event.key === "Home") {
      date = today;
    } else if (event.key === "End") {
      date = end;
    }
    if (!date) return;
    event.preventDefault();
    show(date);
    actions.commit(date);
  });

  // Small key under the bar
  const legend = makeElement("div", "tl-bar-legend");
  const keyItem = function (className, text) {
    const item = makeElement("span", "");
    item.append(makeElement("i", className), text);
    return item;
  };
  legend.append(keyItem("tl-key tl-key-deadline", "Deadline"), keyItem("tl-key", "Other date"),
    keyItem("tl-key tl-key-planned", "Your planned date"));

  box.append(bar, scale, legend);
  return box;
}


// =========================================================
// 7. THE SUMMARY AT THE TOP
// How many applications are at each status, and what's next.
// =========================================================

const timelineSummary = document.getElementById("timeline-summary");

function drawSummary() {
  timelineSummary.innerHTML = "";
  if (universities.length === 0) return;

  const upcoming = [];   // things still to do, with a date
  let overdue = 0;
  const counts = {};

  universities.forEach(function (uni) {
    const entry = TimelineStore.get(uni.id);
    counts[entry.status] = (counts[entry.status] || 0) + 1;
    if (FINISHED_STATUSES.indexOf(entry.status) !== -1) return;

    MILESTONES.forEach(function (milestone) {
      const state = entry.milestones[milestone.key];
      if (state.done || !state.date) return;
      if (daysUntil(state.date) < 0) overdue++;
      else upcoming.push({ date: state.date, text: milestone.label, uni: uni });
    });

    if (entry.plannedDate && daysUntil(entry.plannedDate) >= 0) {
      upcoming.push({ date: entry.plannedDate, text: "Planned submission", uni: uni });
    }

    // The deadline you chose
    const target = findTarget(cardDates(uni, entry), entry);
    if (target && !target.approximate && daysUntil(target.date) >= 0) {
      upcoming.push({ date: target.date, text: "Target deadline", uni: uni });
    }
  });

  // Status counts, e.g. "2 Applying"
  const chips = makeElement("div", "tl-status-counts");
  STATUSES.forEach(function (status) {
    if (!counts[status.key]) return;
    chips.append(makeElement("span", "tl-count status-" + status.key, counts[status.key] + " " + status.label));
  });

  // The next thing to do
  const next = makeElement("div", "tl-next");
  upcoming.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  if (upcoming.length > 0) {
    const item = upcoming[0];
    next.append(makeIcon("flag"), makeElement("span", "",
      "Next up: " + item.text + " for " + item.uni.name + ", " + relativeDays(item.date) + " (" + shortDate(item.date) + ")"));
  } else {
    next.append(makeIcon("info"), makeElement("span", "", "Drag the slider on a card to set your planned date."));
  }
  if (overdue > 0) {
    next.append(makeElement("span", "tl-overdue-count", overdue + (overdue === 1 ? " step overdue" : " steps overdue")));
  }

  timelineSummary.append(chips, next);
  refreshIcons();
}


// =========================================================
// 8. CALENDAR EXPORT (.ics FILES)
// An .ics file is a standard calendar file. Opening it adds the
// events to Apple Calendar, Google Calendar or Outlook.
// Each event is all-day, with a reminder at 9am the day before.
// =========================================================

// Special characters must be escaped in .ics text
function icsText(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Lines in an .ics file may be at most 75 bytes long. Longer lines are
// split, and each extra piece starts with a space.
function icsFoldLine(line) {
  const encoder = new TextEncoder();
  const pieces = [];
  let current = "";
  for (const character of line) {
    const limit = pieces.length === 0 ? 75 : 74; // the space takes one byte
    if (encoder.encode(current + character).length > limit) {
      pieces.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  pieces.push(current);
  return pieces.join("\r\n ");
}

// The events for one university: upcoming deadlines (with an exact day),
// your planned date and unfinished milestones
function calendarEvents(uni) {
  const entry = TimelineStore.get(uni.id);
  const dates = cardDates(uni, entry);
  const target = findTarget(dates, entry);
  const events = [];
  const details = uni.course + " at " + uni.name;

  dates.forEach(function (item) {
    if (item.type !== "deadline" || item.approximate || item.date < todayText()) return;
    const name = [item.campus, item.label].filter(Boolean).join(" ");
    events.push({
      key: item.id === "official" ? "deadline" : "date-" + slugify(item.id),
      date: item.date,
      title: name + ": " + uni.name,
      description: name + " for " + details + "." + (target && target.id === item.id ? " This is your target deadline." : ""),
    });
  });
  if (entry.plannedDate) {
    events.push({ key: "planned", date: entry.plannedDate,
      title: "Submit: " + uni.name, description: "Your planned submission date for " + details + "." });
  }
  MILESTONES.forEach(function (milestone) {
    const state = entry.milestones[milestone.key];
    if (state.date && !state.done) {
      events.push({ key: milestone.key, date: state.date,
        title: milestone.label + " (" + uni.name + ")", description: "Application step for " + details + "." });
    }
  });

  return events.map(function (event) {
    event.uid = uni.id + "-" + event.key + "@my-future-planner";
    return event;
  });
}

function buildIcs(events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//My Future Planner//Application Timeline//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:University applications",
  ];

  events.forEach(function (event) {
    lines.push(
      "BEGIN:VEVENT",
      "UID:" + event.uid,
      "DTSTAMP:" + stamp,
      "DTSTART;VALUE=DATE:" + event.date.replace(/-/g, ""),
      "DTEND;VALUE=DATE:" + addDays(event.date, 1).replace(/-/g, ""),
      "SUMMARY:" + icsText(event.title),
      "DESCRIPTION:" + icsText(event.description),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:" + icsText(event.title),
      "TRIGGER:-PT15H",   // 15 hours before midnight = 9am the day before
      "END:VALARM",
      "END:VEVENT"
    );
  });

  lines.push("END:VCALENDAR");
  return lines.map(icsFoldLine).join("\r\n") + "\r\n";
}

// "University of Edinburgh" -> "university-of-edinburgh"
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "university";
}

// Make the .ics file and download it
function exportCalendar(unis, fileName) {
  let events = [];
  unis.forEach(function (uni) {
    events = events.concat(calendarEvents(uni));
  });

  if (events.length === 0) {
    showToast("No dates to export yet. Set a planned date or add a deadline first.", "circle-alert");
    return;
  }

  const file = new Blob([buildIcs(events)], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);

  showToast("Saved " + events.length + (events.length === 1 ? " date" : " dates") +
    " to " + fileName + ". Open the file to add them to your calendar.", "calendar-check");
}


// =========================================================
// 9. DRAWING THE PAGE
// =========================================================

const timelineList = document.getElementById("timeline-list");
const timelineEmpty = document.getElementById("timeline-empty");

function drawTimeline() {
  // Forget timeline data for universities that were deleted
  TimelineStore.removeMissing(universities.map(function (uni) { return uni.id; }));

  timelineList.innerHTML = "";
  timelineEmpty.hidden = universities.length > 0;

  // Soonest deadline first, like the university list
  sortByDeadline(universities).forEach(function (uni) {
    timelineList.append(buildCard(uni));
  });

  drawSummary();
  refreshIcons();
}

// Redraw when universities are added, edited or deleted...
document.addEventListener("universities-changed", drawTimeline);

// ...and whenever the Timeline tab is opened (so "today" is always up to date)
document.addEventListener("tab-opened", function (event) {
  if (event.detail === "timeline-tab") drawTimeline();
});

document.getElementById("export-all-ics").addEventListener("click", function () {
  exportCalendar(universities, "university-applications.ics");
});

TimelineStore.migrate();   // update entries saved by the old planner (only changes anything once)
drawTimeline();
