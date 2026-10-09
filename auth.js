// =========================================================
// PLANMYFUTURE: auth.js
// Signing in with Supabase: an email link, no password.
//
// Sections: 16. Signing in
// (Loads after profile.js and before main.js.)
//
// For now, signing in only creates your account. Your data still
// saves in this browser; saving it to your account comes next
// (store.js will use supabaseClient then).
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
      auth: { flowType: "implicit" },   // the email link works on any device
    })
  : null;

let currentUser = null;   // the signed-in person, or null

const accountButton = document.getElementById("account-button");
const accountLabel = document.getElementById("account-label");
const accountDialog = document.getElementById("account-dialog");
const signInForm = document.getElementById("sign-in-form");
const signInEmail = document.getElementById("sign-in-email");
const signInButton = document.getElementById("sign-in-submit");

// Show one of the dialog's three views: "sign-in", "sent" or "signed-in"
function showAccountView(view) {
  accountDialog.querySelectorAll("[data-view]").forEach(function (part) {
    part.hidden = part.dataset.view !== view;
  });
}

// Update the header button and the dialog after signing in or out
function showAccount() {
  accountLabel.textContent = currentUser ? currentUser.email : "Sign in";
  accountButton.classList.toggle("is-signed-in", Boolean(currentUser));
  if (currentUser) {
    document.getElementById("account-email").textContent = currentUser.email;
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
      if (event === "SIGNED_IN" && !wasSignedIn) showToast("Signed in as " + currentUser.email + ".", "user-check");
    }, 0);
  });
}

accountButton.addEventListener("click", function () {
  showAccount();
  accountDialog.showModal();
  if (!currentUser) signInEmail.focus();
});

document.getElementById("account-close").addEventListener("click", function () {
  accountDialog.close();
});

// Clicking the dark area around the dialog closes it too
accountDialog.addEventListener("click", function (event) {
  if (event.target === accountDialog) accountDialog.close();
});

signInForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  const email = signInEmail.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast("Enter your email address, like name@example.com.", "circle-alert");
    signInEmail.focus();
    return;
  }

  signInButton.disabled = true;
  const result = await supabaseClient.auth.signInWithOtp({
    email: email,
    // The link in the email brings you back to this exact page
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  signInButton.disabled = false;

  if (result.error) {
    // Supabase's free email service only sends a few emails per hour
    const tooMany = result.error.status === 429;
    showToast(tooMany
      ? "Too many sign-in emails for now. Wait a few minutes and try again."
      : "Couldn't send the email: " + result.error.message, "circle-alert");
    return;
  }
  document.getElementById("sent-email").textContent = email;
  showAccountView("sent");
});

document.getElementById("sign-out").addEventListener("click", async function () {
  await supabaseClient.auth.signOut();
  currentUser = null;
  showAccount();
  accountDialog.close();
  showToast("Signed out. Your data is still saved in this browser.", "log-out");
});
