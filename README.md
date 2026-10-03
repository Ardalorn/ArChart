# ArChart

Plan and log your medicine doses against the limits you set. Your data stays on your own device.

Live: https://ardalorn.github.io/ArChart/

> This chart plans and checks doses only against the limits you enter. It cannot check them against your prescription, and it does not check interactions between medicines. Follow the prescriber or pharmacist instructions, and ask them if unsure.

## Features

- Add, edit and remove medicines: name, strength and unit, units per dose, max doses per 24 hours, max total per 24 hours.
- Regular schedules (every X hours, or a number of doses over 24 hours) and as-needed medicines.
- A plan with a start date and time, and a length in days, months, years or forever.
- Day view: mark doses taken (with the time), skip, undo, and log a dose outside the schedule. Doses that break a limit or minimum gap ask for confirmation.
- PDF chart of the plan (first 90 days).
- Calendar file (.ics): one event per upcoming dose with an alarm at the dose time, up to 90 days and 900 KB.
- Backup: download, share (where the browser supports sharing files) and restore a JSON backup.
- Installable and works offline.
- Targets WCAG 2.2 AA.

## Privacy

- Data is kept in your browser's local storage on one device.
- No accounts, analytics or server calls. Everything loads from this repository.
- Clearing browser data deletes it. Use Backup to keep a copy.

## Run locally

No build step and no dependencies. Serve the folder with any static file server and open it:

```
python3 -m http.server
```

Then visit http://localhost:8000/. A service worker needs `localhost` or HTTPS.

## Tests

```
node tests/ics.test.js
node tests/planner.test.js
```

## Deploy

GitHub Pages: Settings, Pages, deploy from branch `main`, folder `/ (root)`.

## Licence

ArChart's own code is licensed under the GNU General Public License v3.0. See [LICENSE](LICENSE).

Bundled third-party files keep their own licences:

- `vendor/`: jsPDF and jsPDF-AutoTable, both MIT. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
- `fonts/`: Atkinson Hyperlegible Next, SIL Open Font License 1.1. See [fonts/OFL-AtkinsonHyperlegibleNext.txt](fonts/OFL-AtkinsonHyperlegibleNext.txt). The `.ttf` files are the `.woff2` files converted to TrueType so jsPDF can embed them in the PDF. The glyphs and names are unchanged.