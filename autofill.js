// =========================================================
// MY FUTURE PLANNER: autofill.js
// Auto-fill: Wikidata, Wikipedia and Claude. runAutoFill() is the one entry point.
//
// Sections: 7. Auto-fill, plus remembered searches and the API key settings
// (The site's JavaScript is split into files that load in this order:
//  store.js, helpers.js, dates.js, globe.js, autofill.js, universities.js,
//  profile.js, main.js, timeline.js. The section numbers run across all of them.)
//
// The Claude API key is used ONLY in this file (runAutoFill and
// searchOfficialPages). The backend will replace runAutoFill's inside.
// =========================================================

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

// ----- Running a search: runAutoFill() -----
// The ONE function the rest of the site calls to auto-fill a university.
// It's also the only place that uses your Claude API key.
//
// BACKEND: when the server is ready, this function's inside becomes one
// request, e.g. fetch("/api/autofill", ...), and the key lives on the
// server. Everything that calls runAutoFill() stays the same.
//
// request = { name, course, fresh }   fresh: true skips remembered searches
// onStep(i) is called as each step starts (for the loading animation)
// Returns { result, details, errorText, cachedAt }:
//   result    the combined university details (see below)
//   details   what Claude found, or null (no key, or the search failed)
//   errorText why the Claude search failed, or ""
//   cachedAt  when a remembered search was saved, or null for a new search
async function runAutoFill(request, onStep) {
  const name = request.name;
  const course = request.course;
  const apiKey = getApiKey();
  const step = onStep || function () {};

  // Use a remembered search if there is one (only for AI searches, since
  // those are the ones that cost money)
  const cacheKey = searchCacheKey(name, course);
  const cached = apiKey && !request.fresh ? getCachedSearch(cacheKey) : null;

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
    step(0);
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
      step(1);
      try {
        details = await searchOfficialPages(apiKey, found ? found.officialName : name, course, found);
      } catch (error) {
        errorText = error.message || "The online search failed. Try again.";
      }
    }

    about = await aboutRequest;

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

  return { result: result, details: details, errorText: errorText, cachedAt: cached ? cached.savedAt : null };
}

// True when auto-fill can search official websites with Claude
function hasAiSearch() {
  return Boolean(getApiKey());
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
