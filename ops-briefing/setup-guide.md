# Setup Guide — Alex Morgan Daily Briefing

## Step 1: Anthropic API Key (5 minutes)
1. Go to https://console.anthropic.com
2. Create an account or sign in
3. Go to API Keys → Create Key
4. Copy the key (starts with `sk-ant-`)
5. Add to `.env`: `ANTHROPIC_API_KEY=sk-ant-xxxxx`

## Step 2: Google Cloud Project (15 minutes)
1. Go to https://console.cloud.google.com
2. Create a new project: "Alex-Daily-Briefing"
3. Enable these APIs:
   - Gmail API
   - Google Calendar API
   - Google Drive API
   - Google Sheets API
4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type: Desktop app
   - Download the credentials JSON
5. Run the OAuth flow to get refresh tokens for each Gmail account:
   - `node setup/google-auth.js` (we'll create this)
   - Sign in with each of Alex's 3 accounts
6. Add credentials to `.env`

## Step 3: Slack App (10 minutes)
1. Go to https://api.slack.com/apps → Create New App
2. Choose "From scratch", name it "Morning Briefing", select Acme Hire workspace
3. Go to OAuth & Permissions, add scopes:
   - channels:read, channels:history
   - im:read, im:history
   - users:read
   - chat:write (for posting the briefing)
4. Install to workspace → Copy Bot Token
5. Add to `.env`: `SLACK_BOT_TOKEN=xoxb-xxxxx`
6. Create `#morning-briefing` channel, invite the bot

## Step 4: Google Sheet Data Hub (5 minutes)
1. Create a new Google Sheet: "Alex Briefing Data Hub"
2. Create tabs: Gmail, Calendar, Slack, Drive, Xero, iCloud, WhatsApp, LinkedIn
3. Share with the Google service account email
4. Copy the Sheet ID from the URL
5. Add to `.env`: `GOOGLE_SHEET_ID=xxxxx`

## Step 5: Test Run
```bash
cd briefing-system
npm install
cp .env.example .env
# Fill in credentials
node test-briefing.js
```

## Step 6: Xero (when ready — coordinate with Sam)
1. Go to https://developer.xero.com → Create App
2. App type: Web, Redirect URI: http://localhost:3000/callback
3. Add Acme Hire Ltd organisation
4. Add credentials to `.env`

## Step 7: iCloud Mail (when ready)
1. Go to https://appleid.apple.com → Sign In & Security → App-Specific Passwords
2. Generate a password for "Daily Briefing"
3. Add to `.env`: `ICLOUD_APP_PASSWORD=xxxxx`

## Step 8: WhatsApp Playwright (when ready)
1. Set up Browserbase account at https://browserbase.com
2. Or use a dedicated VM with Chrome installed
3. Run `node collectors/whatsapp.js --setup` to initialise session
4. Scan QR code when prompted
5. Session persists for several weeks

## Step 9: LinkedIn Playwright (when ready)
1. Same Browserbase/VM as WhatsApp
2. Run `node collectors/linkedin.js --setup`
3. Log in manually when prompted
4. Session persists 30-60 days

## Step 10: Production Schedule
Set up cron jobs on the server/VM:
```cron
30 6 * * 1-5  cd /path/to/briefing-system && node collectors/whatsapp.js
30 6 * * 1-5  cd /path/to/briefing-system && node collectors/linkedin.js
45 6 * * 1-5  cd /path/to/briefing-system && node generate-briefing.js
```

Or use PM2 + node-cron for process management:
```bash
npm install -g pm2
pm2 start generate-briefing.js --cron "45 6 * * 1-5"
pm2 save
pm2 startup
```
