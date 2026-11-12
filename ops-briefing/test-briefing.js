/**
 * Test Briefing Generator
 * Tests the Claude API briefing generation with sample data.
 * Run: node test-briefing.js
 *
 * Requires: ANTHROPIC_API_KEY in .env
 */

require('dotenv').config();
const fs = require('fs');
const { buildPrompt, toHtmlEmail } = require('./briefing-prompt');

const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// Sample data — replace with real data from your sources
const sampleData = {
  business: {
    gmail: [
      { account: "alex@acmehire.example", sender: "James Fletcher", senderEmail: "james@supplierco.com", subject: "Updated delivery schedule for June", time: "06:30", urgency: 2, summary: "Supplier requesting confirmation on revised delivery dates for the June order. Needs response by end of week.", unreplied: true, unrepliedHours: 14 },
      { account: "alex@acmehire.example", sender: "HSBC Business", senderEmail: "alerts@hsbc.co.uk", subject: "Important: Account review required", time: "23:15 (yesterday)", urgency: 3, summary: "HSBC flagging annual business account review. Documents required by 15 June.", unreplied: true, unrepliedHours: 8 },
      { account: "alex@acmecapital.example", sender: "Sarah Chen", senderEmail: "sarah@legalpartners.com", subject: "RE: Fund structure documentation", time: "17:45 (yesterday)", urgency: 3, summary: "Legal team completed fund structure review. Three items flagged for Alex's sign-off before filing.", unreplied: true, unrepliedHours: 13 },
      { account: "alex@acmecapital.example", sender: "Newsletter", senderEmail: "digest@fintech.weekly", subject: "FinTech Weekly Roundup", time: "05:00", urgency: 1, summary: "Weekly newsletter. No action required.", unreplied: false },
      { account: "alex@acmebrands.example", sender: "Maria Lopez", senderEmail: "maria@brandpartner.eu", subject: "Campaign assets ready for review", time: "16:00 (yesterday)", urgency: 2, summary: "Brand campaign creative assets uploaded to Drive. Needs Alex's approval before Friday launch.", unreplied: true, unrepliedHours: 15 },
    ],
    calendar: [
      { time: "09:00", title: "Acme Hire Team Standup", duration: "15 min", location: "Google Meet", source: "business" },
      { time: "10:30", title: "Investor Call — Acme Capital Q2 Update", duration: "45 min", location: "Zoom", source: "business" },
      { time: "12:00", title: "Lunch with Sam (Xero walkthrough)", duration: "60 min", location: "The Ivy, City", source: "business" },
      { time: "14:30", title: "AcmeBrands Campaign Review", duration: "30 min", location: "Google Meet", source: "business" },
      { time: "16:00", title: "Jordan — IT Systems Checkpoint", duration: "30 min", location: "Slack Huddle", source: "business" },
    ],
    slack: [
      { channel: "#general", sender: "Priya", message: "Alex, the signed contracts from DocuSign came through. Filed in Drive.", timestamp: "08:45 (yesterday)", mentionsAlex: true },
      { channel: "#kitchen-ops", sender: "Tom B", message: "Delivery tracking update: June shipment delayed by 2 days. Need to adjust timeline.", timestamp: "07:30", mentionsAlex: false },
      { channel: "DM from Sam", sender: "Sam Patel", message: "Can we go through Xero permissions at lunch today? I've prepped the access list.", timestamp: "Yesterday 18:00", mentionsAlex: false, isDM: true },
      { channel: "#acmebrands", sender: "Maria", message: "Creative deck is ready — waiting for Alex's final sign-off before we send to print", timestamp: "Yesterday 16:30", mentionsAlex: true, keywords: ["sign-off"] },
    ],
    drive: [
      { filename: "Acme Capital Q2 Investor Deck v3.pptx", sharedBy: "Sarah Chen", modified: "Yesterday 17:00", hasComments: true, link: "https://drive.google.com/..." },
      { filename: "AcmeBrands June Campaign Creative.pdf", sharedBy: "Maria Lopez", modified: "Yesterday 15:45", hasComments: false, link: "https://drive.google.com/..." },
    ],
    xero: null
  },
  personal: {
    icloudMail: null,
    whatsapp: [
      { contact: "Priya (PA)", stream: "business", lastMessages: ["Can you confirm the restaurant for lunch with Sam?", "Booked The Ivy for 12pm"], lastSender: "Priya", timestamp: "Yesterday 19:00", alexsLastNoReply: false, keywords: [] },
      { contact: "Acme Hire Group", stream: "business", lastMessages: ["Updated the June menu pricing", "Alex needs to approve before we publish"], lastSender: "Tom B", timestamp: "07:15", alexsLastNoReply: false, keywords: ["approve"] },
      { contact: "Sophie (wife)", stream: "personal", lastMessages: ["Don't forget Ella's recital is at 6pm Thursday"], lastSender: "Sophie", timestamp: "Yesterday 21:30", alexsLastNoReply: true, keywords: ["Thursday"] },
    ],
    linkedin: [
      { sender: "Mark Davidson", preview: "Hi Alex, following up on our conversation at the conference. Would love to schedule a call.", timestamp: "Yesterday", unread: true },
      { sender: "LinkedIn", preview: "3 new connection requests", timestamp: "Today", unread: true },
    ],
    ical: null
  }
};

async function testBriefing() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.log('\n⚠ No ANTHROPIC_API_KEY found in .env');
    console.log('Generating briefing prompt (without API call)...\n');

    const prompt = buildPrompt(sampleData, today);
    fs.writeFileSync('test-prompt.txt', prompt);
    console.log('✓ Prompt saved to test-prompt.txt');
    console.log(`  Prompt length: ${prompt.length} chars`);
    console.log('\nTo test with the API:');
    console.log('1. Get an API key from console.anthropic.com');
    console.log('2. Add ANTHROPIC_API_KEY=sk-ant-xxxxx to .env');
    console.log('3. Run: node test-briefing.js\n');
    return;
  }

  console.log('🔄 Generating briefing via Claude API...\n');

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const prompt = buildPrompt(sampleData, today);

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      temperature: 0,
      messages: [{ role: "user", content: prompt }]
    });

    const briefingText = response.content[0].text;

    // Save as text
    fs.writeFileSync('test-output.txt', briefingText);
    console.log('✓ Briefing text saved to test-output.txt');

    // Save as HTML email
    const html = toHtmlEmail(briefingText, today);
    fs.writeFileSync('test-output.html', html);
    console.log('✓ HTML email saved to test-output.html');

    // Print to console
    console.log('\n' + '='.repeat(60));
    console.log(briefingText);
    console.log('='.repeat(60));

    console.log(`\nTokens used: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`);

  } catch (err) {
    console.error('❌ API error:', err.message);
  }
}

testBriefing();
