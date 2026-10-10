// =========================================================
// PLANMYFUTURE: auth.js
// Signing in with Supabase: email + password.
//
// Sections: 16. Signing in
// (Loads after profile.js and before main.js.)
//
// Signed in, your planner is also saved to your account (sync.js),
// so it's the same on every device you sign in on.
// =========================================================

// =========================================================
// 16. SIGNING IN
// =========================================================

// Your Supabase project. The publishable key is MEANT to be in website
// code: the database's security rules (supabase/schema.sql) decide what
// each signed-in person can see. Never put the "secret" key here.
const SUPABASE_URL = "https://xhyiyxquqnntvnpnlnhk.supabase.co";
const SUPABASE_KEY = "sb_publishable_3POa8JWn5D5d303JVTiDXw_OevNvdpY";

// The Supabase library (index.html) creates `window.supabase`.
// If it didn't load (offline, blocked), the site still works without accounts.
const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { flowType: "implicit" },   // "Forgot password" email links work on any device
    })
  : null;

let currentUser = null;   // the signed-in person, or null

const accountButton = document.getElementById("account-button");
const accountLabel = document.getElementById("account-label");
const accountDialog = document.getElementById("account-dialog");
const signInForm = document.getElementById("sign-in-form");
const signInEmail = document.getElementById("sign-in-email");
const signInPassword = document.getElementById("sign-in-password");
const signInButton = document.getElementById("sign-in-submit");
const signUpButton = document.getElementById("sign-up");
const forgotButton = document.getElementById("forgot-password");
const setPasswordForm = document.getElementById("set-password-form");
const newPassword = document.getElementById("new-password");
const changePasswordButton = document.getElementById("change-password");
const deleteConfirm = document.getElementById("delete-confirm");

const MIN_PASSWORD = 8;            // Supabase also checks this (Authentication → Policies)
let choosingNewPassword = false;   // true after opening a "Forgot password" email link

// Show one of the dialog's three views: "sign-in", "sent" or "signed-in"
function showAccountView(view) {
  accountDialog.querySelectorAll("[data-view]").forEach(function (part) {
    part.hidden = part.dataset.view !== view;
  });
}

// Does this account have a password? Supabase doesn't tell the website, so
// we note it on the account ("has_password") when one is created or used.
// Accounts made with the old email link don't have the note yet.
function hasPassword(user) {
  return Boolean(user && user.user_metadata && user.user_metadata.has_password);
}

// Update the header button and the dialog after signing in or out
function showAccount() {
  accountLabel.textContent = currentUser ? currentUser.email : "Sign in";
  accountButton.classList.toggle("is-signed-in", Boolean(currentUser));
  if (currentUser) {
    document.getElementById("account-email").textContent = currentUser.email;
    // No password yet (or just opened a "Forgot password" link): show the form.
    // Has one: only a small "Change password" link, which opens the form.
    const needsPassword = choosingNewPassword || !hasPassword(currentUser);
    document.getElementById("new-password-label").textContent =
      choosingNewPassword ? "Choose a new password" : needsPassword ? "Set a password" : "New password";
    setPasswordForm.hidden = !needsPassword;
    changePasswordButton.hidden = needsPassword;
    showAccountView("signed-in");
  } else if (!accountDialog.open) {
    showAccountView("sign-in");
  }
}

if (!supabaseClient) {
  accountButton.hidden = true;
} else {
  // Runs once at the start (with any saved session) and after every sign-in or sign-out
  supabaseClient.auth.onAuthStateChange(function (event, session) {
    const wasSignedIn = Boolean(currentUser);
    currentUser = session ? session.user : null;
    // setTimeout: Supabase asks that nothing else waits inside this callback
    setTimeout(function () {
      showAccount();
      if (event === "SIGNED_IN" && !wasSignedIn && !choosingNewPassword) {
        showToast("Signed in as " + currentUser.email + ". Your planner now saves to your account.", "user-check");
      }
      // Opened a "Forgot password" link: you're signed in, now pick a new password
      if (event === "PASSWORD_RECOVERY") {
        choosingNewPassword = true;
        showAccount();
        if (!accountDialog.open) accountDialog.showModal();
        newPassword.focus();
      }
      // Signed in (here or in another tab): load your account's planner, once the page is ready
      if (event === "SIGNED_IN" && currentUser) {
        appReady.then(async function () {
          if (cloudUser && cloudUser.id === currentUser.id) return;
          if (await connectToAccount(currentUser)) showWholePlanner();
        });
      }
      // Signed out in another tab: this tab forgets the planner too
      if (event === "SIGNED_OUT" && cloudUser) {
        clearLocalPlanner();
        showWholePlanner();
      }
    }, 0);
  });
}

// Start the window fresh: empty boxes, passwords hidden, nothing half-done
function resetAccountWindow() {
  [signInEmail, signInPassword, newPassword].forEach(function (box) { box.value = ""; });
  accountDialog.querySelectorAll(".password-toggle").forEach(function (button) { setPasswordShown(button, false); });
  deleteConfirm.hidden = true;
  showAccountView("sign-in");   // showAccount() then picks the right view
  showAccount();
}

accountButton.addEventListener("click", function () {
  resetAccountWindow();
  accountDialog.showModal();
  if (!currentUser) signInEmail.focus();
});

// Only the ✕ button closes the window (clicking outside it doesn't,
// so a half-typed sign-up isn't lost). Escape also still works.
document.getElementById("account-close").addEventListener("click", function () {
  accountDialog.close();
});

// ----- The eye button: show or hide a password -----
function setPasswordShown(button, shown) {
  const box = button.parentElement.querySelector("input");
  box.type = shown ? "text" : "password";
  button.setAttribute("aria-pressed", String(shown));
  button.setAttribute("aria-label", shown ? "Hide password" : "Show password");
}

accountDialog.querySelectorAll(".password-toggle").forEach(function (button) {
  button.addEventListener("click", function () {
    setPasswordShown(button, button.getAttribute("aria-pressed") !== "true");
  });
});

// Has a password: "Change password" opens the form
changePasswordButton.addEventListener("click", function () {
  changePasswordButton.hidden = true;
  setPasswordForm.hidden = false;
  newPassword.focus();
});

// Remember on the account that it has a password (see hasPassword)
function notePassword() {
  return supabaseClient.auth.updateUser({ data: { has_password: true } });
}

// ----- Checking what was typed -----

function isEmail(text) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

// The email from the form, or null (with a message) if it isn't one
function readEmail() {
  const email = signInEmail.value.trim();
  if (isEmail(email)) return email;
  showToast("Enter your email address, like name@example.com.", "circle-alert");
  signInEmail.focus();
  return null;
}

// The password from a box, or null (with a message) if it's too short
function readPassword(box) {
  if (box.value.length >= MIN_PASSWORD) return box.value;
  showToast("Your password needs at least " + MIN_PASSWORD + " characters.", "circle-alert");
  box.focus();
  return null;
}

// Grey out a button while Supabase is working, so it isn't clicked twice
async function whileBusy(button, task) {
  button.disabled = true;
  try {
    return await task();
  } finally {
    button.disabled = false;
  }
}

// Supabase's error -> a sentence for people
function describeAuthError(error) {
  const code = error.code || "";
  if (code === "invalid_credentials") {
    return "Wrong email or password. No password yet? Use \"Forgot password\" to get a link, then set one.";
  }
  if (code === "email_not_confirmed") return "Confirm your email first: open the link we sent you.";
  if (code === "user_already_exists") return "There's already an account with this email. Sign in instead, or use \"Forgot password\".";
  if (code === "weak_password") return "Choose a stronger password: longer, with letters and numbers.";
  if (code === "same_password") return "That's already your password.";
  if (error.status === 429) return "Too many tries for now. Wait a few minutes and try again.";
  return error.message || "Something went wrong. Try again.";
}

function showSent(message) {
  document.getElementById("sent-message").textContent = message;
  showAccountView("sent");
}

// The page the email links bring you back to (this one)
function thisPage() {
  return location.origin + location.pathname;
}


// ----- Sign in (the form's main button, or Enter) -----
signInForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  const email = readEmail();
  if (!email) return;
  if (!signInPassword.value) {
    showToast("Enter your password.", "circle-alert");
    signInPassword.focus();
    return;
  }

  const result = await whileBusy(signInButton, function () {
    return supabaseClient.auth.signInWithPassword({ email: email, password: signInPassword.value });
  });
  if (result.error) {
    showToast(describeAuthError(result.error), "circle-alert");
    return;
  }
  // Signed in: onAuthStateChange (above) loads your account's planner
  signInPassword.value = "";
  accountDialog.close();
  // Signed in with a password, so the account has one (older accounts lack the note)
  if (!hasPassword(result.data.user)) notePassword();
});

// ----- Create account -----
signUpButton.addEventListener("click", async function () {
  const email = readEmail();
  if (!email) return;
  const password = readPassword(signInPassword);
  if (!password) return;

  const result = await whileBusy(signUpButton, function () {
    return supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: { emailRedirectTo: thisPage(), data: { has_password: true } },
    });
  });
  if (result.error) {
    showToast(describeAuthError(result.error), "circle-alert");
    return;
  }
  signInPassword.value = "";
  if (result.data.session) {
    accountDialog.close();   // signed in straight away
  } else {
    // Supabase's "Confirm email" setting is on: an email has to be opened first
    showSent("We sent a confirmation link to " + email + ". Open it to finish creating your account.");
  }
});

// ----- Forgot password: email a link that signs you in to choose a new one -----
forgotButton.addEventListener("click", async function () {
  const email = readEmail();
  if (!email) return;
  const result = await whileBusy(forgotButton, function () {
    return supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: thisPage() });
  });
  if (result.error) {
    showToast(describeAuthError(result.error), "circle-alert");
    return;
  }
  showSent("If there's an account for " + email + ", we sent it a link. Open it and you'll be asked to choose a new password.");
});

document.getElementById("back-to-sign-in").addEventListener("click", function () {
  showAccountView("sign-in");
  signInEmail.focus();
});

// ----- Set (or change) your password, while signed in -----
setPasswordForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  const password = readPassword(newPassword);
  if (!password) return;
  const result = await whileBusy(document.getElementById("set-password-submit"), function () {
    return supabaseClient.auth.updateUser({ password: password, data: { has_password: true } });
  });
  if (result.error) {
    showToast(describeAuthError(result.error), "circle-alert");
    return;
  }
  newPassword.value = "";
  choosingNewPassword = false;
  if (result.data && result.data.user) currentUser = result.data.user;   // now with has_password
  showAccount();
  showToast("Password saved. Next time, sign in with your email and password.", "key-round");
});

document.getElementById("sign-out").addEventListener("click", async function () {
  // Send your latest changes first, so nothing is lost
  if (!(await flushToAccount())) {
    showToast("Couldn't save your latest changes to your account. Check your connection and try again.", "circle-alert");
    return;
  }
  await supabaseClient.auth.signOut();
  currentUser = null;
  // Remove the planner from this browser (it's safe in your account)
  clearLocalPlanner();
  showWholePlanner();
  showAccount();
  accountDialog.close();
  setSaveStatus("saved", "Saved");
  showToast("Signed out. Your planner is saved in your account and was removed from this browser.", "log-out");
});


// ----- Delete my account -----
// Asks once more, then calls delete_my_account() in the database
// (supabase/schema.sql). That deletes the login and the planner row.
// Then this browser forgets everything too.

document.getElementById("delete-account").addEventListener("click", function () {
  deleteConfirm.hidden = false;
  document.getElementById("delete-cancel").focus();
});

document.getElementById("delete-cancel").addEventListener("click", function () {
  deleteConfirm.hidden = true;
});

document.getElementById("delete-confirm-button").addEventListener("click", async function () {
  const button = this;
  const result = await whileBusy(button, function () {
    return supabaseClient.rpc("delete_my_account");
  });
  if (result.error) {
    const notSetUp = result.error.code === "PGRST202";   // the database function is missing
    showToast(notSetUp
      ? "Deleting accounts isn't set up yet. Please email us and we'll delete it for you."
      : "Couldn't delete your account: " + describeAuthError(result.error), "circle-alert");
    return;
  }

  // The account is gone: sign out here (only locally, the server no longer knows it)
  await supabaseClient.auth.signOut({ scope: "local" });
  currentUser = null;
  clearLocalPlanner();                 // empty planner, stop syncing (sync.js)
  forgetEverythingInThisBrowser();     // API key, cached searches, settings…
  showWholePlanner();
  updateAiState();
  showAccount();
  accountDialog.close();
  setSaveStatus("saved", "Saved");
  showToast("Your account and all its data were deleted.", "trash-2");
});

// Remove everything planmyfuture saved in this browser
function forgetEverythingInThisBrowser() {
  state.settings.apiKey = "";
  state.searchCache = {};
  state.settings.homePlace = null;
  try {
    Object.keys(localStorage).forEach(function (key) {
      if (key.startsWith("future-planner-") || key.startsWith("sb-")) localStorage.removeItem(key);
    });
  } catch (error) {
    // storage blocked: nothing was saved anyway
  }
}

