# Acme Hire Asset Portal

Internal ops portal for the Acme Hire container fleet. Tracks unit status, live GPS, rental data and equipment registers.

---

## Stack

- **Frontend** — Single-page HTML/CSS/JS, no framework
- **Backend** — Netlify Functions (Node.js serverless)
- **Data** — Google Sheets CSV (asset register), Booqable (rental status), Hapn (GPS tracking)
- **AI** — Claude Haiku for fleet intelligence summary
- **Hosting** — Netlify (auto-deploy from this repo)

---

## Repo Structure

```
acmehire-portal/
├── index.html                        # Main portal
├── netlify.toml                      # Netlify config + redirects
├── README.md
└── netlify/
    └── functions/
        ├── login.js                  # Auth — JWT token issuance
        ├── hapn.js                   # Hapn GPS API proxy
        ├── booqable.js               # Booqable rental API proxy
        ├── intelligence.js           # Claude Haiku fleet summary
        └── asset-register.js         # Reads persistent per-unit condition/defects from Supabase
```

---

## Local Development

No build step required. Open `index.html` directly in a browser for frontend work.

For function testing, use [Netlify CLI](https://docs.netlify.com/cli/get-started/):

```bash
npm install -g netlify-cli
netlify dev
```

This runs the functions locally and serves the portal at `localhost:8888`.

---

## Environment Variables

Set these in **Netlify → Site configuration → Environment variables**:

| Variable | Description |
|---|---|
| `PORTAL_PASSWORD` | Ops login password |
| `JWT_SECRET` | 64-char random hex string for signing tokens |
| `HAPN_CLIENT_ID` | Hapn API key |
| `HAPN_CLIENT_SECRET` | Hapn API secret |
| `BOOQABLE_API_KEY` | Booqable API key |
| `BOOQABLE_SUBDOMAIN` | Booqable subdomain e.g. `acme-hire` |
| `ANTHROPIC_API_KEY` | Anthropic API key for fleet intelligence |
| `SUPABASE_URL` | Supabase project URL (same project the handover-app Inspections app writes to) — asset condition, defects, and inspection timeline are read from here |
| `SUPABASE_SERVICE_KEY` | Supabase service-role key — server-side only, never exposed to the browser |

Generate a JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## GitHub → Netlify Auto-Deploy Setup

1. Push this repo to GitHub
2. In Netlify: **Add new site → Import an existing project → GitHub**
3. Select this repo
4. Build settings:
   - Build command: *(leave blank)*
   - Publish directory: `.`
5. Click **Deploy**
6. Add all environment variables above
7. Every push to `main` auto-deploys

---

## Google Sheet Structure

The portal reads from two tabs in the master Google Sheet (must be published as CSV):

### Master Database (Tab 1)
| Column | Notes |
|---|---|
| Asset ID | e.g. AHUKK250001 |
| Category | Kitchen / Dark Kitchen / Bar etc. |
| Status | Overridden by Booqable when live |
| Location | Site address |
| Client | Overridden by Booqable when live |
| Hapn ID | Paste Hapn live link here |
| Ring Indoor ID | Ring device ID |
| Manufacturer Serial | Unit chassis serial |
| Notes | Free text |

### Equipment (Tab 2)
| Column | Notes |
|---|---|
| asset_id | Parent unit ID |
| category | Kitchen Tech / Connectivity / Security etc. |
| make | Brand name |
| model | Full model number |
| serial | Manufacturer serial — exact as printed |
| notes | Condition, location in unit |
| install_date | YYYY-MM-DD |
| warranty_expiry | YYYY-MM-DD |

---

## Booqable Setup

Units must be set up as **Products** in Booqable with the Acme Hire Asset ID as the **SKU**. The portal matches orders to units via SKU.

Example: Product SKU = `AHUKK250001` → portal shows active order on that unit.

---

## Asset ID Format

```
AH [Country] [Category] [YY] [Sequence]
```

- `AH` — Acme Hire (fixed)
- `UK` — Country
- `K/D/B/C/S/W/P/H` — Kitchen/Dark/Bar/Chiller/Storage/Washup/Prep/Hybrid
- `25/26` — Build year
- `0001` — 4-digit sequence

Equipment child IDs: `AHUKK250001-N001` (parent + category code + sequence)
