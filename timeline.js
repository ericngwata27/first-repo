// =========================================================
// MY FUTURE PLANNER - APPLICATION TIMELINE
//
// This file builds the Timeline tab. It loads after script.js
// and reuses things from it: the `universities` list, DataStore,
// STORAGE_KEYS, parseDate, parseDeadline, daysUntil, formatDate,
// sortByDeadline, makeElement, makeIcon, refreshIcons and showToast.
//
// Sections in this file:
//   1. Settings (milestones, statuses, rounds and signals)
//   2. Saving and loading timeline data
//   3. Date helpers
//   4. Reading admissions patterns from the auto-fill text
//   5. Working out the best time to apply
//   6. Timeline cards
//   7. The mini timeline bar and strategy notes
//   8. The summary at the top
//   9. Calendar export (.ics files)
//  10. Drawing the page
// =========================================================


// =========================================================
// 1. SETTINGS
// =========================================================

// The steps of an application.
//   daysBefore: ideally done this many days before you submit
//   minDays:    the shortest realistic time to finish it, starting today
//               (used to work out the earliest date you could be ready)
const MILESTONES = [
  { key: "testsBooked",         label: "Tests booked",               daysBefore: 56, minDays: 14 },
  { key: "statementDrafted",    label: "Personal statement drafted", daysBefore: 42, minDays: 10 },
  { key: "referencesRequested", label: "References requested",       daysBefore: 42, minDays: 1 },
  { key: "statementFinal",      label: "Personal statement final",   daysBefore: 14, minDays: 21 },
  { key: "referencesReceived",  label: "References received",        daysBefore: 10, minDays: 21 },
  { key: "formFilled",          label: "Online application filled",  daysBefore: 7,  minDays: 5 },
  { key: "finalReview",         label: "Final review",               daysBefore: 3,  minDays: 2 },
  { key: "submission",          label: "Submission day",             daysBefore: 0,  minDays: 0 },
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

// Names of admission rounds we look for in the auto-fill text.
// Longer names come first, so "Early Decision II" wins over "Early Decision".
const ROUND_TYPES = [
  { pattern: /early decision\s*(?:ii|2)\b/gi, label: "Early Decision II", short: "ED2", binding: true },
  { pattern: /early decision(?:\s*(?:i|1)\b)?/gi, label: "Early Decision", short: "ED", binding: true },
  { pattern: /(?:restrictive|single[- ]choice) early action/gi, label: "Restrictive Early Action", short: "REA" },
  { pattern: /early action/gi, label: "Early Action", short: "EA" },
  { pattern: /regular decision/gi, label: "Regular Decision", short: "RD" },
  { pattern: /priority (?:application )?deadline/gi, label: "Priority deadline", short: "PD" },
  { pattern: /\b(?:round|stage|phase)\s*(?:1|one|i)\b/gi, label: "Round 1", short: "R1" },
  { pattern: /\b(?:round|stage|phase)\s*(?:2|two|ii)\b/gi, label: "Round 2", short: "R2" },
  { pattern: /\b(?:round|stage|phase)\s*(?:3|three|iii)\b/gi, label: "Round 3", short: "R3" },
  { pattern: /\b(?:round|stage|phase)\s*(?:4|four|iv)\b/gi, label: "Round 4", short: "R4" },
];

// Phrases that mean applications are reviewed as they arrive
const ROLLING_SIGNALS = [
  /rolling (?:admissions?|basis|deadline|review)/i,
  /first[- ]come,? first[- ]served/i,
  /reviewed (?:as|when) (?:they|applications) (?:arrive|are received)/i,
  /as (?:soon as )?(?:they|applications) (?:are|is) received/i,
  /until (?:all )?(?:places|seats|spaces) (?:are|have been) (?:filled|taken)/i,
];

// Phrases that mean places are limited or early applicants get priority
const CAPACITY_SIGNALS = [
  /limited (?:seats|places|spaces|capacity|number of places)/i,
  /(?:places|seats|spaces) (?:are )?limited/i,
  /capacity (?:constraints?|limits?)/i,
  /high[- ]demand/i,
  /oversubscribed/i,
  /priority (?:is )?(?:given )?to early/i,
  /early applicants?/i,
  /(?:may|might|can|could) close (?:early|before)/i,
];

// Phrases that suggest a competitive course (worth a longer safety buffer)
const COMPETITIVE_SIGNALS = [
  /highly competitive/i,
  /competitive (?:course|programme|program|entry|admission)/i,
  /\bA\*A\*A\b|\bA\*AA\b/,
  /interview/i,
  /admissions? test|aptitude test|\b(?:TMUA|UCAT|LNAT|BMAT|MAT|STEP|ESAT|TSA|SAT|ACT|GMAT|GRE)\b/,
  /portfolio|audition/i,
  /\bselective\b/i,
];

// UCAS "equal consideration": everything sent before the deadline is
// treated the same, so applying earlier does NOT improve your chances
const EQUAL_CONSIDERATION_SIGNAL = /equal consideration/i;

// How many days before a single deadline to aim for
const BUFFER_DAYS = { normal: 21, competitive: 45 };

// How many days before a round's deadline to aim for
const ROUND_BUFFER_DAYS = 7;


// =========================================================
// 2. SAVING AND LOADING TIMELINE DATA
//
// Timeline data is saved separately from the universities, so the
// auto-fill system doesn't change. There's one entry per university,
// found by the university's id. One entry looks like this:
// {
//   plannedDate: "2026-12-20",       your planned submission date, or ""
//   plannedAuto: true,               true if the planner chose that date
//   status: "applying",              one of the STATUSES keys
//   targetRound: "auto",             "auto" = follow the recommendation,
//                                    or a round key like "r1" or "final"
//   manualRounds: [                  rounds you added yourself
//     { key: "m1712345678901", label: "Round 1", short: "R1", date: "2026-11-15" }
//   ],
//   milestones: {
//     statementDrafted: { done: true, date: "2026-11-01", auto: false },
//     ...one for every milestone. auto = true if the planner set the date,
//     so it can be moved when the plan changes. Dates you type are never moved.
//   },
//   updatedAt: 1791500000000         when it was last changed
// }
//
// BACKEND: this matches an "applications" table with a university_id
// column (manualRounds can be its own "application_rounds" table).
// Replace the insides of TimelineStore with fetch() calls.
// =========================================================

const TimelineStore = {
  readAll: function () {
    return DataStore.read(STORAGE_KEYS.timeline, {});
  },

  // Get one university's entry, with every field filled in
  // (so the rest of the code never has to check for missing parts).
  // Entries saved by older versions get the new fields with safe defaults.
  get: function (uniId) {
    const saved = TimelineStore.readAll()[uniId] || {};
    const savedMilestones = saved.milestones || {};

    const milestones = {};
    MILESTONES.forEach(function (milestone) {
      const old = savedMilestones[milestone.key] || {};
      milestones[milestone.key] = { done: Boolean(old.done), date: old.date || "", auto: Boolean(old.auto) };
    });

    return {
      plannedDate: saved.plannedDate || "",
      plannedAuto: Boolean(saved.plannedAuto),
      status: saved.status || "researching",
      targetRound: saved.targetRound || "auto",
      manualRounds: Array.isArray(saved.manualRounds) ? saved.manualRounds : [],
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

// The later / earlier of two dates
function laterDate(a, b) { return a > b ? a : b; }
function earlierDate(a, b) { return a < b ? a : b; }

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
// 4. READING ADMISSIONS PATTERNS FROM THE AUTO-FILL TEXT
//
// Auto-fill saves one deadline plus some text (notes, how to apply,
// entry requirements, course description). We read that text, without
// changing it, looking for admission rounds, rolling admissions,
// limited places and signs of a competitive course.
// =========================================================

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Read a date from text like "15 November 2026", "Nov 15" or "15th of January".
// Dates without a year get the next time that day comes round.
function readRoundDate(text) {
  const fullDate = parseDeadline(text);   // from script.js: dates with a year
  if (fullDate) return fullDate;

  const monthNumber = function (word) {
    const index = MONTHS.indexOf(word.slice(0, 3).toLowerCase());
    return index === -1 ? 0 : index + 1;
  };

  let day = 0;
  let month = 0;
  let match = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,})/);
  if (match && monthNumber(match[2])) {
    day = Number(match[1]);
    month = monthNumber(match[2]);
  } else {
    match = text.match(/\b([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (match && monthNumber(match[1])) {
      day = Number(match[2]);
      month = monthNumber(match[1]);
    }
  }
  if (!day || day > 31) return "";

  // No year given: use this year, or next year if that date has passed
  const today = new Date();
  let date = new Date(today.getFullYear(), month - 1, day);
  if (toDateText(date) < todayText()) date = new Date(today.getFullYear() + 1, month - 1, day);
  return toDateText(date);
}

// All the auto-fill text for a university, in one string
function autoFillText(uni) {
  return [uni.notes, uni.applicationInfo, uni.requirements, uni.courseDescription]
    .filter(Boolean).join("\n");
}

// Find admission rounds and their dates, e.g. "Round 1 closes 15 November"
function detectRounds(text) {
  // 1. Find every round name in the text
  let found = [];
  ROUND_TYPES.forEach(function (type) {
    type.pattern.lastIndex = 0;
    let match;
    while ((match = type.pattern.exec(text)) !== null) {
      found.push({ start: match.index, end: match.index + match[0].length, type: type });
    }
  });

  // 2. Put them in order, and drop names that sit inside a longer one
  //    (e.g. "Early Action" inside "Restrictive Early Action")
  found.sort(function (a, b) { return a.start - b.start || b.end - a.end; });
  let lastEnd = -1;
  found = found.filter(function (item) {
    if (item.start < lastEnd) return false;
    lastEnd = item.end;
    return true;
  });

  // 3. Each round's date is in the text after its name (up to the next round name)
  const rounds = [];
  found.forEach(function (item, index) {
    const nextStart = index + 1 < found.length ? found[index + 1].start : text.length;
    const snippet = text.slice(item.end, Math.min(nextStart, item.end + 100));
    const date = readRoundDate(snippet);
    const key = item.type.short.toLowerCase();

    if (!date || rounds.some(function (r) { return r.key === key; })) return;
    rounds.push({
      key: key,
      label: item.type.label,
      short: item.type.short,
      date: date,
      binding: Boolean(item.type.binding),
      source: "auto-fill",
    });
  });
  return rounds;
}

function firstMatch(text, patterns) {
  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (match) return match[0];
  }
  return "";
}

// Everything we know about how this university admits students
function analyseAdmissions(uni, entry) {
  const text = autoFillText(uni);
  let rounds = detectRounds(text);

  // Rounds you added yourself
  entry.manualRounds.forEach(function (round) {
    if (!isDateText(round.date)) return;
    rounds.push({ key: round.key, label: round.label, short: round.short, date: round.date,
      binding: /early decision/i.test(round.label), source: "added by you", manual: true });
  });

  // The official deadline from auto-fill is the final deadline,
  // unless one of the rounds already has that date
  if (uni.deadline && !rounds.some(function (r) { return r.date === uni.deadline; })) {
    rounds.push({ key: "final", label: "Final deadline", short: "Final", date: uni.deadline,
      binding: false, source: uni.verified ? "official website" : "auto-fill" });
  }

  rounds.sort(function (a, b) { return a.date < b.date ? -1 : 1; });

  return {
    rounds: rounds,
    multiRound: rounds.length > 1,
    rolling: firstMatch(text, ROLLING_SIGNALS),
    limited: firstMatch(text, CAPACITY_SIGNALS),
    competitive: firstMatch(text, COMPETITIVE_SIGNALS),
    equalConsideration: EQUAL_CONSIDERATION_SIGNAL.test(text),
  };
}


// =========================================================
// 5. WORKING OUT THE BEST TIME TO APPLY
// =========================================================

// The earliest date you could realistically finish every step that's
// not done yet (the slowest unfinished step decides it)
function earliestReadyDate(entry) {
  let days = 0;
  MILESTONES.forEach(function (milestone) {
    if (!entry.milestones[milestone.key].done) days = Math.max(days, milestone.minDays);
  });
  return addDays(todayText(), days);
}

// Pick a round, and the date to submit for it.
// Returns everything the card needs to show the plan.
function recommendPlan(uni, entry, analysis) {
  const today = todayText();
  const ready = earliestReadyDate(entry);
  const upcoming = analysis.rounds.filter(function (r) { return r.date >= today; });
  const feasible = upcoming.filter(function (r) { return r.date >= ready; });

  // The recommended round: the earliest one you can be ready for.
  // Binding Early Decision is never picked for you, only if you choose it.
  const recommended =
    feasible.find(function (r) { return !r.binding; }) ||
    upcoming.find(function (r) { return !r.binding; }) ||   // can't make any in time: the first open one
    null;

  // The round you're aiming for: your choice, or the recommendation
  const chosen = entry.targetRound === "auto" ? null :
    analysis.rounds.find(function (r) { return r.key === entry.targetRound; });
  const target = chosen || recommended;

  // The best date to submit
  let mode = "none";
  let plannedDate = "";
  let buffer = 0;

  if (analysis.rolling) {
    // Rolling: as soon as you can be ready
    mode = "rolling";
    plannedDate = ready;
  } else if (target && analysis.multiRound) {
    // Several rounds: a week before the target round closes, once you're ready
    mode = "rounds";
    buffer = ROUND_BUFFER_DAYS;
    plannedDate = laterDate(ready, addDays(target.date, -buffer));
  } else if (target) {
    // One deadline: a longer buffer for competitive courses
    mode = "single";
    buffer = analysis.competitive || analysis.limited ? BUFFER_DAYS.competitive : BUFFER_DAYS.normal;
    plannedDate = laterDate(ready, addDays(target.date, -buffer));
  }

  // Never plan to submit after the target deadline
  if (target && plannedDate > target.date) plannedDate = target.date;

  return {
    mode: mode,
    ready: ready,
    recommended: recommended,
    target: target,
    plannedDate: plannedDate,
    buffer: buffer,
    canMakeTarget: !target || ready <= target.date,
  };
}

// Give dates to the milestones, counting back from the submission date.
// If there's less time than ideal, every step is squeezed in proportion.
// Only dates the planner set earlier (or empty ones) are changed.
function scheduleMilestones(entry, submitDate) {
  const today = todayText();
  const window = Math.max(daysBetween(today, submitDate), 0);
  let longest = 0;
  MILESTONES.forEach(function (milestone) {
    if (!entry.milestones[milestone.key].done) longest = Math.max(longest, milestone.daysBefore);
  });
  const squeeze = longest > window && longest > 0 ? window / longest : 1;

  let changed = 0;
  MILESTONES.forEach(function (milestone) {
    const state = entry.milestones[milestone.key];
    if (state.done || (state.date && !state.auto)) return;

    const date = laterDate(today, addDays(submitDate, -Math.round(milestone.daysBefore * squeeze)));
    if (state.date !== date) changed++;
    state.date = date;
    state.auto = true;
  });
  return changed;
}

// "Round 1 deadline" / "final deadline", for use in sentences
function deadlineName(round) {
  return round.key === "final" ? "final deadline" : round.label + " deadline";
}

// The strategy notes shown on the card, most important first
function strategyNotes(uni, entry, analysis, plan) {
  const notes = [];
  if (FINISHED_STATUSES.indexOf(entry.status) !== -1) return notes;

  const target = plan.target;

  // Problems first
  if (analysis.rounds.length > 0 && !analysis.rounds.some(function (r) { return r.date >= todayText(); })) {
    notes.push({ type: "is-late", icon: "circle-alert",
      text: "Every deadline we know of has passed. Check the university's website for later rounds." });
    return notes;
  }
  if (target && entry.plannedDate && entry.plannedDate > target.date) {
    notes.push({ type: "is-late", icon: "circle-alert",
      text: "Your planned date is " + daysBetween(target.date, entry.plannedDate) + " days after the " +
        deadlineName(target) + ". Move it earlier." });
  }
  if (target && !plan.canMakeTarget) {
    notes.push({ type: "is-late", icon: "circle-alert",
      text: "Finishing every step takes until about " + shortDate(plan.ready) + ", after the " + deadlineName(target) +
        ". Start the slowest steps now, or aim for a later round if there is one." });
  }

  // Why the plan is what it is
  if (analysis.rolling) {
    notes.push({ type: "is-good", icon: "zap",
      text: "Rolling admissions detected (\"" + analysis.rolling + "\"): applications are reviewed as they arrive, so applying as soon as your steps are done gives you the best chance." });
  }
  if (analysis.limited) {
    notes.push({ type: "is-tight", icon: "users",
      text: "Limited places mentioned (\"" + analysis.limited + "\"): early applicants are often prioritised, so aim for the earliest round you can make." });
  }
  if (analysis.multiRound && plan.recommended) {
    const rec = plan.recommended;
    notes.push({ type: "is-good", icon: "target",
      text: rec.label + " (" + shortDate(rec.date) + ") is the earliest round you can be ready for. " +
        "Earlier rounds usually have more places left, which tends to make them your best chance." });
    if (target && target.key !== rec.key && target.date > rec.date) {
      notes.push({ type: "is-tight", icon: "info",
        text: "You're aiming for " + target.label + ". " + rec.label + " is earlier and you could be ready for it." });
    }
  }
  if (target && target.binding) {
    notes.push({ type: "is-tight", icon: "circle-alert",
      text: target.label + " is binding: if you're offered a place, you must accept it. Only choose it for your first choice." });
  }
  if (analysis.equalConsideration) {
    notes.push({ type: "", icon: "info",
      text: "Applications sent before the equal consideration deadline are all treated the same, so applying earlier won't raise your chances. Your buffer is there to protect you from last-minute problems." });
  }
  if (plan.mode === "single" && plan.canMakeTarget) {
    notes.push({ type: "", icon: "info", text: plan.buffer === BUFFER_DAYS.competitive
      ? "Competitive course (\"" + (analysis.competitive || analysis.limited) + "\"): aim to submit " + plan.buffer + " days early, leaving time for tests or interviews."
      : "Aim to submit " + plan.buffer + " days early, leaving time to fix last-minute problems." });
  }

  // The recommendation itself
  if (plan.plannedDate) {
    notes.push({ type: "is-plan", icon: "sparkles",
      text: "Recommended submission date: " + formatDate(plan.plannedDate) +
        (target ? (target.key === "final" ? " (before the final deadline)" : " (for " + target.label + ")") : "") + "." });
  } else if (analysis.rounds.length === 0) {
    notes.push({ type: "", icon: "info",
      text: "No deadline known yet. Add one on the Universities tab or add a round below." });
  }
  return notes;
}


// =========================================================
// 6. TIMELINE CARDS
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

  // Apply the recommended plan: set the submission date and move the
  // planner's milestone dates to fit it (dates you typed stay put)
  function applyPlan() {
    const plan = recommendPlan(uni, entry, analyseAdmissions(uni, entry));
    if (!plan.plannedDate) return false;
    entry.plannedDate = plan.plannedDate;
    entry.plannedAuto = true;
    plannedInput.value = entry.plannedDate;
    scheduleMilestones(entry, entry.plannedDate);
    updateMilestoneInputs();
    return true;
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

  // ----- Left side: dates, target round, rounds, timeline and strategy -----
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
    entry.plannedAuto = false;
    // Move the planner's milestone dates to fit your new date
    if (entry.plannedDate) {
      scheduleMilestones(entry, entry.plannedDate);
      updateMilestoneInputs();
    }
    saveAndRefresh();
  });
  plannedBox.append(plannedLabel, plannedInput);
  dates.append(deadlineBox, plannedBox);

  // Target round dropdown: "Recommended", then every round
  const targetRow = makeElement("div", "tl-target-row");
  const targetLabel = makeElement("label", "tl-date-label", "Target round");
  targetLabel.htmlFor = idPrefix + "target";
  const targetSelect = document.createElement("select");
  targetSelect.id = idPrefix + "target";
  targetSelect.className = "tl-target-select";
  targetSelect.addEventListener("change", function () {
    entry.targetRound = targetSelect.value;
    // Changing the target recalculates the submission date and milestones
    applyPlan();
    saveAndRefresh();
  });
  targetRow.append(targetLabel, targetSelect);

  // The rounds we found, plus a way to add your own
  const roundsBox = makeElement("div", "tl-rounds");

  const visualHolder = makeElement("div");     // the timeline bar
  const strategyHolder = makeElement("div");   // the strategy notes
  left.append(dates, targetRow, roundsBox, visualHolder, strategyHolder);

  // Fill the dropdown and the rounds list (redrawn when rounds change)
  function drawRounds() {
    const analysis = analyseAdmissions(uni, entry);
    const plan = recommendPlan(uni, entry, analysis);
    const today = todayText();

    targetSelect.innerHTML = "";
    const autoOption = document.createElement("option");
    autoOption.value = "auto";
    autoOption.textContent = plan.recommended
      ? "Recommended: " + plan.recommended.label + " (" + shortDate(plan.recommended.date) + ")"
      : "Recommended";
    targetSelect.append(autoOption);
    analysis.rounds.forEach(function (round) {
      const option = document.createElement("option");
      option.value = round.key;
      option.textContent = round.label + " · " + shortDate(round.date) + (round.date < today ? " (passed)" : "");
      option.disabled = round.date < today;
      targetSelect.append(option);
    });
    // If the saved target no longer exists, go back to the recommendation
    if (!analysis.rounds.some(function (r) { return r.key === entry.targetRound; })) entry.targetRound = "auto";
    targetSelect.value = entry.targetRound;

    // The list of rounds
    roundsBox.innerHTML = "";
    const list = makeElement("div", "tl-round-chips");
    analysis.rounds.forEach(function (round) {
      const chip = makeElement("span", "tl-round-chip" + (round.date < today ? " is-past" : ""));
      chip.title = round.label + ": " + formatDate(round.date) + " (" + round.source + ")";
      chip.append(makeElement("strong", "", round.short), " " + shortDate(round.date));
      if (round.manual) {
        const remove = makeElement("button", "tl-chip-remove", "×");
        remove.type = "button";
        remove.setAttribute("aria-label", "Remove " + round.label);
        remove.addEventListener("click", function () {
          entry.manualRounds = entry.manualRounds.filter(function (r) { return r.key !== round.key; });
          drawRounds();
          saveAndRefresh();
        });
        chip.append(remove);
      }
      list.append(chip);
    });

    const addButton = makeElement("button", "tl-add-round");
    addButton.type = "button";
    addButton.append(makeIcon("plus"), "Add round");
    addButton.addEventListener("click", function () {
      addButton.hidden = true;
      addForm.hidden = false;
      nameInput.focus();
    });
    list.append(addButton);

    // A small form for adding a round yourself
    const addForm = makeElement("div", "tl-add-form");
    addForm.hidden = true;
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "e.g. Round 1";
    nameInput.setAttribute("aria-label", "Round name");
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.setAttribute("aria-label", "Round deadline");
    const saveButton = makeElement("button", "button button-small", "Add");
    saveButton.type = "button";
    saveButton.addEventListener("click", function () {
      const label = nameInput.value.trim() || "Round";
      if (!isDateText(dateInput.value)) {
        showToast("Pick the round's deadline first.", "circle-alert");
        return;
      }
      entry.manualRounds.push({ key: "m" + Date.now(), label: label, short: shortRoundName(label), date: dateInput.value });
      drawRounds();
      saveAndRefresh();
    });
    addForm.append(nameInput, dateInput, saveButton);

    roundsBox.append(list, addForm);
    refreshIcons();
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
      state.auto = false;   // you set it, so the planner won't move it
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

  right.append(milestoneHeader, progressBar, list);

  // ----- Footer: buttons -----
  const footer = makeElement("div", "tl-footer");

  const planButton = makeElement("button", "button button-small");
  planButton.type = "button";
  planButton.append(makeIcon("sparkles"), "Plan for me");
  planButton.addEventListener("click", function () {
    if (applyPlan()) {
      showToast("Planned: submit by " + formatDate(entry.plannedDate) + ". Dates you set yourself weren't changed.");
    } else {
      showToast("No deadline or round known yet. Add one first.", "circle-alert");
    }
    saveAndRefresh();
  });

  const exportButton = makeElement("button", "button button-small");
  exportButton.type = "button";
  exportButton.append(makeIcon("calendar-plus"), "Export to calendar");
  exportButton.addEventListener("click", function () {
    exportCalendar([uni], slugify(uni.name) + "-timeline.ics");
  });

  footer.append(planButton, exportButton);

  // ----- Put the card together -----
  const body = makeElement("div", "tl-body");
  body.append(left, right);
  card.append(header, body, footer);

  // Redraw everything that depends on the saved data
  function refresh() {
    const analysis = analyseAdmissions(uni, entry);
    const plan = recommendPlan(uni, entry, analysis);

    // Status color on the card and the dropdown
    STATUSES.forEach(function (status) {
      card.classList.toggle("status-" + status.key, entry.status === status.key);
    });

    visualHolder.innerHTML = "";
    visualHolder.append(buildTimelineVisual(entry, analysis, plan));

    strategyHolder.innerHTML = "";
    strategyHolder.append(buildStrategy(strategyNotes(uni, entry, analysis, plan)));

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

    refreshIcons();
  }

  drawRounds();
  refresh();
  return card;
}

// "Round 1" -> "R1", "Early Decision" -> "ED", "Main deadline" -> "MD"
function shortRoundName(label) {
  const type = ROUND_TYPES.find(function (t) {
    t.pattern.lastIndex = 0;
    return t.pattern.test(label);
  });
  if (type) return type.short;
  return label.split(/\s+/).map(function (word) { return word[0] || ""; }).join("").slice(0, 3).toUpperCase() || "R";
}


// =========================================================
// 7. THE MINI TIMELINE BAR AND STRATEGY NOTES
// Shows today, your planned date and every round on one line.
// The round you're aiming for is blue, the others grey, and the
// final deadline red.
// =========================================================

function buildTimelineVisual(entry, analysis, plan) {
  const box = makeElement("div", "tl-visual");

  // The points to show on the line
  const points = [{ key: "today", kind: "today", label: "Today", date: todayText() }];
  if (entry.plannedDate) points.push({ key: "planned", kind: "planned", label: "Planned", date: entry.plannedDate });
  analysis.rounds.forEach(function (round) {
    const isTarget = plan.target && plan.target.key === round.key;
    points.push({
      key: round.key,
      kind: isTarget ? "target" : (round.key === "final" ? "final" : "round"),
      label: round.label,
      short: round.short,
      date: round.date,
    });
  });

  if (points.length === 1) {
    box.append(makeElement("p", "tl-message", "Set a planned submission date or add a round to see your timeline."));
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

  const track = makeElement("div", "tl-track" + (analysis.rounds.length > 0 ? " has-labels" : ""));

  // Shaded part: time that has already passed
  const elapsed = makeElement("div", "tl-elapsed");
  elapsed.style.width = position(todayText()) + "%";
  track.append(elapsed);

  // Green part: your buffer before the target round closes (red if you're late)
  if (entry.plannedDate && plan.target) {
    const late = entry.plannedDate > plan.target.date;
    const from = late ? plan.target.date : entry.plannedDate;
    const to = late ? entry.plannedDate : plan.target.date;
    const segment = makeElement("div", late ? "tl-segment is-late" : "tl-segment");
    segment.style.left = position(from) + "%";
    segment.style.width = Math.max(position(to) - position(from), 0.5) + "%";
    track.append(segment);
  }

  // A dot for each point. Rounds get a short label above (R1, R2, ED...)
  points.forEach(function (point) {
    const marker = makeElement("span", "tl-marker tl-marker-" + point.kind);
    marker.style.left = position(point.date) + "%";
    marker.title = point.label + ": " + formatDate(point.date);
    if (point.short) marker.append(makeElement("span", "tl-marker-label", point.short));
    track.append(marker);
  });

  // The key under the line, e.g. "● Round 1 15 Nov · in 38 days"
  const legend = makeElement("div", "tl-legend");
  points.forEach(function (point) {
    const item = makeElement("span", "tl-legend-item" + (point.kind === "target" ? " is-target" : ""));
    item.append(
      makeElement("i", "tl-dot tl-marker-" + point.kind),
      makeElement("strong", "", point.label),
      " " + shortDate(point.date) + (point.key === "today" ? "" : " · " + relativeDays(point.date))
    );
    legend.append(item);
  });

  box.append(track, legend);
  return box;
}

function buildStrategy(notes) {
  const list = makeElement("ul", "tl-strategy");
  notes.forEach(function (note) {
    const item = makeElement("li", "tl-note " + note.type);
    item.append(makeIcon(note.icon), makeElement("span", "", note.text));
    list.append(item);
  });
  return list;
}


// =========================================================
// 8. THE SUMMARY AT THE TOP
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

    // The deadline of the round you're aiming for
    const plan = recommendPlan(uni, entry, analyseAdmissions(uni, entry));
    if (plan.target && daysUntil(plan.target.date) >= 0) {
      upcoming.push({ date: plan.target.date,
        text: plan.target.key === "final" ? "Deadline" : plan.target.label + " deadline", uni: uni });
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
    next.append(makeIcon("info"), makeElement("span", "", "Use Plan for me on a card to plan your steps."));
  }
  if (overdue > 0) {
    next.append(makeElement("span", "tl-overdue-count", overdue + (overdue === 1 ? " step overdue" : " steps overdue")));
  }

  timelineSummary.append(chips, next);
  refreshIcons();
}


// =========================================================
// 9. CALENDAR EXPORT (.ics FILES)
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

// The events for one university: round deadlines, planned date, unfinished milestones
function calendarEvents(uni) {
  const entry = TimelineStore.get(uni.id);
  const analysis = analyseAdmissions(uni, entry);
  const plan = recommendPlan(uni, entry, analysis);
  const events = [];
  const details = uni.course + " at " + uni.name;

  analysis.rounds.forEach(function (round) {
    if (round.date < todayText()) return;
    const isTarget = plan.target && plan.target.key === round.key;
    const isFinal = round.key === "final";
    events.push({
      key: isFinal ? "deadline" : "round-" + round.key,  // "deadline" keeps the same id as before
      date: round.date,
      title: (isFinal ? "Deadline" : round.label + " deadline") + ": " + uni.name,
      description: (isFinal ? "Official application deadline" : round.label + " deadline") + " for " + details + "." +
        (isTarget ? " This is your target round." : ""),
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
    showToast("No dates to export yet. Set a planned date or use Plan for me first.", "circle-alert");
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
// 10. DRAWING THE PAGE
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
