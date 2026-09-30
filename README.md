# Certiflow - Bulk Certificate Generator

Front end: **HTML + CSS + JavaScript** (no frameworks, no libraries).
Back end: **Node.js**, no npm packages. Two ways to run the same app:

| Where | Back end used | Data storage |
|---|---|---|
| Your computer (`npm start`) | `server.js` (built-in `http` module) | `data/db.json` file |
| Vercel | serverless functions in `/api` | Upstash Redis (free) via `lib/db.js` |

The front end in `public/` is identical in both cases.

## Project layout
```
public/                 the website: index.html, verify.html, css/style.css, js/*.js
api/                    Vercel serverless functions: leads, session, batches, stats, verify/[id]
lib/                    shared helpers for the functions + tiny key-value store (db.js)
server.js               local server (same API routes as /api) - not used by Vercel
vercel.json             serves /public and rewrites /verify/<ID> to verify.html
sample_students_list.xlsx   test file for the upload step
```

## Run locally
1. Install Node 18+.
2. In this folder run `npm start`, then open **http://localhost:3000** (do not double-click index.html).
3. Choose `sample_students_list.xlsx`, or click "Try with sample data".

## Deploy to Vercel
1. Push this folder's contents to a GitHub repo (`api/`, `public/`, `vercel.json` must be at the repo root).
2. vercel.com > **Add New > Project** > import the repo > Framework Preset **Other** > leave build settings empty > **Deploy**.
3. Project > **Storage** > **Create Database** > **Upstash Redis** (free) > connect to the project
   (adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`). **Redeploy** once.
4. Open the live URL and test: sample data > Unlock > Download all > scan a QR code.
   `GET /api/stats` shows `"persistent": true` when the database is connected.

Without step 3 the app still runs, but issued IDs are kept in memory only and may disappear.

## Workflow
1. **Recipients** - upload .xlsx / .csv, map Name / Course / Date / Extra columns (different course per row is supported).
2. **Certificate text** - institute, title, intro and action lines, signatory.
3. **Design** - Classic / Modern / Minimal, accent colour, logo, signature (these stay in the browser).
4. **Live preview** - A4 landscape, page through every recipient, QR + unique ID.
5. **Free** - 5 watermarked sample certificates as one PDF.
6. **Unlock (free)** - form saves the lead, returns a token: up to 500 certificates, no watermark,
   ZIP of PDFs + `register.csv`, or one combined PDF.
7. **Verify** - each QR opens `/verify/<ID>`, which checks the register.

## API
| Route | Purpose |
|---|---|
| `POST /api/leads` | Unlock form: saves the lead, returns an access token |
| `GET /api/session?token=` | Is the saved token still valid? |
| `POST /api/batches` | (token required) issues unique IDs for up to 500 certificates |
| `GET /api/verify/:id` | Look up an ID (used by the QR page) |
| `GET /api/stats` | Counters for a demo |

## Points to explain in the interview
- Spreadsheets, logos and signatures are processed in the browser. Only names/courses of unlocked batches go to the server, to build the verification register.
- The server, not the browser, generates certificate IDs, so they cannot be forged client-side.
- The 500 limit and the token check are enforced on the server too.
- CSV parser, XLSX reader, QR generator, PDF writer and ZIP writer are all hand-written (no libraries).
- Legacy `.xls` is not supported: save as `.xlsx` or `.csv`.
