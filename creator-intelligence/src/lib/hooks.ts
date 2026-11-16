/**
 * Hook taxonomy + classifier (Route A, Stage 5 — the moat).
 *
 * The teardown actor returns a free-text `hookType` plus the hook's words. Those
 * labels are inconsistent across videos, so we normalise each hook into ONE of a
 * fixed set of canonical types with a deterministic keyword map — no model call,
 * no credits, fully reproducible. The canonical type is what the Library groups
 * by to show which hook types over-index on a creator's best posts.
 *
 * This file invents nothing: it only buckets a hook that already exists. A hook
 * it cannot place lands in "Other" rather than being forced into a type.
 */

export type HookType =
  | "Question"
  | "Bold claim"
  | "Curiosity gap"
  | "How-to / value"
  | "Story"
  | "Listicle"
  | "Mistake / warning"
  | "Result / proof"
  | "Relatable / POV"
  | "Visual hook"
  | "Direct callout"
  | "Other";

export const HOOK_TAXONOMY: HookType[] = [
  "Question", "Bold claim", "Curiosity gap", "How-to / value", "Story", "Listicle",
  "Mistake / warning", "Result / proof", "Relatable / POV", "Visual hook", "Direct callout", "Other",
];

/** One-line plain description per type, for the UI. */
export const HOOK_BLURB: Record<HookType, string> = {
  "Question": "Opens with a question the viewer wants answered.",
  "Bold claim": "A strong, contrarian or surprising statement up front.",
  "Curiosity gap": "An open loop or tease that withholds the payoff.",
  "How-to / value": "Promises a tip, hack, or how-to straight away.",
  "Story": "Drops you into a personal story or moment.",
  "Listicle": "A numbered promise — N things, N ways, N reasons.",
  "Mistake / warning": "Stop/avoid/don't — a mistake or warning framing.",
  "Result / proof": "Leads with a result, number, or transformation.",
  "Relatable / POV": "POV or 'when you…' — built on recognition.",
  "Visual hook": "A pattern-interrupt or striking visual, not words.",
  "Direct callout": "Names the viewer — 'if you…', 'for anyone who…'.",
  "Other": "Didn't match a known hook type.",
};

/** Ordered rules: the first whose pattern hits the combined hook text wins, so
 * more specific/stronger signals are listed before broad ones. */
const RULES: { type: HookType; re: RegExp }[] = [
  { type: "Listicle", re: /\b(\d+)\s+(things|ways|reasons|lessons|tips|rules|steps|mistakes|signs|habits)\b|listicle|number(ed)? hook|^\s*\d+\b/i },
  { type: "Mistake / warning", re: /\b(stop|avoid|don'?t|never|mistake|wrong|warning|red flag|biggest mistake)\b|negativ|warning hook/i },
  { type: "Result / proof", re: /\b(i (made|made|grew|built|got|landed|hit|went from)|result|proof|revenue|\$|£|how i|transformation|before and after|went viral)\b|flex|result hook|proof/i },
  { type: "How-to / value", re: /\b(how to|how i|tutorial|step[- ]by[- ]step|hack|tip|guide|learn|the secret to)\b|how-?to|value hook|educational/i },
  { type: "Question", re: /\?\s*$|^\s*(what|why|how|when|who|which|do you|did you|have you|are you|can you|would you|ever wonder)\b|question hook|ask/i },
  { type: "Curiosity gap", re: /curiosity|open loop|teaser?|you won'?t believe|wait for it|watch till the end|nobody tells you|the real reason|here'?s why|tease/i },
  { type: "Relatable / POV", re: /\bpov\b|point of view|when you|that moment|relatable|if you know you know|iykyk|\bwe\b .*(all|always)/i },
  { type: "Bold claim", re: /bold|contrarian|controversial|hot take|unpopular opinion|hard truth|statement|claim|everyone is wrong|the truth about/i },
  { type: "Visual hook", re: /visual|pattern[- ]interrupt|scroll[- ]stop|b[- ]?roll|silent|no (words|speech)|black screen|action|movement|cold open/i },
  { type: "Direct callout", re: /\b(if you'?re|for anyone|for every|you need to|listen up|attention|calling all)\b|callout|direct address/i },
  { type: "Story", re: /\bstory ?time\b|story|personal|when i|i remember|a few years ago|narrative|let me tell you/i },
];

/** Normalise a hook (actor label + its words) to a canonical type. The label is
 * weighted first (it is the actor's own classification), then the hook's words. */
export function classifyHook(hookType: string | null | undefined, hookText: string | null | undefined): HookType {
  const label = (hookType || "").trim();
  const text = (hookText || "").trim();
  // The actor's own label is the strongest signal, so test it on its own first.
  for (const r of RULES) if (label && r.re.test(label)) return r.type;
  const combined = `${label} ${text}`.trim();
  if (!combined) return "Other";
  for (const r of RULES) if (r.re.test(combined)) return r.type;
  return "Other";
}
