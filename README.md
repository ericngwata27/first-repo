# planmyfuture

A personal university-admissions planner:

- **Universities**: add a university and course, and auto-fill looks up the city, the official website, entry requirements and **every application date** (rounds per campus, opening dates, deadlines, decisions). They appear as glowing pins on a dark 3D globe.
- **Timeline**: one card per university. Pick the deadline you're aiming for, drag a slider to set your planned submission date, tick off milestones (they count back from your date), and export everything to your calendar.
- **Profile**: your academic profile (intended start date, school system, country) plus text you reuse in applications (personal statement, achievements, notes).

Everything is saved **in your browser only** (`localStorage`) for now. Use **Export my data** on the Profile tab to keep a backup, and **Import data** to bring it back or move it to another browser. A backend is planned; see [DATA_MODEL.md](DATA_MODEL.md).

## Live site

**https://ericngwata27.github.io/planmyfuture/**

It's hosted free on GitHub Pages and updates by itself about a minute after every merge into `main`. Each visitor's data is still saved only in their own browser.

## Run it

It's a static site: plain HTML, CSS and JavaScript with no build step.

```bash
npm install     # only needed for the tests and the local server
npm start       # http://localhost:4173
```

Opening `index.html` directly also works, but some features (like the sharper 8K globe pictures) need a real web address.

### Auto-fill with Claude (optional)

Without a key, auto-fill uses Wikidata and Wikipedia (city, country, website, map position). With a Claude API key (**Auto-fill settings** under the form), it also reads the university's official website for dates and requirements. The key is stored only in your browser and sent only to Anthropic. A backend will take this over later.

## Tests

```bash
npm install
npx playwright install chromium   # first time only
npm test
```

The tests (`tests/app.spec.mjs`) open the site in headless Chrome and check the main flows. These are: adding a university, auto-fill, globe pins, Timeline cards, Generate/Clear Timeline, the slider, status and milestones, the Profile, calendar export, deleting, and exporting and importing your data. Outside services are faked, so the tests don't need the internet or an API key. They also run on every pull request (`.github/workflows/tests.yml`).

## Files

| File | What it does |
|---|---|
| `index.html` | The page: header, the three tabs, the form, the globe container |
| `style.css` | All the styling (dark theme), in numbered sections |
| `store.js` | Your saved data: one in-memory `state`, `loadState()` and `save()`. The only file that touches storage |
| `helpers.js` | Small tools used everywhere: making elements, tabs, pop-up messages |
| `dates.js` | Deadlines and "your date" (`getMyDate`), and the Timeline's saved data |
| `globe.js` | The 3D globe and its ⚙️ settings |
| `autofill.js` | Auto-fill (Wikidata, Wikipedia, Claude). `runAutoFill()` is the one entry point, and the only code that uses the API key |
| `universities.js` | The Universities page: form, list, details panel, stats |
| `profile.js` | The Profile tab, plus Export / Import |
| `auth.js` | Signing in with an email link (Supabase) |
| `supabase/schema.sql` | The database setup: paste it into Supabase's SQL Editor |
| `main.js` | Starts the app: loads data, updates old data, draws everything |
| `timeline.js` | The Timeline page (cards, dates, slider, milestones, calendar export) |
| `textures/` | Optional 8K globe pictures (see its README) |
| `tests/` | Automated tests and a tiny local web server |

## Credits

Earth imagery: NASA. 3D globe: [Globe.gl](https://globe.gl). Icons: [Lucide](https://lucide.dev).
