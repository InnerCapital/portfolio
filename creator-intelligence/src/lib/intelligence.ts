import Anthropic from "@anthropic-ai/sdk";
import { CULT_AND_DIRECT_RESPONSE, FORMAT_GUIDES, QUESTIONNAIRE } from "./brand";
import type { PillarMap } from "./profile";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
/** A cheaper model for mechanical passes (per-comment sentiment). Defaults to
 * the main model so an unset/invalid id can never break the build; set
 * ANTHROPIC_MODEL_CHEAP to a Haiku id on the server to cut credits. */
const CHEAP_MODEL = process.env.ANTHROPIC_MODEL_CHEAP || MODEL;

function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function stripEmDashes(s: string): string {
  return s.replace(/—/g, ", ").replace(/–/g, "-").replace(/ ,/g, ",");
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Model did not return JSON");
  return JSON.parse(stripEmDashes(cleaned.slice(start, end + 1)));
}

async function askJson(system: string, user: string, maxTokens = 4000, model = MODEL): Promise<unknown> {
  const res = await client().messages.create({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] });
  const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  return extractJson(text);
}

async function askText(system: string, user: string, maxTokens = 3000): Promise<string> {
  const res = await client().messages.create({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] });
  return stripEmDashes(res.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim());
}

/**
 * Same as askJson, but lets the model use Anthropic's hosted web search tool
 * to look things up before answering, and can optionally see one or more
 * images (a post thumbnail, a screenshot) directly, so it describes what is
 * actually on screen instead of only what search results say about it.
 */
async function askJsonWithSearch(
  system: string,
  user: string,
  images: { mimeType: string; data: Buffer }[] = [],
  maxTokens = 5000,
): Promise<unknown> {
  const content: Anthropic.Messages.ContentBlockParam[] = [
    ...images.map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        data: img.data.toString("base64"),
      },
    })),
    { type: "text" as const, text: user },
  ];
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
  });
  const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  return extractJson(text);
}

/* ------------------------------------------------------------------ */
/* Who we are writing for                                              */
/* ------------------------------------------------------------------ */

export interface Persona {
  name: string;
  context: string;
  pillars: PillarMap;
}

function systemFor(p: Persona, role: string) {
  const pillars = `PILLARS AS THIS PERSON DEFINES THEM\nA = ${p.pillars.A}\nB = ${p.pillars.B}\nC = ${p.pillars.C}`;
  return `PROFILE OF THE PERSON YOU ARE WRITING FOR (${p.name})\n${p.context}\n\n${pillars}\n\n${CULT_AND_DIRECT_RESPONSE}\n\n${role} Everything you produce is for ${p.name} specifically: their voice, their audience, their goals, their reading of social. Nothing generic.`;
}

/** Turn questionnaire answers into the compact brief the other calls carry. */
export async function buildProfileContext(name: string, answers: Record<string, string>): Promise<{ context: string; pillars: PillarMap }> {
  const qa = QUESTIONNAIRE.flatMap((s) => s.questions)
    .map((q) => `${q.label}\n${(answers[q.key] || "").trim() || "(not answered)"}`)
    .join("\n\n");
  const context = await askText(
    `You write compact strategy briefs that other AI calls will use as their whole understanding of a person. Preserve the person's own words and specifics; do not soften, generalise or add anything they did not say. No em dashes.`,
    `Turn these questionnaire answers from ${name} into a brief under 700 words with these headings in this order: WHO, THE THESIS, FOUNDER TRUTH AND PROOF, AUDIENCE (ideal self, enemy, transformation, one feeling), VOICE (do, never, tribe phrases, visual), WHAT HAS WORKED, WHAT UNDERPERFORMS, PILLARS (A, B, C), FUNNEL, PLATFORMS, THEIR THEORY OF SOCIAL. Keep every number, name and banned word. Output the brief only.\n\n${qa}`,
  );
  const short = (s: string) => (s || "").split(/[.\n]/)[0].trim().slice(0, 60) || "";
  const pillars: PillarMap = {
    A: short(answers.pillarA) || "Pillar A",
    B: short(answers.pillarB) || "Pillar B",
    C: short(answers.pillarC) || "Pillar C",
  };
  return { context, pillars };
}

/* ------------------------------------------------------------------ */
/* Ideas                                                               */
/* ------------------------------------------------------------------ */

export interface IdeaInput {
  title: string;
  url: string;
  platform: string;
  note: string;
  creator?: string;
  sourceComments: string;
  ownComments: string;
  ownPostRef: string;
  linkedPostComments: { post: string; comments: string }[];
}

export interface Analysis {
  sentiment: { inspiration: string; inspirationNote: string; ours: string; oursNote: string; summary: string };
  themes: { theme: string; evidence: string; where: "inspiration" | "ours" | "both" }[];
  audienceWants: string[];
  objections: string[];
  identity: { whoTheyWantToBe: string; enemy: string; transformation: string };
  creatorRead: { handle: string; niche: string; whatTheyDoWell: string; suggestedTopics: string[] } | null;
  angles: { title: string; hook: string; format: string; pillar: "A" | "B" | "C"; why: string }[];
  /** Present when this analysis came from researchIdeaFromLink rather than pasted comments. */
  factCheck?: { claim: string; verdict: "true" | "false" | "unverified" | "misleading"; note: string }[];
  source?: "comments" | "research";
  generatedAt?: string;
}

function ideaBlock(i: IdeaInput): string {
  const own = [
    i.ownComments.trim() ? `Pasted${i.ownPostRef ? ` (from: ${i.ownPostRef})` : ""}:\n${i.ownComments.trim()}` : "",
    ...i.linkedPostComments.map((p) => `From our own post "${p.post}":\n${p.comments}`),
  ].filter(Boolean).join("\n\n");
  return [
    `IDEA TITLE: ${i.title || "Untitled"}`,
    i.url ? `SOURCE: ${i.url} (${i.platform || "unknown platform"})` : "",
    i.creator ? `CREATOR: ${i.creator}` : "",
    `WHY IT CAUGHT US: ${i.note || "(no note given)"}`,
    "",
    `COMMENTS ON THE INSPIRATION:\n${i.sourceComments.trim() || "(none captured)"}`,
    "",
    `COMMENTS ON OUR OWN POSTS:\n${own || "(none captured)"}`,
  ].filter((l) => l !== "").join("\n");
}

export async function analyseIdea(p: Persona, i: IdeaInput): Promise<Analysis> {
  const system = systemFor(p, "You are their content strategist. You return only JSON.");
  const user = `TASK: An inspiration item has been saved to the ideas bank. Merge three things: (1) why it caught ${p.name}'s attention, (2) the sentiment in the comments left on the inspiration itself, (3) the sentiment in the comments ${p.name}'s own audience has left on their posts. Read both audiences through the cult-marketing lens (who they want to be, what they are running from, the transformation). If the inspiration's creator or niche can be identified from the caption, comments or note, say so. Then turn it all into content angles for ${p.name}.

${ideaBlock(i)}

Return ONLY a JSON object with this exact shape:
{
  "sentiment": {
    "inspiration": "positive" | "mixed" | "negative" | "unknown",
    "inspirationNote": "one sentence on the mood under the inspiration",
    "ours": "positive" | "mixed" | "negative" | "unknown",
    "oursNote": "one sentence on the mood in our comments",
    "summary": "two or three sentences merging what both audiences are saying and where they overlap or diverge"
  },
  "themes": [ { "theme": "short name", "evidence": "what people actually said, paraphrased or briefly quoted", "where": "inspiration" | "ours" | "both" } ],
  "audienceWants": [ "specific things people asked for or responded to" ],
  "objections": [ "pushback, doubt or friction people voiced" ],
  "identity": { "whoTheyWantToBe": "...", "enemy": "...", "transformation": "before -> after" },
  "creatorRead": null | { "handle": "the creator's handle if visible, else empty", "niche": "their niche in a few words", "whatTheyDoWell": "one sentence", "suggestedTopics": [ "2 to 4 short topic names this belongs under" ] },
  "angles": [ { "title": "working title", "hook": "the opening line as ${p.name} would say it", "format": "Reel, carousel, LinkedIn post, long form, story series", "pillar": "A" | "B" | "C", "why": "one sentence linking it to the audience signal" } ]
}
Give 3 to 5 themes, 2 to 4 wants, 0 to 3 objections, and exactly 4 angles across at least two pillars. If a comment set is missing, say so in the relevant note and mark that sentiment unknown; never invent comments. No em dashes.`;
  const out = (await askJson(system, user)) as Analysis;
  out.generatedAt = new Date().toISOString();
  return out;
}

/**
 * Runs the moment a link is saved, before any comments have been pasted.
 * Uses Anthropic's hosted web search tool to identify the creator, read what
 * the post/video actually says, fact-check checkable claims, and surface any
 * public reaction it can find, then turns that into the same shape analyseIdea
 * produces so the UI does not need to know which path generated it.
 */
export async function researchIdeaFromLink(
  p: Persona,
  i: IdeaInput,
  meta: { authorHandle?: string; caption?: string },
  images: { mimeType: string; data: Buffer }[] = [],
): Promise<Analysis> {
  const system = systemFor(p, "You are their content strategist and a careful researcher. You return only JSON.");
  const user = `TASK: A link has just been saved to the ideas bank. No comments have been pasted yet.${images.length ? " A thumbnail image of the post is attached: look at it directly first and describe exactly what it shows (setting, people, on-screen text, mood, what is actually happening), and treat that as ground truth over anything search results guess." : ""} Use web search to find out what you can about this specific post or video and its creator before ${p.name} adds anything by hand: who the creator is, what the post actually says or shows, any specific factual claims it makes (fact-check the ones that are checkable, e.g. numbers, dates, studies, "first ever" claims; do not fact-check opinions or taste), and any public reaction you can find (comments visible in search results, quote-posts, write-ups, reviews). Then read it through the cult-marketing lens and turn it into content angles for ${p.name}. Be honest when the search turns up little or nothing: say so plainly, mark sentiment unknown, and never invent comments, numbers or reactions that are not backed by what you found or saw in the attached image.

${ideaBlock(i)}
${meta.authorHandle ? `KNOWN CREATOR HANDLE: ${meta.authorHandle}` : ""}
${meta.caption ? `KNOWN CAPTION OR TITLE: ${meta.caption}` : ""}

Return ONLY a JSON object with this exact shape:
{
  "sentiment": {
    "inspiration": "positive" | "mixed" | "negative" | "unknown",
    "inspirationNote": "one sentence on the mood you found around this post, or why you could not tell",
    "ours": "unknown",
    "oursNote": "no comments pasted yet",
    "summary": "two or three sentences on what this post is, what it claims, and what reaction is visible"
  },
  "themes": [ { "theme": "short name", "evidence": "what you actually found, paraphrased or briefly quoted, with where it came from", "where": "inspiration" } ],
  "audienceWants": [ "specific things people responded to or asked for, only if found" ],
  "objections": [ "pushback or doubt you found, only if found" ],
  "identity": { "whoTheyWantToBe": "...", "enemy": "...", "transformation": "before -> after" },
  "creatorRead": null | { "handle": "the creator's handle, with @", "niche": "their niche in a few words", "whatTheyDoWell": "one sentence", "suggestedTopics": [ "2 to 4 short topic names" ] },
  "factCheck": [ { "claim": "a specific checkable claim made in the post", "verdict": "true" | "false" | "unverified" | "misleading", "note": "what you found, and where" } ],
  "angles": [ { "title": "working title", "hook": "the opening line as ${p.name} would say it", "format": "Reel, carousel, LinkedIn post, long form, story series", "pillar": "A" | "B" | "C", "why": "one sentence linking it to what you found" } ]
}
0 to 5 themes, 0 to 4 wants, 0 to 3 objections, 0 to 5 fact-check entries (skip claims that are not checkable), and exactly 4 angles across at least two pillars. If you cannot find the post or creator at all, say so in sentiment.summary, leave creatorRead null and themes empty, and still write 4 angles from the note and title alone. No em dashes.`;
  const out = (await askJsonWithSearch(system, user, images, 5500)) as Analysis;
  out.generatedAt = new Date().toISOString();
  out.source = "research";
  return out;
}

export interface Brief {
  format: string;
  bigIdea: string;
  identity: { whoItsFor: string; enemy: string; transformation: string };
  hooks: { spoken?: string; onScreen?: string; line: string; why: string }[];
  structure: { beat: string; detail: string; timing?: string }[];
  proof: string[];
  objectionHandled: string;
  tribePhrase: string;
  cta: { ask: string; whyItsTheSmallestStep: string };
  captionOrCopyNotes: string;
  productionNotes: string;
  pillar: "A" | "B" | "C";
  whyItWorks: string;
  risks: string[];
  generatedAt?: string;
}

export async function refineIdea(p: Persona, i: IdeaInput, analysis: Analysis | null, format: keyof typeof FORMAT_GUIDES, angleTitle?: string): Promise<Brief> {
  const system = systemFor(p, "You are their content strategist. You write structured briefs, not final copy: hooks, beats, structure and notes they write from. You return only JSON.");
  const user = `TASK: Refine this concept into a brief for one format.

FORMAT GUIDE
${FORMAT_GUIDES[format]}

${ideaBlock(i)}

${analysis ? `AUDIENCE ANALYSIS ALREADY DONE:\n${JSON.stringify(analysis, null, 2)}` : "No audience analysis yet; work from the note and comments."}
${angleTitle ? `\nBUILD ON THIS ANGLE SPECIFICALLY: ${angleTitle}` : ""}

Return ONLY a JSON object with this exact shape:
{
  "format": "${format}",
  "bigIdea": "the one idea this piece carries, one sentence",
  "identity": { "whoItsFor": "...", "enemy": "...", "transformation": "..." },
  "hooks": [ { "spoken": "what is said (video formats only, else omit)", "onScreen": "on-screen text or opener line", "line": "the hook in one line", "why": "the mechanism behind it" } ],
  "structure": [ { "beat": "name of the beat, slide or segment", "detail": "what happens, what is shown, what point lands", "timing": "seconds, slide number or line position" } ],
  "proof": [ "specific receipts, footage, numbers, names or moments to include" ],
  "objectionHandled": "the top objection and how the piece answers it",
  "tribePhrase": "the phrase to seed",
  "cta": { "ask": "the single call to action", "whyItsTheSmallestStep": "..." },
  "captionOrCopyNotes": "caption structure for video and carousel; line-by-line notes for LinkedIn",
  "productionNotes": "format, visual style, length, design notes, anything an editor needs",
  "pillar": "A" | "B" | "C",
  "whyItWorks": "one or two sentences tying it to ${p.name}'s thesis and the audience signal",
  "risks": [ "where it could tip into something the profile bans, and how to avoid it" ]
}
Three hooks. Structure with 5 to 10 entries as the format guide requires. Specific, not generic. No em dashes.`;
  const out = (await askJson(system, user, 5000)) as Brief;
  out.generatedAt = new Date().toISOString();
  return out;
}

/* ------------------------------------------------------------------ */
/* Saved video: what's going on + how to recreate it                   */
/* ------------------------------------------------------------------ */

export interface SavedVideoRead { summary: string; craft: string; caveats: string[] }
export interface SavedVideoCtx {
  caption: string; transcript: string; onScreenText: string[];
  hookText: string; hookType: string; cutsPerMinute: number; cutCount: number; durationSeconds: number;
  stats: { likes: number; comments: number; views: number; postedAt: string | null } | null;
  transcriptAvailable: boolean;
}

/** Plain-English read of a saved video: what is going on in it, and how it is
 * shot. Grounded only in the real teardown + caption; never invents spoken
 * lines or numbers, and says when the read is thin. */
export async function readSavedVideo(p: Persona, c: SavedVideoCtx): Promise<SavedVideoRead> {
  const system = systemFor(p, "You explain other people's videos to this creator in plain, everyday words, so they understand what is going on and how it was made. You return only JSON.");
  const stats = c.stats ? `REAL NUMBERS FROM THE POST: ${c.stats.likes} likes, ${c.stats.comments} comments${c.stats.views ? `, ${c.stats.views} views` : ""}${c.stats.postedAt ? `, posted ${c.stats.postedAt.slice(0, 10)}` : ""}.` : "No reliable numbers scraped for this post.";
  const user = `TASK: Explain this saved video to ${p.name} in plain English. Two short things: what is going on in it, and how it is shot. Use ONLY the real read below. Do not invent spoken lines, shots or numbers. If the transcript is missing, say the read is from the structure and on-screen text only.

WHAT WE COULD READ FROM THE VIDEO (all real, from the teardown):
Hook (first beat): ${c.hookText ? `"${c.hookText}"` : "(not captured)"}${c.hookType ? ` [type: ${c.hookType}]` : ""}
Cuts: ${c.cutCount || "?"} cuts, about ${c.cutsPerMinute || "?"} a minute; length ${c.durationSeconds || "?"}s.
On-screen text: ${c.onScreenText.length ? c.onScreenText.slice(0, 20).join(" | ") : "(none captured)"}
Transcript: ${c.transcriptAvailable && c.transcript ? c.transcript.slice(0, 3000) : "(no spoken transcript available)"}
Caption: ${c.caption ? c.caption.slice(0, 800) : "(none)"}
${stats}

Return ONLY JSON:
{
  "summary": "two or three plain sentences on what this video actually is and what happens in it",
  "craft": "two or three plain sentences on how it is shot: the hook, the pace, the structure, what makes it watchable, in everyday words (no jargon like percentile or cadence)",
  "caveats": [ "one line if the read is thin, e.g. no spoken transcript so this is from the pictures and on-screen text only" ]
}
No em dashes.`;
  const out = (await askJson(system, user, 2500)) as SavedVideoRead;
  if (!c.transcriptAvailable) out.caveats = ["No spoken transcript was available, so this read is from the pictures, cuts and on-screen text only.", ...(out.caveats || [])];
  return out;
}

export interface Recreation {
  whatMakesItWork: string;
  pattern: { hook: string; structure: string; pacing: string };
  yourVersion: { angle: string; hook: string; beats: { beat: string; detail: string }[]; shotList: string[]; caption: string; productionNotes: string };
  pillar: "A" | "B" | "C";
  caveats: string[];
  generatedAt?: string;
}

/** Turn the read of a saved video into a step-by-step recipe for THIS creator to
 * make their own version. Grounded in the real read; honest about limits. */
export async function recreateSavedVideo(p: Persona, read: SavedVideoRead, c: SavedVideoCtx, keyComments: string[]): Promise<Recreation> {
  const system = systemFor(p, "You are their content strategist. You reverse-engineer what made another creator's video work, then give a concrete recipe for them to make their own version in their world and voice. You return only JSON.");
  const comments = keyComments.length ? keyComments.slice(0, 12).map((x) => `- ${x}`).join("\n") : "(no comments captured)";
  const user = `TASK: ${p.name} saved this video as inspiration. First say plainly what makes it work (tie it to the real numbers, the comments, and how it is shot, not vibes). Then give a step-by-step recipe for ${p.name} to recreate the SAME winning pattern for their own content, in their world and pillars. Steal the structure and the mechanism, not the exact topic. Be specific and shootable. Never invent numbers; if evidence is thin, say so.

WHAT THE VIDEO IS: ${read.summary}
HOW IT IS SHOT: ${read.craft}
HOOK: ${c.hookText ? `"${c.hookText}"` : "(not captured)"}
REAL NUMBERS: ${c.stats ? `${c.stats.likes} likes, ${c.stats.comments} comments${c.stats.views ? `, ${c.stats.views} views` : ""}` : "none scraped"}
WHAT THE AUDIENCE SAID (real comments):
${comments}

Return ONLY JSON:
{
  "whatMakesItWork": "two or three sentences on the real reason this landed, citing the numbers, a comment, or the way it is shot",
  "pattern": { "hook": "the hook pattern to reuse, in one line", "structure": "the structure/beats that made it work", "pacing": "the pace and cut style that made it watchable" },
  "yourVersion": {
    "angle": "the specific idea for ${p.name}'s world that uses this same pattern",
    "hook": "the opening line as ${p.name} would actually say or show it",
    "beats": [ { "beat": "name of the beat", "detail": "what happens / what is shown / what point lands" } ],
    "shotList": [ "plain shot-by-shot notes: what to film, framing, on-screen text" ],
    "caption": "a caption in ${p.name}'s voice",
    "productionNotes": "length, style, music feel, edit pace, anything needed to shoot it"
  },
  "pillar": "A" | "B" | "C",
  "caveats": [ "honest limits: e.g. read from a single cover frame and the structure, not the full footage; thin comments" ]
}
Five to seven beats. Specific, not generic. No em dashes.`;
  const out = (await askJson(system, user, 4500)) as Recreation;
  out.generatedAt = new Date().toISOString();
  return out;
}

/* ------------------------------------------------------------------ */
/* Screenshots                                                         */
/* ------------------------------------------------------------------ */

export interface Transcription {
  handle: string;
  platform: string;
  caption: string;
  comments: string;
}

export async function transcribeScreenshots(images: { mimeType: string; data: Buffer }[]): Promise<Transcription> {
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: [
        ...images.map((img) => ({
          type: "image" as const,
          source: { type: "base64" as const, media_type: img.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: img.data.toString("base64") },
        })),
        {
          type: "text" as const,
          text: `These are screenshots of a social media post, its caption and its comment section. Return ONLY JSON:
{ "handle": "the poster's handle if visible, with @, else empty", "platform": "Instagram, TikTok, LinkedIn, YouTube, X or empty", "caption": "the post caption if visible, else empty", "comments": "every comment you can read, one per line, as 'handle: comment text'" }
Transcribe exactly what is written. Do not invent comments.`,
        },
      ],
    }],
  });
  const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  const j = extractJson(text) as Partial<Transcription>;
  return { handle: j.handle || "", platform: j.platform || "", caption: j.caption || "", comments: j.comments || "" };
}

/* ------------------------------------------------------------------ */
/* Creators and topics                                                 */
/* ------------------------------------------------------------------ */

export interface CreatorBreakdown {
  summary: string;
  whatTheyMake: string[];
  popularTopics: { topic: string; why: string }[];
  bestPerforming: { piece: string; whyItWorked: string; signal: string }[];
  formatsAndHooks: string[];
  audience: { whoTheyWantToBe: string; enemy: string };
  relationToProfile: { overlap: string; borrow: string[]; avoid: string[]; gapOnlyYouCanFill: string };
  suggestedTopics: string[];
  ideasForYou: { title: string; hook: string; format: string; pillar: "A" | "B" | "C"; why: string }[];
  evidenceQuality: "strong" | "thin" | "none";
  generatedAt?: string;
}

export interface CreatorInput {
  handle: string;
  platform: string;
  name: string;
  niche: string;
  notes: string;
  evidence: string;
  linkedIdeas: { title: string; url: string; note: string; sourceComments: string; themes: string[] }[];
}

export async function analyseCreator(p: Persona, c: CreatorInput): Promise<CreatorBreakdown> {
  const system = systemFor(p, "You are their content strategist and a sharp reader of other creators. You return only JSON.");
  const ideas = c.linkedIdeas.length
    ? c.linkedIdeas.map((i, n) => `SAVED PIECE ${n + 1}: ${i.title}${i.url ? ` (${i.url})` : ""}\nWhy it was saved: ${i.note || "(no note)"}\nThemes found in its comments: ${i.themes.join("; ") || "(not analysed)"}\nComments under it:\n${i.sourceComments.trim() || "(none captured)"}`).join("\n\n")
    : "(no saved pieces from this creator yet)";
  const user = `TASK: Give ${p.name} a breakdown of this creator: what they create, the topics that keep performing for them, their best performing pieces from the evidence available, and how all of it relates to ${p.name}'s own content. Be honest about evidence quality: you can only describe pieces that appear in the evidence or saved pieces below; never invent view counts or posts.

CREATOR: ${c.handle} on ${c.platform || "unknown platform"}${c.name ? ` (${c.name})` : ""}
NICHE AS NOTED: ${c.niche || "(none yet)"}
NOTES: ${c.notes || "(none)"}

EVIDENCE PASTED OR IMPORTED (bio, captions, view counts, top posts):
${c.evidence.trim() || "(none)"}

PIECES SAVED TO THE IDEAS BANK FROM THIS CREATOR:
${ideas}

Return ONLY JSON:
{
  "summary": "two sentences on who this creator is and why they work",
  "whatTheyMake": [ "formats and recurring content types" ],
  "popularTopics": [ { "topic": "...", "why": "why it lands for their audience" } ],
  "bestPerforming": [ { "piece": "the piece as described in the evidence", "whyItWorked": "the mechanism", "signal": "the number or comment signal from the evidence, or 'no numbers available'" } ],
  "formatsAndHooks": [ "hook patterns, edit style, structures they lean on" ],
  "audience": { "whoTheyWantToBe": "...", "enemy": "..." },
  "relationToProfile": {
    "overlap": "where their audience and ${p.name}'s overlap",
    "borrow": [ "specific things worth adapting, and how, in ${p.name}'s voice" ],
    "avoid": [ "things that would break ${p.name}'s profile rules or positioning" ],
    "gapOnlyYouCanFill": "the thing ${p.name} has that this creator does not"
  },
  "suggestedTopics": [ "2 to 5 short topic names to file this creator under" ],
  "ideasForYou": [ { "title": "...", "hook": "...", "format": "...", "pillar": "A" | "B" | "C", "why": "..." } ],
  "evidenceQuality": "strong" | "thin" | "none"
}
Three ideas. No em dashes.`;
  const out = (await askJson(system, user, 4500)) as CreatorBreakdown;
  out.generatedAt = new Date().toISOString();
  return out;
}

export interface TopicSuggestion {
  groups: { name: string; description: string; creators: string[]; ideas: string[] }[];
}

export async function suggestTopics(p: Persona, creators: { id: string; handle: string; niche: string; topics: string[] }[], ideas: { id: string; title: string; note: string; themes: string[]; tags: string[] }[], existing: string[]): Promise<TopicSuggestion> {
  const system = systemFor(p, "You organise a creator's inspiration library into topic groups. You return only JSON.");
  const user = `TASK: Group these creators and saved ideas into topic groups so similar subjects sit together. Reuse existing topic names where they fit; add new ones only when needed. Every creator and idea should land in one or two groups. Use the ids given.

EXISTING TOPICS: ${existing.join(", ") || "(none)"}

CREATORS:
${creators.map((c) => `${c.id} | ${c.handle} | niche: ${c.niche || "?"} | topics now: ${c.topics.join(", ") || "none"}`).join("\n") || "(none)"}

IDEAS:
${ideas.map((i) => `${i.id} | ${i.title} | ${i.note.slice(0, 140)} | themes: ${i.themes.join("; ")} | tags: ${i.tags.join(", ")}`).join("\n") || "(none)"}

Return ONLY JSON: { "groups": [ { "name": "short topic name", "description": "one line", "creators": [ "creator ids" ], "ideas": [ "idea ids" ] } ] }
Between 3 and 10 groups. No em dashes.`;
  return (await askJson(system, user, 4000)) as TopicSuggestion;
}

/* ------------------------------------------------------------------ */
/* Audience pulse across synced posts                                  */
/* ------------------------------------------------------------------ */

export interface AudiencePulse {
  headline: string;
  mood: "positive" | "mixed" | "negative";
  themes: { theme: string; evidence: string; count: string }[];
  requests: string[];
  objections: string[];
  identity: { whoTheyWantToBe: string; enemy: string; transformation: string };
  contentToMake: { title: string; hook: string; format: string; pillar: "A" | "B" | "C"; why: string }[];
  generatedAt?: string;
}

export async function audiencePulse(p: Persona, posts: { caption: string; comments: string[] }[]): Promise<AudiencePulse> {
  const system = systemFor(p, "You are their content strategist. You return only JSON.");
  const body = posts.map((x, n) => `POST ${n + 1}: ${x.caption.slice(0, 300) || "(no caption)"}\nCOMMENTS:\n${x.comments.join("\n")}`).join("\n\n");
  const user = `TASK: Read the comments ${p.name}'s own audience has left across these recent posts. Tell us what they are feeling, what they keep asking for, what they push back on, who they are trying to become, and what content that implies. Never invent comments.

${body}

Return ONLY JSON:
{
  "headline": "one sentence on what the audience is telling us right now",
  "mood": "positive" | "mixed" | "negative",
  "themes": [ { "theme": "...", "evidence": "paraphrase or short quote", "count": "rough share, e.g. 'about a third of comments'" } ],
  "requests": [ "specific things people asked for" ],
  "objections": [ "pushback or friction" ],
  "identity": { "whoTheyWantToBe": "...", "enemy": "...", "transformation": "..." },
  "contentToMake": [ { "title": "...", "hook": "...", "format": "...", "pillar": "A" | "B" | "C", "why": "..." } ]
}
4 to 6 themes, 3 to 5 content ideas across pillars. No em dashes.`;
  const out = (await askJson(system, user, 4000)) as AudiencePulse;
  out.generatedAt = new Date().toISOString();
  return out;
}

/* ------------------------------------------------------------------ */
/* Weekly plan                                                         */
/* ------------------------------------------------------------------ */

export interface WeeklyPlan {
  readOfTheBank: string;
  pieces: { day: string; ideaId: string; ideaTitle: string; format: string; pillar: "A" | "B" | "C"; angle: string; why: string; nextStep: string }[];
  gaps: string[];
  generatedAt?: string;
}

export async function weeklyPlan(
  p: Persona,
  ideas: { id: string; title: string; note: string; pillar: string | null; status: string; creator: string; analysed: boolean; themes: string[]; angles: string[]; briefed: string[] }[],
  recentPosts: string[],
): Promise<WeeklyPlan> {
  const system = systemFor(p, "You are their content strategist planning the week from their own curated inspiration bank. You return only JSON.");
  const user = `TASK: Pick 4 to 6 pieces for ${p.name} to make this week from the ideas below. Balance the pillars, mix discovery and depth, prefer ideas that already carry an audience signal, and say what the next concrete step is for each (analyse, brief in a format, film, write). Name gaps in the bank.

IDEAS IN THE BANK (unposted):
${ideas.map((i) => `${i.id} | ${i.title} | pillar ${i.pillar || "?"} | ${i.status} | from ${i.creator || "?"} | analysed: ${i.analysed} | themes: ${i.themes.join("; ")} | angles: ${i.angles.join("; ")} | briefs: ${i.briefed.join(", ") || "none"} | note: ${i.note.slice(0, 160)}`).join("\n")}

RECENT POSTS AND HOW THEY DID:
${recentPosts.join("\n") || "(no synced posts)"}

Return ONLY JSON:
{
  "readOfTheBank": "two sentences on what the bank is telling you right now",
  "pieces": [ { "day": "Mon", "ideaId": "...", "ideaTitle": "...", "format": "Reel | Carousel | LinkedIn | Long form | Story series", "pillar": "A" | "B" | "C", "angle": "the angle in one line", "why": "why this, why now", "nextStep": "the single next action" } ],
  "gaps": [ "what kind of inspiration or comment data is missing from the bank" ]
}
No em dashes.`;
  const out = (await askJson(system, user, 3500)) as WeeklyPlan;
  out.generatedAt = new Date().toISOString();
  return out;
}

/* ------------------------------------------------------------------ */
/* Measurement: per-piece comment sentiment (real counts, verbatim quotes) */
/* ------------------------------------------------------------------ */

export type CommentLabel = "positive" | "negative" | "neutral" | "question" | "spam";

export interface PieceCommentAnalysis {
  /** Real tallies computed by us from the model's per-comment labels. */
  distribution: Record<CommentLabel, number>;
  /** Share of non-spam comments that are positive, as a 0..1 number. */
  positiveShare: number;
  /** Comments worth the creator's eyes. Every quote is verified to appear
   * verbatim in the scraped comments; any the model invents are dropped. */
  surfaced: { quote: string; label: CommentLabel; why: string }[];
  /** Recurring themes, each carrying a verified verbatim example. */
  themes: { theme: string; example: string }[];
  /** How much to trust this: driven by how many comments we actually read. */
  sampleSize: number;
  evidenceQuality: "none" | "thin" | "ok" | "strong";
  /** True if the model's label count did not match the comments we sent, in
   * which case the distribution is partial and flagged. */
  partial: boolean;
  generatedAt?: string;
}

/** Normalise for a forgiving verbatim check (whitespace and case only). */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

const LABELS: CommentLabel[] = ["positive", "negative", "neutral", "question", "spam"];

/**
 * Classifies every scraped comment on one post and surfaces the interesting
 * ones. The model only labels and picks; WE count, and WE drop any surfaced
 * quote or theme example that is not actually present in the comments. So the
 * distribution is a real tally and no quote can be fabricated. Uses the cheap
 * model by default to keep credit use low.
 */
export async function analysePieceComments(
  comments: { text: string; username: string }[],
): Promise<PieceCommentAnalysis> {
  const clean = comments.map((c) => (c.text || "").trim()).filter(Boolean);
  const empty = (): PieceCommentAnalysis => ({
    distribution: { positive: 0, negative: 0, neutral: 0, question: 0, spam: 0 },
    positiveShare: 0,
    surfaced: [],
    themes: [],
    sampleSize: 0,
    evidenceQuality: "none",
    partial: false,
    generatedAt: new Date().toISOString(),
  });
  if (clean.length === 0) return empty();

  const numbered = clean.map((t, i) => `${i}. ${t.replace(/\n+/g, " ").slice(0, 400)}`).join("\n");
  const system = `You classify social media comments and surface the ones worth a creator's attention. You never invent comments. You return only JSON.`;
  const user = `Below are ${clean.length} comments, numbered from 0. Do three things.
1) Label every comment by index with exactly one of: positive, negative, neutral, question, spam.
2) Pick up to 8 comments genuinely worth the creator seeing (strong praise, sharp criticism, a real question, a buying signal, a content request). Quote each one EXACTLY as written.
3) Name up to 5 recurring themes, each with one verbatim example comment.

COMMENTS:
${numbered}

Return ONLY JSON:
{
  "labels": ["positive"|"negative"|"neutral"|"question"|"spam", ... one per comment, in index order, length ${clean.length}],
  "surfaced": [ { "quote": "exact text of the comment", "label": "positive"|"negative"|"neutral"|"question"|"spam", "why": "why it matters in a few words" } ],
  "themes": [ { "theme": "short name", "example": "exact text of one comment showing it" } ]
}
Quotes and examples must be copied verbatim from the comments above. No em dashes.`;

  const raw = (await askJson(system, user, 2000, CHEAP_MODEL)) as {
    labels?: string[];
    surfaced?: { quote?: string; label?: string; why?: string }[];
    themes?: { theme?: string; example?: string }[];
  };

  const haystack = clean.map(norm);
  const inCorpus = (q: string) => {
    const nq = norm(q);
    return nq.length > 0 && haystack.some((h) => h.includes(nq));
  };
  const asLabel = (s: unknown): CommentLabel => (LABELS.includes(s as CommentLabel) ? (s as CommentLabel) : "neutral");

  const labels = Array.isArray(raw.labels) ? raw.labels.map(asLabel) : [];
  const partial = labels.length !== clean.length;
  const distribution: Record<CommentLabel, number> = { positive: 0, negative: 0, neutral: 0, question: 0, spam: 0 };
  for (const l of labels) distribution[l]++;
  const nonSpam = distribution.positive + distribution.negative + distribution.neutral + distribution.question;
  const positiveShare = nonSpam > 0 ? +(distribution.positive / nonSpam).toFixed(3) : 0;

  // Drop any surfaced quote or theme example not present verbatim in the scrape.
  const surfaced = (raw.surfaced || [])
    .filter((s) => s.quote && inCorpus(s.quote))
    .slice(0, 8)
    .map((s) => ({ quote: String(s.quote), label: asLabel(s.label), why: String(s.why || "") }));
  const themes = (raw.themes || [])
    .filter((t) => t.theme && t.example && inCorpus(t.example))
    .slice(0, 5)
    .map((t) => ({ theme: String(t.theme), example: String(t.example) }));

  const eq = clean.length === 0 ? "none" : clean.length < 5 ? "thin" : clean.length < 15 ? "ok" : "strong";
  return { distribution, positiveShare, surfaced, themes, sampleSize: clean.length, evidenceQuality: eq, partial, generatedAt: new Date().toISOString() };
}

/* ------------------------------------------------------------------ */
/* Measurement: growth advice from deterministic numbers only          */
/* ------------------------------------------------------------------ */

export interface GrowthAdvice {
  summary: string;
  whatsWorking: { claim: string; evidence: string }[];
  whatsNot: { claim: string; evidence: string }[];
  recommendations: { action: string; rationale: string; expectedSignal: string; confidence: "low" | "medium" | "high" }[];
  /** The counter-case, so no conclusion stands unchallenged. */
  steelman: string[];
  caveats: string[];
  generatedAt?: string;
}

/**
 * Turns an already-computed measurement report into growth advice. The report
 * is real numbers only (from metrics.ts); this call is forbidden from
 * inventing any new metric, must tie each point to a number in the report, and
 * must give the counter-case for its own conclusions. Low-evidence areas are
 * passed in pre-flagged so the advice cannot overclaim.
 */
export async function adviseGrowth(p: Persona, report: unknown): Promise<GrowthAdvice> {
  const system = systemFor(p, "You are their content strategist reading a measurement report built from real scraped numbers. You return only JSON.");
  const user = `TASK: Below is a measurement report for ${p.name}, computed from real scraped post metrics and follower snapshots. Every number in it is real. Give growth advice that is tied to these numbers only.

Hard rules:
- Do not invent or estimate any number. Only cite numbers that appear in the report.
- Every claim must reference a specific figure from the report (a verdict, a median, a percentage, a follower delta, a sentiment count).
- Where the report marks evidence as "thin" or "none", say the data is insufficient rather than drawing a confident conclusion.
- For each conclusion, give the honest counter-argument in "steelman": what would have to be true for this read to be wrong.
- No motivational filler. No generic social media advice that ignores the numbers.

REPORT:
${JSON.stringify(report, null, 2)}

Return ONLY JSON:
{
  "summary": "two or three sentences on what the numbers say, overall",
  "whatsWorking": [ { "claim": "...", "evidence": "the exact figure(s) from the report behind it" } ],
  "whatsNot": [ { "claim": "...", "evidence": "the exact figure(s) behind it" } ],
  "recommendations": [ { "action": "a specific next move", "rationale": "the number that justifies it", "expectedSignal": "what metric should move if it works", "confidence": "low" | "medium" | "high" } ],
  "steelman": [ "for a key conclusion, the case that it could be wrong and why" ],
  "caveats": [ "limits of this data: sample sizes, what is not measured (e.g. reach, saves), scrape recency" ]
}
Confidence must be "low" when the relevant evidence quality is thin or the sample is under 5. No em dashes.`;
  const out = (await askJson(system, user, 3500)) as GrowthAdvice;
  out.generatedAt = new Date().toISOString();
  return out;
}

/* ------------------------------------------------------------------ */
/* Per-post read: honest take + one nuanced suggestion (cheap model)   */
/* ------------------------------------------------------------------ */

export interface PieceReadCtx {
  platform: string;
  caption: string;
  transcript: string;
  likes: number; comments: number; views: number; shares: number;
  interactions: number;
  engagementRate: number | null;
  verdict: "over" | "typical" | "under" | "insufficient";
  percentile: number;
  vsMedianPct: number;
  baselineN: number;
  baselineMetric: "engagementRate" | "interactions";
  baselineMedian: number;
  sentiment: { sampleSize: number; positiveShare: number; topComments: string[]; themes: string[] } | null;
}

export interface PieceRead { read: string; suggestion: string; generatedAt?: string }

/**
 * One post, read honestly from its real numbers, with a single suggestion that
 * has the counter-argument already folded in (so it is nuanced and hedged
 * where it should be) rather than a separate steelman list. Cheap model; only
 * the figures passed in may be cited.
 */
export async function readPiece(p: Persona, c: PieceReadCtx): Promise<PieceRead> {
  const system = systemFor(p, "You give a short, honest read of one of their posts and a single nuanced next move. You return only JSON.");
  const rate = c.engagementRate !== null ? `${(c.engagementRate * 100).toFixed(2)}% engagement rate` : `${c.interactions} interactions (no follower-based rate yet)`;
  const verdictWord =
    c.verdict === "over" ? "over-performing" :
    c.verdict === "under" ? "under-performing" :
    c.verdict === "typical" ? "typical" :
    "not judgeable yet (too few posts in the baseline)";
  const median = c.baselineMetric === "engagementRate" ? `${(c.baselineMedian * 100).toFixed(2)}% rate` : `${c.baselineMedian} interactions`;
  const user = `TASK: Give ${p.name} a short, honest read of ONE of their posts, then ONE suggestion.

THE POST (every number is real and scraped):
Platform: ${c.platform || "unknown"}
Caption: ${c.caption || "(none)"}
${c.transcript ? `What the video says: ${c.transcript.slice(0, 1500)}` : "Transcript: (none available)"}
Numbers: ${c.likes} likes, ${c.comments} comments${c.views ? `, ${c.views} views` : ""}${c.shares ? `, ${c.shares} shares` : ""}. ${rate}.
Against ${p.name}'s own baseline of ${c.baselineN} posts (median ${median}): ${verdictWord}, ${c.percentile}th percentile, ${c.vsMedianPct >= 0 ? "+" : ""}${c.vsMedianPct}% vs their median.
${c.sentiment ? `Comments read: ${c.sentiment.sampleSize}, ${Math.round(c.sentiment.positiveShare * 100)}% positive.${c.sentiment.topComments.length ? ` Notable: ${c.sentiment.topComments.map((q) => `"${q}"`).join("; ")}.` : ""}${c.sentiment.themes.length ? ` Themes: ${c.sentiment.themes.join(", ")}.` : ""}` : "No comments read yet."}

Rules:
- Only cite numbers given above. Invent nothing.
- If the verdict says the baseline is too thin to judge, or no comments were read, say so plainly instead of overclaiming.
- The suggestion is ONE concrete next move that already accounts for its own strongest counter-argument, so it is nuanced and hedged where it should be. Do not list the counter-arguments; fold that judgement into the single suggestion.

Return ONLY JSON:
{
  "read": "2 to 3 sentences: how this post did and the most likely why, tied to the real figures",
  "suggestion": "one concrete, nuanced next move, hedged where the data is thin"
}
No em dashes.`;
  const out = (await askJson(system, user, 900, CHEAP_MODEL)) as PieceRead;
  return { read: String(out.read || ""), suggestion: String(out.suggestion || ""), generatedAt: new Date().toISOString() };
}

/* ------------------------------------------------------------------ */
/* Video teardown: six-panel /10 scoring (Route A, Stage 2)            */
/* ------------------------------------------------------------------ */

export type BreakdownArea = "hook" | "script" | "sound" | "visual" | "packaging";

/** The five craft areas we ask the model to score. Performance is NOT here:
 * its /10 is derived deterministically from the real percentile so no outcome
 * number is ever modelled. */
const CRAFT_AREAS: BreakdownArea[] = ["hook", "script", "sound", "visual", "packaging"];

/** Everything the scoring call is allowed to see. Structural fields come from
 * the Apify teardown (real); performance fields come from metrics.ts (real).
 * The call may cite only these — it invents no number and no quote. */
export interface BreakdownScoreCtx {
  platform: string;
  caption: string;
  // Structural read from the teardown actor (all real, scraped).
  hookText: string;
  hookType: string;
  hookWhy: string;
  transcript: string; // may be empty (no-speech / music clip)
  onScreenText: string[];
  cutCount: number;
  avgShotSeconds: number;
  cutsPerMinute: number;
  durationSeconds: number;
  wpm: number;
  // Performance grounding (real, from the post's own baseline).
  verdict: "over" | "typical" | "under" | "insufficient";
  percentile: number;
  vsMedianPct: number;
  baselineN: number;
  baselineMetric: "engagementRate" | "interactions";
  engagementRate: number | null;
  interactions: number;
  sentiment: { sampleSize: number; positiveShare: number } | null;
}

export interface BreakdownPanel {
  area: BreakdownArea;
  /** 1..10, or null when there was not enough evidence to score it honestly. */
  score: number | null;
  worked: string;
  improve: string;
}

export interface BreakdownScores {
  panels: BreakdownPanel[]; // the five craft areas
  /** Derived deterministically from percentile; null when the baseline is too
   * thin to judge (verdict "insufficient"). Never modelled. */
  performance: { score: number | null; verdict: BreakdownScoreCtx["verdict"]; note: string };
  /** Mean of every score that is present (craft + performance), 1 decimal. */
  overall: number | null;
  headline: string;
  caveats: string[];
  /** True when a spoken transcript was available to judge script/sound. */
  transcriptAvailable: boolean;
  generatedAt?: string;
}

function clampScore(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(10, Math.round(n)));
}

/** Performance /10 straight from the percentile: 50th → 5, 90th → 9, 10th → 1.
 * Fully deterministic, so the outcome number is never the model's invention.
 * null when the baseline is too thin to rank against (verdict "insufficient"). */
function performanceScore(ctx: BreakdownScoreCtx): number | null {
  if (ctx.verdict === "insufficient") return null;
  return Math.max(1, Math.min(10, Math.round(ctx.percentile / 10)));
}

/**
 * Score one torn-down video across six panels. The model judges the five CRAFT
 * areas (hook, script, sound, visual cadence, packaging) from the real
 * structural read; the PERFORMANCE panel's number is computed here from the
 * post's real percentile, not asked of the model. Discipline mirrors the rest
 * of this file: cite only the figures/quotes given, never invent spoken lines
 * when no transcript exists, and flag thin evidence instead of overclaiming.
 */
export async function scoreBreakdown(p: Persona, ctx: BreakdownScoreCtx): Promise<BreakdownScores> {
  const transcriptAvailable = ctx.transcript.trim().length > 0;
  const perf = performanceScore(ctx);
  const verdictWord =
    ctx.verdict === "over" ? "over-performed" :
    ctx.verdict === "under" ? "under-performed" :
    ctx.verdict === "typical" ? "performed typically" :
    "cannot be judged yet (baseline too thin)";
  const rate = ctx.engagementRate !== null ? `${(ctx.engagementRate * 100).toFixed(2)}% engagement rate` : `${ctx.interactions} interactions (no follower-based rate)`;

  const system = systemFor(p, "You are their video editor and content strategist doing a precise teardown of ONE of their short videos. You judge craft from the structural read only. You return only JSON.");
  const user = `TASK: Tear down ONE short video for ${p.name} and score five craft areas out of 10 each. Every field below is real and scraped. Judge only from what is here. Do not invent spoken lines, shots, or numbers.

PLATFORM: ${ctx.platform || "unknown"}
CAPTION: ${ctx.caption || "(none)"}
DURATION: ${ctx.durationSeconds ? `${ctx.durationSeconds}s` : "(unknown)"}

HOOK (first beat, from the teardown):
- text: ${ctx.hookText || "(none captured)"}
- type: ${ctx.hookType || "(unlabelled)"}
- why the actor says it works: ${ctx.hookWhy || "(none)"}

SPOKEN TRANSCRIPT: ${transcriptAvailable ? ctx.transcript.slice(0, 6000) : "(NONE — this video has no transcribed speech. It may be a music/visual/B-roll clip. Do NOT guess what is said.)"}

ON-SCREEN TEXT (${ctx.onScreenText.length} line${ctx.onScreenText.length === 1 ? "" : "s"}): ${ctx.onScreenText.length ? ctx.onScreenText.slice(0, 40).map((l) => `"${l}"`).join(" | ") : "(none captured)"}

CUT CADENCE: ${ctx.cutCount} cut${ctx.cutCount === 1 ? "" : "s"}, ${ctx.cutsPerMinute} per minute, average shot ${ctx.avgShotSeconds}s.
SPEAKING PACE: ${transcriptAvailable ? `${ctx.wpm} words per minute` : "(no transcript, so pace unknown)"}

HOW IT ACTUALLY PERFORMED (its own baseline of ${ctx.baselineN} posts on ${ctx.platform}): ${verdictWord}, ${ctx.percentile}th percentile, ${ctx.vsMedianPct >= 0 ? "+" : ""}${ctx.vsMedianPct}% vs median, ${rate}.${ctx.sentiment ? ` Comments read: ${ctx.sentiment.sampleSize}, ${Math.round(ctx.sentiment.positiveShare * 100)}% positive.` : ""}

Score these FIVE areas only (performance is scored separately, not by you):
- hook: the first 1-3 seconds. Does the opening line / on-screen text / visual stop the scroll? Judge the hook text and type above.
- script: the structure and substance of what is said or shown. Judge the transcript and on-screen text.
- sound: spoken delivery pace, clarity, and any audio cue you can infer from pace and cadence. If there is no transcript, you cannot fully judge delivery: score conservatively and say so.
- visual: shot variety and cut cadence for the format. Use the cut figures. Too static or too frantic both cost points; justify against the numbers.
- packaging: caption + on-screen text + hook working together as the "why watch / why it got served" layer.

Hard rules:
- Each area's "worked" and "improve" must cite a specific figure above (a cut count, cuts/min, wpm, duration, percentile) or quote the hook / a transcript line / an on-screen line VERBATIM. No vague praise.
- If no transcript is available, do not invent what was said. Score script and sound conservatively, put the gap in "improve", and add a caveat.
- Scores are integers 1-10. Be willing to give low scores; a mediocre area should read as mediocre.

Return ONLY JSON:
{
  "panels": [
    { "area": "hook", "score": 1-10, "worked": "what landed, citing a figure or verbatim quote", "improve": "the single most valuable fix" },
    { "area": "script", "score": 1-10, "worked": "...", "improve": "..." },
    { "area": "sound", "score": 1-10, "worked": "...", "improve": "..." },
    { "area": "visual", "score": 1-10, "worked": "...", "improve": "..." },
    { "area": "packaging", "score": 1-10, "worked": "...", "improve": "..." }
  ],
  "performanceNote": "2-3 sentences reading WHY it ${verdictWord}, tying the craft above to the real percentile/rate. If the baseline is too thin, say so plainly.",
  "headline": "one sentence: the single biggest lever for ${p.name}'s next video, drawn from the lowest-scoring area",
  "caveats": [ "limits of this teardown: missing transcript, thin baseline, structural-only read, no vocal-tone analysis" ]
}
No em dashes.`;

  const raw = (await askJson(system, user, 2600)) as {
    panels?: { area?: string; score?: unknown; worked?: unknown; improve?: unknown }[];
    performanceNote?: unknown;
    headline?: unknown;
    caveats?: unknown;
  };

  // Map the model's panels by area; never fabricate a missing one.
  const byArea = new Map<string, { score?: unknown; worked?: unknown; improve?: unknown }>();
  for (const pan of raw.panels || []) if (pan && typeof pan.area === "string") byArea.set(pan.area, pan);
  const panels: BreakdownPanel[] = CRAFT_AREAS.map((area) => {
    const pan = byArea.get(area);
    return {
      area,
      score: pan ? clampScore(pan.score) : null,
      worked: pan ? String(pan.worked || "") : "",
      improve: pan ? String(pan.improve || "") : "Not scored: the model did not return this panel.",
    };
  });

  const scored = panels.map((x) => x.score).filter((n): n is number => n !== null);
  if (perf !== null) scored.push(perf);
  const overall = scored.length ? +(scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(1) : null;

  const caveats = Array.isArray(raw.caveats) ? raw.caveats.map((c) => String(c)).filter(Boolean).slice(0, 6) : [];
  if (!transcriptAvailable && !caveats.some((c) => /transcript/i.test(c))) {
    caveats.unshift("No spoken transcript was available, so script and sound are judged on structure only, not delivery.");
  }

  return {
    panels,
    performance: {
      score: perf,
      verdict: ctx.verdict,
      note: String(raw.performanceNote || ""),
    },
    overall,
    headline: String(raw.headline || ""),
    caveats,
    transcriptAvailable,
    generatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Ask: grounded chat + batch (group) insight                   */
/* ------------------------------------------------------------------ */

/** Conversational answer grounded only in the measurement numbers passed in. */
export async function chatAnswer(
  p: Persona,
  grounding: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const system =
    systemFor(p, "You are their content analyst. Answer what to make and why, using ONLY the numbers in the grounding below. Never invent a metric or a post; cite the real figures and name the posts or themes. When the data is thin, say so plainly. Be concise and specific, a few sentences, no filler.") +
    `\n\nTHE NUMBERS YOU MAY USE (all real and scraped; cite from here, invent nothing):\n${grounding}`;
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 1200,
    system,
    messages: messages.slice(-12).map((m) => ({ role: m.role, content: m.content })),
  });
  return stripEmDashes(res.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim());
}

export interface BatchInsight {
  summary: string;
  winnersShare: string[];
  losersShare: string[];
  recommendations: { action: string; evidence: string }[];
  caveats: string[];
  generatedAt?: string;
}

export interface BatchPieceCtx {
  caption: string; platform: string; likes: number; comments: number; views: number;
  engagementRate: number | null; verdict: string; percentile: number; read: string; hook: string; overall: number | null;
}

/** Find the patterns across a GROUP of posts, from the real numbers only. */
export async function batchInsight(p: Persona, pieces: BatchPieceCtx[]): Promise<BatchInsight> {
  const system = systemFor(p, "You find the patterns across a GROUP of their posts. You return only JSON.");
  const body = pieces.map((x, i) =>
    `POST ${i + 1} [${x.verdict}, ${x.percentile}th pct${x.overall !== null ? `, craft ${x.overall}/10` : ""}]: ${x.likes} likes, ${x.comments} comments${x.views ? `, ${x.views} views` : ""}${x.engagementRate !== null ? `, ${(x.engagementRate * 100).toFixed(2)}% rate` : ""}.${x.hook ? ` Hook: "${x.hook}".` : ""} Caption: ${x.caption.slice(0, 200)}${x.read ? ` | Prior read: ${x.read}` : ""}`,
  ).join("\n");
  const user = `TASK: Across these ${pieces.length} of ${p.name}'s posts, find what the strong ones share and what the weak ones share, from the real numbers only. Invent nothing; tie every point to figures or verbatim caption/hook detail.

${body}

Return ONLY JSON:
{
  "summary": "two sentences on what this group of posts shows",
  "winnersShare": [ "what the over or typical performers have in common, each tied to the posts" ],
  "losersShare": [ "what the under-performers share" ],
  "recommendations": [ { "action": "a specific next move this group points to", "evidence": "the figures or caption/hook detail behind it" } ],
  "caveats": [ "limits: sample size, what is not measured" ]
}
No em dashes.`;
  const out = (await askJson(system, user, 2500)) as BatchInsight;
  out.generatedAt = new Date().toISOString();
  return out;
}

/* ------------------------------------------------------------------ */
/* Content idea generator: real numbers + visual learning              */
/* ------------------------------------------------------------------ */

export interface ContentIdea {
  /** The idea in one concrete line she could film/shoot. */
  title: string;
  /** Reel | Carousel | TikTok | LinkedIn | Long form | Story series. */
  format: string;
  pillar: "A" | "B" | "C" | null;
  /** The opening approach, named by hook type where the data points to one. */
  hookAngle: string;
  /** One real figure behind it, cited from the grounding. */
  whyNumber: string;
  /** One visual/craft reason from the teardowns (hook type, cadence, what worked). */
  whyVisual: string;
  /** The single next action: film / write / outline. */
  firstStep: string;
  /** True when it is a repeatable series, not a one-off (consistency bias). */
  series: boolean;
}
export interface ContentIdeas {
  ideas: ContentIdea[];
  /** Said plainly when the data is thin, so the list is never dressed up. */
  caveat: string;
  generatedAt?: string;
}

/**
 * Turn the two groundings — real metrics (groundingFor) and visual learning
 * (craftGrounding) — into a short, ranked list of concrete content ideas. Same
 * honesty discipline as the rest: every idea cites a real figure AND a real
 * hook/craft signal from the grounding, invents no metric, and prefers
 * repeatable series tied to what over-indexes, so the output is consistent
 * content, not a grab-bag. `platform` optionally narrows the slate.
 */
export async function contentIdeas(p: Persona, grounding: string, platform?: string): Promise<ContentIdeas> {
  const focus = platform && platform !== "All" ? `\nFOCUS: only ideas for ${platform}.` : "";
  const system = systemFor(
    p,
    "You are their content strategist. Propose content ideas that are grounded in BOTH their real numbers and what the video teardowns learned from the footage. Every idea MUST cite one real figure (whyNumber) and one real visual/craft signal (whyVisual), both taken from the grounding below. Invent no metric and name no post that is not there. Prefer repeatable SERIES tied to the pillars and hook types that over-index, so the output is consistent content they can keep making, not one-off stunts. When the visual data is thin, lean on the metrics/themes and say so in the caveat. You return only JSON.",
  ) + `\n\nTHE GROUNDING (all real and scraped; cite from here, invent nothing):\n${grounding}`;
  const user = `TASK: Give ${p.name} 5 content ideas to make next, ranked best first.${focus}

Return ONLY JSON:
{
  "ideas": [
    {
      "title": "the idea in one concrete line she could film or shoot",
      "format": "Reel | Carousel | TikTok | LinkedIn | Long form | Story series",
      "pillar": "A" | "B" | "C" | null,
      "hookAngle": "the opening approach, naming the hook type when the data points to one",
      "whyNumber": "one real figure from the grounding",
      "whyVisual": "one real hook/cadence/craft signal from the teardowns",
      "firstStep": "the single next action: film / write / outline",
      "series": true
    }
  ],
  "caveat": "one line on what the data can and cannot support yet"
}
No em dashes. Exactly 5 ideas.`;
  const out = (await askJson(system, user, 2600)) as ContentIdeas;
  if (!Array.isArray(out.ideas)) out.ideas = [];
  out.ideas = out.ideas.slice(0, 5);
  out.caveat = typeof out.caveat === "string" ? out.caveat : "";
  out.generatedAt = new Date().toISOString();
  return out;
}
