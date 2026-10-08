// =========================================================
// MY FUTURE PLANNER - APPLICATION TIMELINE
//
// This file builds the Timeline tab. It loads after script.js
// and reuses things from it: the `universities` list, DataStore,
// STORAGE_KEYS, parseDate, daysUntil, formatDate, sortByDeadline,
// makeElement, makeIcon, refreshIcons and showToast.
//
// Sections in this file:
//   1. Settings (milestones and statuses)
//   2. Saving and loading timeline data
//   3. Date helpers
//   4. Timeline cards
//   5. The mini timeline bar
//   6. The summary at the top
//   7. Calendar export (.ics files)
//   8. Drawing the page
// =========================================================


// =========================================================
// 1. SETTINGS
// =========================================================

// The steps of an application. `daysBefore` is used by the
// "Suggest dates" button: how many days before your planned
// submission date each step should ideally be done.
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


// =========================================================
// 2. SAVING AND LOADING TIMELINE DATA
//
// Timeline data is saved separately from the universities, so the
// auto-fill system doesn't change. There's one entry per university,
// found by the university's id. One entry looks like this:
// {
//   plannedDate: "2026-12-20",       your planned submission date, or ""
//   status: "applying",              one of the STATUSES keys
//   milestones: {
//     statementDrafted: { done: true, date: "2026-11-01" },
//     ...one for every milestone
//   },
//   updatedAt: 1791500000000         when it was last changed
// }
//
// BACKEND: this matches an "applications" table with a university_id
// column. Replace the insides of TimelineStore with fetch() calls.
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
      milestones[milestone.key] = { done: Boolean(old.done), date: old.date || "" };
    });

    return {
      plannedDate: saved.plannedDate || "",
      status: saved.status || "researching",
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
};


// =========================================================
// 3. DATE HELPERS
// Dates are kept as "YYYY-MM-DD" text, like the rest of the site.
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


// =========================================================
// 4. TIMELINE CARDS
// One card per university. When you change something, only the
// parts that depend on it are redrawn (so the box you're typing
// in keeps its place).
// =========================================================

function buildCard(uni) {
  const entry = TimelineStore.get(uni.id);
  const idPrefix = "tl-" + uni.id + "-";

  const card = makeElement("article", "card tl-card");
  card.dataset.id = uni.id;

  // Save the change, then refresh the parts of the card that show it
  function saveAndRefresh() {
    TimelineStore.save(uni.id, entry);
    refresh();
    drawSummary();
  }

  // ----- Header: name, course and status -----
  const header = makeElement("div", "tl-header");
  const titles = makeElement("div", "tl-titles");
  titles.append(
    makeElement("h3", "", uni.name),
    makeElement("p", "muted", uni.course + " · " + uni.city + ", " + uni.country)
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

  // ----- Left side: the two dates and the mini timeline -----
  const left = makeElement("div", "tl-left");
  const dates = makeElement("div", "tl-dates");

  // Official deadline (comes from the auto-fill system, read-only here)
  const deadlineBox = makeElement("div", "tl-date-box");
  deadlineBox.append(makeElement("span", "tl-date-label", "Official deadline"));
  if (uni.deadline) {
    deadlineBox.append(makeElement("strong", "tl-date-value", formatDate(uni.deadline)));
    deadlineBox.append(makeElement("span", "tl-date-note",
      uni.verified ? "Verified from official sources" : "From your university details"));
  } else {
    deadlineBox.append(makeElement("strong", "tl-date-value is-empty",
      uni.aiSearched ? "Not published" : "Not set"));
    deadlineBox.append(makeElement("span", "tl-date-note", "Add it on the Universities tab"));
  }

  // Your planned submission date (editable)
  const plannedBox = makeElement("div", "tl-date-box");
  const plannedLabel = makeElement("label", "tl-date-label", "Planned submission");
  plannedLabel.htmlFor = idPrefix + "planned";
  const plannedInput = document.createElement("input");
  plannedInput.type = "date";
  plannedInput.id = idPrefix + "planned";
  plannedInput.value = entry.plannedDate;
  plannedInput.addEventListener("change", function () {
    entry.plannedDate = isDateText(plannedInput.value) ? plannedInput.value : "";
    saveAndRefresh();
  });
  plannedBox.append(plannedLabel, plannedInput);

  dates.append(deadlineBox, plannedBox);
  const visualHolder = makeElement("div");   // filled in by refresh()
  left.append(dates, visualHolder);

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
      saveAndRefresh();
    });

    row.append(checkbox, label, dateInput);
    list.append(row);
    rows[milestone.key] = { row: row, dateInput: dateInput };
  });

  right.append(milestoneHeader, progressBar, list);

  // ----- Footer: buttons -----
  const footer = makeElement("div", "tl-footer");

  const suggestButton = makeElement("button", "button button-small");
  suggestButton.type = "button";
  suggestButton.append(makeIcon("sparkles"), "Suggest dates");
  suggestButton.addEventListener("click", function () {
    suggestDates(uni, entry, rows, plannedInput);
    saveAndRefresh();
  });

  const exportButton = makeElement("button", "button button-small");
  exportButton.type = "button";
  exportButton.append(makeIcon("calendar-plus"), "Export to calendar");
  exportButton.addEventListener("click", function () {
    exportCalendar([uni], slugify(uni.name) + "-timeline.ics");
  });

  footer.append(suggestButton, exportButton);

  // ----- Put the card together -----
  const body = makeElement("div", "tl-body");
  body.append(left, right);
  card.append(header, body, footer);

  // Redraw everything that depends on the saved data
  function refresh() {
    // Status color on the card and the dropdown
    STATUSES.forEach(function (status) {
      card.classList.toggle("status-" + status.key, entry.status === status.key);
    });

    visualHolder.innerHTML = "";
    visualHolder.append(buildTimelineVisual(uni, entry));

    // Milestone progress
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

  refresh();
  return card;
}

// "Suggest dates": fill in empty milestone dates, counting back from
// your planned submission date (or from the deadline if there isn't one).
// Dates you already set are left alone.
function suggestDates(uni, entry, rows, plannedInput) {
  // No planned date yet? Suggest one week before the deadline.
  if (!entry.plannedDate && uni.deadline) {
    const suggested = addDays(uni.deadline, -7);
    entry.plannedDate = daysUntil(suggested) < 0 ? todayText() : suggested;
    plannedInput.value = entry.plannedDate;
  }

  if (!entry.plannedDate) {
    showToast("Set a planned submission date first.", "circle-alert");
    return;
  }

  let added = 0;
  MILESTONES.forEach(function (milestone) {
    const state = entry.milestones[milestone.key];
    if (state.date || state.done) return;

    let date = addDays(entry.plannedDate, -milestone.daysBefore);
    if (daysUntil(date) < 0) date = todayText();   // no suggestions in the past
    state.date = date;
    rows[milestone.key].dateInput.value = date;
    added++;
  });

  showToast(added > 0
    ? "Suggested dates added. Change any of them to suit you."
    : "Every step already has a date.");
}


// =========================================================
// 5. THE MINI TIMELINE BAR
// Shows today, your planned date and the deadline on one line.
// =========================================================

function buildTimelineVisual(uni, entry) {
  const box = makeElement("div", "tl-visual");

  // The points to show on the line
  const points = [{ key: "today", label: "Today", date: todayText() }];
  if (entry.plannedDate) points.push({ key: "planned", label: "Planned", date: entry.plannedDate });
  if (uni.deadline) points.push({ key: "deadline", label: "Deadline", date: uni.deadline });

  if (points.length === 1) {
    box.append(makeElement("p", "tl-message", "Set a planned submission date to see your timeline."));
    return box;
  }

  // Work out the start and end of the line, with a little room at each end
  const times = points.map(function (point) { return parseDate(point.date).getTime(); });
  let start = Math.min.apply(null, times);
  let end = Math.max.apply(null, times);
  if (end - start < 14 * DAY) end = start + 14 * DAY;  // at least two weeks wide
  const padding = (end - start) * 0.06;
  start -= padding;
  end += padding;

  // Where a date sits on the line, as a percentage from the left
  function position(dateText) {
    return ((parseDate(dateText).getTime() - start) / (end - start)) * 100;
  }

  const track = makeElement("div", "tl-track");

  // Shaded part: time that has already passed
  const elapsed = makeElement("div", "tl-elapsed");
  elapsed.style.width = position(todayText()) + "%";
  track.append(elapsed);

  // Green part: your buffer between planned date and deadline (red if you're late)
  if (entry.plannedDate && uni.deadline) {
    const late = entry.plannedDate > uni.deadline;
    const from = late ? uni.deadline : entry.plannedDate;
    const to = late ? entry.plannedDate : uni.deadline;
    const segment = makeElement("div", late ? "tl-segment is-late" : "tl-segment");
    segment.style.left = position(from) + "%";
    segment.style.width = Math.max(position(to) - position(from), 0.5) + "%";
    track.append(segment);
  }

  // A dot for each point
  points.forEach(function (point) {
    const marker = makeElement("span", "tl-marker tl-marker-" + point.key);
    marker.style.left = position(point.date) + "%";
    marker.title = point.label + ": " + formatDate(point.date);
    track.append(marker);
  });

  // The key under the line, e.g. "● Deadline 14 Jan · in 98 days"
  const legend = makeElement("div", "tl-legend");
  points.forEach(function (point) {
    const item = makeElement("span", "tl-legend-item");
    item.append(
      makeElement("i", "tl-dot tl-marker-" + point.key),
      makeElement("strong", "", point.label),
      " " + shortDate(point.date) + (point.key === "today" ? "" : " · " + relativeDays(point.date))
    );
    legend.append(item);
  });

  box.append(track, legend);

  // One sentence about how it's going
  const message = timelineMessage(uni, entry);
  if (message) box.append(makeElement("p", "tl-message " + message.type, message.text));
  return box;
}

function timelineMessage(uni, entry) {
  if (FINISHED_STATUSES.indexOf(entry.status) !== -1) return null;

  if (uni.deadline && daysUntil(uni.deadline) < 0) {
    return { type: "is-late", text: "The deadline has passed. Check the university's website for later rounds." };
  }
  if (entry.plannedDate && uni.deadline) {
    const buffer = Math.round((parseDate(uni.deadline) - parseDate(entry.plannedDate)) / DAY);
    if (buffer < 0) {
      return { type: "is-late", text: "Your planned date is " + Math.abs(buffer) + " days after the deadline. Move it earlier." };
    }
    if (buffer === 0) {
      return { type: "is-tight", text: "You plan to submit on deadline day. Leave yourself a few days in case something goes wrong." };
    }
    return { type: "is-good", text: buffer + (buffer === 1 ? " day" : " days") + " of buffer before the deadline." };
  }
  if (!entry.plannedDate) {
    return { type: "", text: "Set a planned submission date to plan your steps, or use Suggest dates." };
  }
  return null;
}


// =========================================================
// 6. THE SUMMARY AT THE TOP
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
    if (uni.deadline && daysUntil(uni.deadline) >= 0) {
      upcoming.push({ date: uni.deadline, text: "Deadline", uni: uni });
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
    next.append(makeIcon("info"), makeElement("span", "", "Use Suggest dates on a card to plan your steps."));
  }
  if (overdue > 0) {
    next.append(makeElement("span", "tl-overdue-count", overdue + (overdue === 1 ? " step overdue" : " steps overdue")));
  }

  timelineSummary.append(chips, next);
  refreshIcons();
}


// =========================================================
// 7. CALENDAR EXPORT (.ics FILES)
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

// The events for one university: deadline, planned date, unfinished milestones
function calendarEvents(uni) {
  const entry = TimelineStore.get(uni.id);
  const events = [];
  const details = uni.course + " at " + uni.name;

  if (uni.deadline) {
    events.push({ key: "deadline", date: uni.deadline,
      title: "Deadline: " + uni.name, description: "Official application deadline for " + details + "." });
  }
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
    showToast("No dates to export yet. Set a planned date or use Suggest dates first.", "circle-alert");
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
// 8. DRAWING THE PAGE
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

drawTimeline();
