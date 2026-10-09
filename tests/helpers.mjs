// Shared setup for the tests.
//
// The website loads its libraries (Globe.gl, three.js, icons) and globe
// pictures from the internet. Tests serve the same exact versions from
// node_modules instead, so they're fast and don't depend on the internet.
// Every other outside request (fonts, Wikidata, map search, Claude, Supabase) is
// blocked unless a test answers it itself.
import { test as base, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const MODULES = fileURLToPath(new URL("../node_modules/", import.meta.url));

// Everything in the tests happens on this date
export const TODAY = new Date("2026-10-09T10:00:00Z");

const LOCAL_COPIES = [
  [/unpkg\.com\/globe\.gl@[^/]+\/dist\/(.*)$/, "globe.gl/dist/"],
  [/unpkg\.com\/globe\.gl@[^/]+\/example\/datasets\/(.*)$/, "globe.gl/example/datasets/"],
  [/unpkg\.com\/three-globe@[^/]+\/example\/img\/(.*)$/, "three-globe/example/img/"],
  [/unpkg\.com\/three@[^/]+\/(.*)$/, "three/"],
  [/unpkg\.com\/lucide@[^/]+\/(.*)$/, "lucide/"],
  [/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^/]+\/(.*)$/, "@supabase/supabase-js/"],
];

const TYPES = { js: "text/javascript", json: "application/json", geojson: "application/json",
  jpg: "image/jpeg", png: "image/png" };

export const test = base.extend({
  page: async ({ page }, use) => {
    page.errors = [];
    page.on("pageerror", (error) => page.errors.push(error.message));

    // Start the browser's clock on TODAY and let it run normally from there
    await page.clock.install({ time: TODAY });
    await page.clock.resume();

    await page.route(/^https?:\/\/(?!localhost)/, async (route) => {
      const url = route.request().url();
      for (const [pattern, folder] of LOCAL_COPIES) {
        const match = url.match(pattern);
        if (match) {
          const path = match[1].split("?")[0];
          return route.fulfill({
            body: await readFile(MODULES + folder + path),
            contentType: TYPES[path.split(".").pop()] || "application/octet-stream",
            headers: { "access-control-allow-origin": "*" },
          });
        }
      }
      return route.fulfill({ status: 404, body: "" });
    });

    await use(page);
  },
});

export { expect };

// Fill the browser's saved data, then load the site.
// data = { universities: [...], timeline: {...}, profile: {...}, settings: {...} }
export async function openWith(page, data = {}) {
  await page.goto("/");
  // Wait until the page has finished loading (and syncing, if signed in)
  await expect(page.locator("#save-status")).not.toHaveAttribute("data-state", "loading", { timeout: 15000 });
  await page.evaluate((data) => {
    localStorage.clear();
    // The globe stays still in tests, so its pins don't move under the mouse
    localStorage.setItem("future-planner-globe-settings", JSON.stringify({ spin: false }));
    localStorage.setItem("future-planner-timeline-version", "2");
    if (data.universities) localStorage.setItem("future-planner-universities", JSON.stringify(data.universities));
    if (data.timeline) localStorage.setItem("future-planner-timeline", JSON.stringify(data.timeline));
    if (data.academicProfile) localStorage.setItem("future-planner-academic-profile", JSON.stringify(data.academicProfile));
    if (data.apiKey) localStorage.setItem("future-planner-claude-key", data.apiKey);
  }, data);
  await page.reload();
  await expect(page.locator(".logo")).toBeVisible();
}

export async function openTab(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
}

// Two universities in the old saved format, used by several tests
export const ESCP = {
  id: 1, name: "ESCP Business School", course: "Bachelor in Management", city: "Paris", country: "France",
  deadline: "2026-10-27", lat: 48.85, lng: 2.35, intake: "2027-09", aiSearched: true,
  applicationDates: [
    { label: "Round 1", campus: "Turin", date: "2026-10-27", type: "deadline" },
    { label: "Round 1", campus: "Paris", date: "2026-11-18", type: "deadline" },
    { label: "Round 1 results", campus: "Paris", date: "2026-12-18", type: "decision" },
  ],
};
export const ESADE = {
  id: 2, name: "Esade", course: "BBA", city: "Barcelona", country: "Spain",
  deadline: "2027-06-30", lat: 41.39, lng: 2.11, rolling: true, applicationDates: [],
};

// Pretend someone is signed in: save a Supabase session the way the
// Supabase library does, before the page loads
export async function signInAs(page, email) {
  await page.addInitScript((email) => {
    localStorage.setItem("sb-xhyiyxquqnntvnpnlnhk-auth-token", JSON.stringify({
      access_token: "test-token", refresh_token: "test-refresh", token_type: "bearer",
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "00000000-0000-4000-8000-000000000001", email, aud: "authenticated", role: "authenticated" },
    }));
  }, email);
}

// A pretend Supabase database for the signed-in person's planner.
// `row` is what's already in their account (null = nothing yet).
// Every save the website sends is kept in account.uploads.
export async function fakeAccount(page, row = null) {
  const account = { row, uploads: [] };
  await page.route(/supabase\.co\/rest\/v1\/planner_data/, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      return route.fulfill({ json: account.row ? [account.row] : [] });
    }
    const body = request.postDataJSON();
    account.row = { ...body, updated_at: new Date().toISOString() };
    account.uploads.push(body);
    return route.fulfill({ status: 201, json: [{ updated_at: account.row.updated_at }] });
  });
  return account;
}
