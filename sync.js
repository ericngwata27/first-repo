// =========================================================
// PLANMYFUTURE: sync.js
// Saving your planner to your account (Supabase), so it's the same
// on every device you sign in on.
//
// Sections: 17. Your account's copy
// (Loads after auth.js and before main.js.)
//
// How it works:
//   - Signed out: nothing here runs. The planner lives in this browser.
//   - Signed in: the browser keeps its copy (fast, works offline), and
//     every change is ALSO sent to your account, about a second later.
//   - Opening the site signed in loads your account's copy.
//   - Sign out: the latest changes are sent, then this browser's copy
//     is removed (handy on shared computers).
// The table is `planner_data` (supabase/schema.sql): one row per person.
// =========================================================

// =========================================================
// 17. YOUR ACCOUNT'S COPY
// =========================================================

// Which parts of `state` are saved to the account, and their column names.
// (Not the API key, search cache or home position: those stay in the browser.)
const CLOUD_COLUMNS = {
  universities: "universities",
  timeline: "timeline",
  profile: "profile",
  academicProfile: "academic_profile",
  globeSettings: "settings",
};

let cloudUser = null;         // whose account we're saving to (null = browser only)
let cloudUpdatedAt = null;    // when the account's copy last changed (to spot changes from other devices)
let cloudTimer = null;        // waits a moment so typing doesn't send every letter
let cloudSaving = false;      // a save is on its way
let cloudDirty = false;       // there are changes the account doesn't have yet
let changedWhileOffline = false;   // signed in but the account couldn't be reached, and you made changes

// Tell the page (main.js shows it in the header)
function cloudEvent(name) {
  document.dispatchEvent(new CustomEvent(name));
}

// Your planner in the shape of one `planner_data` row
function cloudRow() {
  return {
    user_id: cloudUser.id,
    universities: state.universities,
    timeline: state.timeline,
    profile: state.profile,
    academic_profile: state.academicProfile,
    settings: { globe: state.settings.globe },
  };
}

// True if this browser has nothing worth keeping
function isPlannerEmpty() {
  const hasText = function (object) {
    return Object.values(object || {}).some(function (value) { return typeof value === "string" && value.trim() !== ""; });
  };
  return state.universities.length === 0 && !hasText(state.profile) && !hasText(state.academicProfile);
}

// Use a row from the account as the planner
function useCloudRow(row) {
  state.universities = Array.isArray(row.universities) ? row.universities : [];
  state.timeline = row.timeline || {};
  state.profile = row.profile || {};
  state.academicProfile = row.academic_profile || {};
  if (row.settings && row.settings.globe) state.settings.globe = row.settings.globe;
}

// Add this browser's planner to the account's (nothing is thrown away):
// universities the account doesn't have are added, and empty profile
// boxes in the account are filled from this browser.
function mergeIntoCloudRow(row) {
  const merged = {
    universities: (row.universities || []).slice(),
    timeline: Object.assign({}, row.timeline),
    profile: Object.assign({}, row.profile),
    academic_profile: Object.assign({}, row.academic_profile),
    settings: row.settings || {},
  };
  const known = new Set(merged.universities.map(function (uni) { return String(uni.id); }));
  state.universities.forEach(function (uni) {
    if (known.has(String(uni.id))) return;
    merged.universities.push(uni);
    if (state.timeline[uni.id]) merged.timeline[uni.id] = state.timeline[uni.id];
  });
  [[state.profile, merged.profile], [state.academicProfile, merged.academic_profile]].forEach(function (pair) {
    const inBrowser = pair[0];
    const inAccount = pair[1];
    Object.keys(inBrowser).forEach(function (key) {
      if (!inAccount[key] && inBrowser[key]) inAccount[key] = inBrowser[key];
    });
  });
  return merged;
}

// Save the parts the account holds into this browser too (its local copy)
function saveCloudPartsLocally() {
  Object.keys(CLOUD_COLUMNS).forEach(function (part) { SAVERS[part](); });
  DataStore.writeText(STORAGE_KEYS.owner, cloudUser ? cloudUser.id : "");
}

// Read this person's row. Returns the row, null if there isn't one yet,
// or throws if the account couldn't be reached.
async function fetchCloudRow(userId) {
  const result = await supabaseClient.from("planner_data").select("*").eq("user_id", userId).limit(1)
    .abortSignal(AbortSignal.timeout(6000));   // don't keep the page waiting more than 6 seconds
  if (result.error) throw result.error;
  return result.data[0] || null;
}

// Connect this browser to someone's account. Called at startup (loadState)
// and right after signing in. Returns true if it worked.
async function connectToAccount(user) {
  let row;
  try {
    row = await fetchCloudRow(user.id);
  } catch (error) {
    cloudEvent("cloud-offline");
    return false;
  }

  // Whose planner is in this browser? "" = never connected to an account
  const owner = DataStore.readText(STORAGE_KEYS.owner);

  cloudUser = user;
  if (owner !== "" && owner !== user.id) {
    // Someone else's planner was left here: never mix it into this account
    useCloudRow(row || {});
    if (!row) cloudDirty = true;
  } else if (owner === user.id) {
    if (changedWhileOffline || !row) cloudDirty = true;   // your newest changes are here: send them
    else useCloudRow(row);                                 // the normal case: the account's copy wins
  } else if (row && isPlannerEmpty()) {
    useCloudRow(row);                       // first time in this browser, nothing here yet
  } else if (row) {
    useCloudRow(mergeIntoCloudRow(row));    // first time here, and both have a planner: keep both
    cloudDirty = true;
  } else {
    cloudDirty = true;                      // a new account: upload this browser's planner
  }
  cloudUpdatedAt = row ? row.updated_at : null;
  changedWhileOffline = false;
  // The account's copy is always in today's format: the one-time updates
  // for old data (upgradeOldData in main.js) must not run on it
  state.meta.timelineVersion = Math.max(state.meta.timelineVersion, 2);
  SAVERS.meta();
  saveCloudPartsLocally();

  if (cloudDirty) return pushToAccount();
  cloudEvent("cloud-saved");
  return true;
}

// Send the whole planner to the account. Returns true if it worked.
async function pushToAccount() {
  if (!cloudUser) return false;
  if (cloudSaving) { cloudDirty = true; return false; }   // the save already running sends it again after
  clearTimeout(cloudTimer);
  cloudSaving = true;
  cloudDirty = false;
  cloudEvent("cloud-saving");

  const result = await supabaseClient.from("planner_data").upsert(cloudRow()).select("updated_at");
  cloudSaving = false;
  if (result.error) {
    cloudDirty = true;
    cloudEvent("cloud-save-failed");
    return false;
  }
  cloudUpdatedAt = result.data[0] ? result.data[0].updated_at : cloudUpdatedAt;
  if (cloudDirty) return pushToAccount();   // more changes came in while saving
  cloudEvent("cloud-saved");
  return true;
}

// Called by save() (store.js) after every change
function scheduleCloudSave(part) {
  if (!(part in CLOUD_COLUMNS)) return;
  if (!cloudUser) {
    if (currentUser) changedWhileOffline = true;   // signed in, but the account wasn't reachable
    return;
  }
  cloudDirty = true;
  cloudEvent("cloud-saving");
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(pushToAccount, 800);
}

// Send anything waiting right now (before signing out). True if all saved.
async function flushToAccount() {
  if (!cloudUser) return true;
  clearTimeout(cloudTimer);
  if (cloudDirty || cloudSaving) {
    while (cloudSaving) await new Promise(function (resolve) { setTimeout(resolve, 100); });
    if (cloudDirty && !(await pushToAccount())) return false;
  }
  return true;
}

// Forget the planner in this browser (after signing out)
function clearLocalPlanner() {
  clearTimeout(cloudTimer);
  cloudUser = null;
  cloudUpdatedAt = null;
  cloudDirty = false;
  useCloudRow({ settings: { globe: state.settings.globe } });
  saveCloudPartsLocally();
}

// When you come back to this tab (e.g. after using your phone), load any
// changes made on another device. Returns true if the planner changed.
async function refreshFromAccount() {
  if (!currentUser) return false;
  if (!cloudUser) return connectToAccount(currentUser);   // reconnect after being offline
  if (cloudDirty || cloudSaving) return false;            // our own changes go first
  let row;
  try {
    row = await fetchCloudRow(cloudUser.id);
  } catch (error) {
    return false;
  }
  if (!row || row.updated_at === cloudUpdatedAt || cloudDirty || cloudSaving) return false;
  useCloudRow(row);
  cloudUpdatedAt = row.updated_at;
  saveCloudPartsLocally();
  return true;
}

// Don't close the page while changes are still on their way
window.addEventListener("beforeunload", function (event) {
  if (cloudDirty || cloudSaving) {
    event.preventDefault();
    event.returnValue = "";
  }
});

// Back online: send what's waiting
window.addEventListener("online", function () {
  if (cloudDirty) pushToAccount();
});
