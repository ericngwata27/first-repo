// Core tests for My Future Planner. Run them with: npm test
//
// Each test opens the website in a real (headless) Chrome, clicks around
// like a person would, and checks what's on screen and what was saved.
import { test, expect, openWith, openTab, ESCP, ESADE } from "./helpers.mjs";

// ----- Fake answers for the outside services used when adding a university -----

// Wikidata: "ESCP" is a business school in Paris
async function fakeWikidata(page) {
  await page.route(/wikidata\.org/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    let body;
    if (params.get("action") === "wbsearchentities") {
      body = { search: [{ id: "Q1", label: "ESCP Business School", description: "business school in Paris" }] };
    } else if (params.get("ids") === "Q1") {
      const claim = (value) => [{ rank: "normal", mainsnak: { datavalue: { value } } }];
      body = { entities: { Q1: {
        labels: { en: { value: "ESCP Business School" } },
        claims: {
          P625: claim({ latitude: 48.85, longitude: 2.35 }),
          P856: claim("https://escp.eu"),
          P17: claim({ id: "Q142" }),
          P131: claim({ id: "Q90" }),
        },
        sitelinks: {},
      } } };
    } else {
      body = { entities: { Q142: { labels: { en: { value: "France" } } }, Q90: { labels: { en: { value: "Paris" } } } } };
    }
    return route.fulfill({ json: body });
  });
}

// Claude: an answer with several application dates
async function fakeClaude(page) {
  await page.route(/api\.anthropic\.com/, (route) => route.fulfill({ json: {
    stop_reason: "end_turn",
    content: [{ type: "text", text: [
      "City: Paris",
      "Country: France",
      "Application Deadline: 18 November 2026",
      "Entry Requirements: A-levels or equivalent.",
      "Application Dates: deadline | Turin | Round 1 | 27 October 2026 | https://escp.eu/dates; " +
        "deadline | Paris | Round 1 | 18 November 2026 | https://escp.eu/dates; " +
        "decision | Paris | Round 1 results | 18 December 2026 | https://escp.eu/dates",
      "Rolling Admissions: no",
    ].join("\n") }],
  } }));
}

async function addUniversity(page, name, course) {
  await page.fill("#name", name);
  await page.fill("#course", course);
  await page.click("#submit-button");                       // Find details
  await expect(page.locator("#city")).toHaveValue("Paris");
  await page.click("#submit-button");                       // Add to map
}

const card = (page, id) => page.locator(`.tl-card[data-id="${id}"]`);

// Open a Timeline card and wait for it to finish sliding open
async function openCard(page, id) {
  await card(page, id).locator(".tl-summary").click();
  await expect(card(page, id).locator(".tl-summary")).toHaveAttribute("aria-expanded", "true");
  await page.waitForTimeout(500);
}


// =========================================================

test("loads without errors and shows the empty state", async ({ page }) => {
  await openWith(page, {});
  await expect(page.locator("#stat-total")).toHaveText("0");
  await expect(page.locator("#empty-list")).toBeVisible();
  await openTab(page, "Timeline");
  await expect(page.locator("#timeline-empty")).toBeVisible();
  expect(page.errors).toEqual([]);
});

test("adds a university using Wikidata's details", async ({ page }) => {
  await fakeWikidata(page);
  await openWith(page, {});
  await addUniversity(page, "ESCP", "Bachelor in Management");

  await expect(page.locator("#uni-list .uni-card")).toHaveCount(1);
  await expect(page.locator("#uni-list")).toContainText("ESCP");
  await expect(page.locator("#stat-total")).toHaveText("1");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("future-planner-universities")));
  expect(saved[0]).toMatchObject({ name: "ESCP", city: "Paris", country: "France", lat: 48.85, website: "https://escp.eu/" });
  expect(saved[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);   // a UUID
  expect(page.errors).toEqual([]);
});

test("auto-fill with Claude saves every application date", async ({ page }) => {
  await fakeWikidata(page);
  await fakeClaude(page);
  await openWith(page, { apiKey: "sk-ant-test" });
  await addUniversity(page, "ESCP", "Bachelor in Management");

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("future-planner-universities")));
  expect(saved[0].deadline).toBe("2026-11-18");
  expect(saved[0].applicationDates.map((d) => d.label)).toEqual(["Round 1", "Round 1", "Round 1 results"]);

  // The Timeline shows them once you click Generate Timeline
  await openTab(page, "Timeline");
  const id = saved[0].id;
  await openCard(page, id);
  await card(page, id).getByRole("button", { name: "Generate Timeline" }).click();
  await expect(card(page, id).locator(".tl-date-text")).toContainText(["Turin · Round 1", "Paris · Round 1"]);
  expect(page.errors).toEqual([]);
});

test("clicking a globe pin opens that university's card", async ({ page }) => {
  await openWith(page, { universities: [ESCP] });
  const pin = page.locator(".globe-pin", { hasText: "ESCP Business School" });
  await expect(pin).toHaveCount(1);
  await pin.click({ force: true });          // the globe redraws its pins every frame
  await expect(page.locator("#details-panel")).toHaveClass(/is-open/);
  await expect(page.locator("#panel-body")).toContainText("ESCP Business School");
  expect(page.errors).toEqual([]);
});

test("Timeline cards start closed and open on click", async ({ page }) => {
  await openWith(page, { universities: [ESCP, ESADE], timeline: { 1: { generated: true }, 2: { generated: true } } });
  await openTab(page, "Timeline");
  const summary = card(page, 1).locator(".tl-summary");
  await expect(summary).toHaveAttribute("aria-expanded", "false");
  await expect(summary).toContainText("27 Oct 2026");        // the next deadline
  await summary.click();
  await expect(summary).toHaveAttribute("aria-expanded", "true");
  await expect(card(page, 1).getByLabel("Application status for ESCP Business School")).toBeVisible();
  expect(page.errors).toEqual([]);
});

test("Generate and Clear Timeline add and remove the found dates", async ({ page }) => {
  await openWith(page, { universities: [ESCP] });              // not generated yet
  await openTab(page, "Timeline");
  await openCard(page, 1);
  await expect(card(page, 1)).toContainText("Timeline not generated yet");
  // The deadline typed in the university's form counts even before generating
  await expect(card(page, 1).locator(".tl-summary")).toContainText("27 Oct 2026");

  await card(page, 1).getByRole("button", { name: "Generate Timeline" }).click();
  await expect(card(page, 1).locator(".tl-date-text")).toHaveCount(3);
  await card(page, 1).getByRole("button", { name: "Clear Timeline" }).click();
  await expect(card(page, 1)).toContainText("Timeline not generated yet");
  await expect(card(page, 1).locator(".tl-date-text")).toHaveCount(1);   // just the form's deadline
  expect(page.errors).toEqual([]);
});

test("the slider sets your planned date on every page", async ({ page }) => {
  await openWith(page, { universities: [ESCP], timeline: { 1: { generated: true } } });
  await openTab(page, "Timeline");
  await openCard(page, 1);

  const bar = card(page, 1).locator(".tl-bar-inner");
  await bar.scrollIntoViewIfNeeded();
  const box = await bar.boundingBox();
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  const planned = await card(page, 1).locator('input[type="date"][id$="-planned"]').inputValue();
  expect(planned).toMatch(/^2026-1[01]-\d\d$/);
  await expect(card(page, 1).locator(".tl-summary")).not.toContainText("Not set");

  // The Universities page shows your plan too
  await openTab(page, "Universities");
  await expect(page.locator("#uni-list")).toContainText("Planned ·");
  expect(page.errors).toEqual([]);
});

test("status and milestones are saved", async ({ page }) => {
  await openWith(page, { universities: [ESCP], timeline: { 1: { generated: true } } });
  await openTab(page, "Timeline");
  await openCard(page, 1);
  await card(page, 1).getByLabel("Application status for ESCP Business School").selectOption("applying");
  await card(page, 1).getByRole("checkbox", { name: "Final review" }).check();

  await page.reload();
  await openTab(page, "Timeline");
  await expect(card(page, 1).locator(".tl-status-label")).toHaveText("Applying");
  await openCard(page, 1);
  await expect(card(page, 1).getByRole("checkbox", { name: "Final review" })).toBeChecked();
  expect(page.errors).toEqual([]);
});

test("profile text and academic profile are saved", async ({ page }) => {
  await openWith(page, {});
  await openTab(page, "Profile");
  await page.fill("#profile-personal", "I love economics.");
  await page.fill("#profile-start", "2027-09");
  await page.locator("#profile-start").dispatchEvent("change");

  await page.reload();
  await openTab(page, "Profile");
  await expect(page.locator("#profile-personal")).toHaveValue("I love economics.");
  await expect(page.locator("#profile-start")).toHaveValue("2027-09");
  expect(page.errors).toEqual([]);
});

test("calendar export downloads an .ics file with your dates", async ({ page }) => {
  await openWith(page, { universities: [ESCP], timeline: { 1: { generated: true, plannedDate: "2026-11-10" } } });
  await openTab(page, "Timeline");
  const download = page.waitForEvent("download");
  await page.click("#export-all-ics");
  const file = await (await download).path();
  const text = await (await import("node:fs/promises")).readFile(file, "utf8");
  expect(text).toContain("BEGIN:VCALENDAR");
  expect(text).toContain("SUMMARY:Submit: ESCP Business School");
  expect(text).toContain("DTSTART;VALUE=DATE:20261118");
  expect(page.errors).toEqual([]);
});

test("deleting a university removes it everywhere", async ({ page }) => {
  await openWith(page, { universities: [ESCP, ESADE], timeline: { 1: { generated: true } } });
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Esade" }).click();
  await expect(page.locator("#uni-list .uni-card")).toHaveCount(1);
  await expect(page.locator("#stat-total")).toHaveText("1");
  await openTab(page, "Timeline");
  await expect(page.locator(".tl-card")).toHaveCount(1);
  expect(page.errors).toEqual([]);
});

test("export and import move all your data (but never the API key)", async ({ page }) => {
  await openWith(page, {
    universities: [ESCP],
    timeline: { 1: { generated: true, status: "applying" } },
    apiKey: "sk-ant-secret",
  });
  await openTab(page, "Profile");
  await page.fill("#profile-personal", "I love economics.");

  // Export
  const download = page.waitForEvent("download");
  await page.click("#export-data");
  const file = await (await download).path();
  const text = await (await import("node:fs/promises")).readFile(file, "utf8");
  const data = JSON.parse(text);
  expect(data).toMatchObject({ app: "my-future-planner", version: 1, profile: { personal: "I love economics." } });
  expect(data.universities[0].name).toBe("ESCP Business School");
  expect(data.timeline["1"].status).toBe("applying");
  expect(text).not.toContain("sk-ant-secret");

  // Import it into an empty browser
  await openWith(page, {});
  await openTab(page, "Profile");
  await page.locator("#import-file").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(text) });
  await expect(page.locator("#profile-personal")).toHaveValue("I love economics.");
  await expect(page.locator("#stat-total")).toHaveText("1");
  await openTab(page, "Timeline");
  await expect(card(page, 1).locator(".tl-status-label")).toHaveText("Applying");

  // A file that isn't ours changes nothing
  await openTab(page, "Profile");
  await page.locator("#import-file").setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from('{"hello": 1}') });
  await expect(page.locator(".toast.is-warning")).toContainText("isn't a My Future Planner export");
  await expect(page.locator("#stat-total")).toHaveText("1");
  expect(page.errors).toEqual([]);
});
