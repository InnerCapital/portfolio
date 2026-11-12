# Alex Morgan Daily Briefing System

## Architecture
All sources → Google Sheet (data hub) → JSON → Claude API → Slack + Email

## Setup
1. `npm install` to install dependencies
2. Copy `.env.example` to `.env` and fill in credentials
3. Set up Google Cloud project (see setup-guide.md)
4. Run `node test-briefing.js` to test with sample data
5. Run `node generate-briefing.js` for full pipeline

## Files
- `config.json` — All configurable settings (accounts, schedule, channels)
- `generate-briefing.js` — Main pipeline: collect → sheet → Claude API → deliver
- `test-briefing.js` — Test briefing generation with sample/real data
- `collectors/gmail.js` — Gmail API data collection
- `collectors/slack.js` — Slack API data collection  
- `collectors/whatsapp.js` — WhatsApp Playwright scraper
- `collectors/linkedin.js` — LinkedIn Playwright scraper
- `collectors/calendar.js` — Google Calendar API
- `collectors/drive.js` — Google Drive API
- `collectors/xero.js` — Xero API integration
- `collectors/icloud-mail.js` — iCloud IMAP integration
- `briefing-prompt.js` — Claude API prompt template
- `delivery/slack.js` — Slack Block Kit delivery
- `delivery/email.js` — HTML email delivery
