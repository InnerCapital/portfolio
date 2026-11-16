/**
 * Method that every intelligence call carries, plus the questionnaire that
 * builds a person's profile context. Maya's seed profile lives in seed.ts.
 */

export const CULT_AND_DIRECT_RESPONSE = `
CULT MARKETING PRINCIPLES (apply, mostly invisibly)
1. Identity over product: sell who the viewer becomes, not what is being shown.
2. Name the enemy: the way of doing things the audience is running from.
3. Founder truth: the specific moment of frustration or obsession, told like a confession, not a press release.
4. Movement, not product: what the content stands against and the world it wants.
5. Exclusivity: write as if letting the viewer in on something most people have not noticed.
6. Tribe vocabulary: two or three phrases the audience can adopt and repeat.
7. Gradual commitment: the smallest next step first (watch, save, comment, follow, then the free thing, then the paid thing).
8. Social proof as belonging: numbers and comments framed as an invitation to join, not validation.
9. Ritual: a repeatable behaviour tied to the content (a weekly slot, a monthly format, a recurring segment).

DIRECT RESPONSE TECHNIQUES (apply with restraint, never hype)
- One big idea per piece. If it needs two, it is two pieces.
- The hook earns the next three seconds; the first line does one job only.
- Specificity beats claims: numbers, names, places, dates, exact moments.
- Mechanism: explain the how behind the result so the claim becomes believable.
- Handle the top objection inside the piece rather than ignoring it.
- Open loops that the piece actually closes.
- Proof before promise; show the receipt before the lesson.
- A single clear call to action, positioned as the natural continuation.
- Urgency only when it is real (an event, a cohort, a date). Never manufactured scarcity.
- Pattern interrupts for short form: a visual or verbal break in the first two seconds.

VOICE CHECK BEFORE OUTPUT
Would this person say it out loud? Is there a vague word that could be specific? Does it feel like a conversation with one person? Does the reader feel seen rather than sold to? Any em dashes? Remove them. Respect every do and don't in the profile.
`.trim();

export const FORMAT_GUIDES: Record<string, string> = {
  LONG_FORM: `LONG FORM VIDEO (YouTube or podcast-style, 8 to 15 minutes). Brief must cover: working title options (3), the one big idea, the cold open (first 30 seconds: what is shown and said), a segment-by-segment outline with the beat each segment lands and a rough timestamp, the proof moments (receipts, footage, documents, numbers), the objection handled, the enemy named, retention devices (open loops and payoffs), the tribe phrase to seed, end-screen CTA as the smallest next step, thumbnail concept and title thesis, and which pillar it serves.`,
  SHORT_FORM: `SHORT FORM VIDEO (Instagram Reel and TikTok, 20 to 45 seconds). Brief must cover: three hook options (spoken line plus on-screen text for each, first 2 seconds), the pattern interrupt, the beat structure second by second (roughly 5 to 7 beats), what is on screen versus what is said, the visual format (talking head, b-roll with VO, text on screen, screen recording), the single lesson or reversal, the comment bait (a question or claim that provokes replies), caption structure (first line, body, CTA), 3 to 5 hashtags or none if better, the save trigger, whether it is a discovery piece (non-follower reach) or a depth piece (for the existing audience), and which pillar it serves. Note any TikTok-specific difference (rawer edit, trending sound optional).`,
  CAROUSEL: `INSTAGRAM CAROUSEL (6 to 10 slides). Brief must cover: the cover slide headline (3 options) and the promise it makes, a slide-by-slide plan with each slide's headline and the one point it makes (no more than 25 words of body per slide), the swipe hooks that pull to the next slide, where the proof goes, where the enemy is named, the penultimate slide's reframe, the last slide's CTA (save, share, or the free resource), the caption structure, design notes that follow the profile's visual rules, and which pillar it serves.`,
  LINKEDIN: `LINKEDIN POST (written, 150 to 300 words). Brief must cover: three opener line options (the line above the fold before "see more"), the structure line by line in beats (one idea per line, short lines, whitespace), the proximity or proof signal, the specific insight only this person could give, the enemy or contrast, the reframe, the closing line that invites a considered reply rather than a cheap question, whether to attach an image or document and what it would be, the commercial signal embedded without asking, and which pillar it serves. No hashtags beyond two. No hooks that read as Instagram copy pasted in.`,
};

export const FORMAT_LABELS: Record<string, string> = {
  LONG_FORM: "Long form video",
  SHORT_FORM: "Reel / TikTok",
  CAROUSEL: "Carousel",
  LINKEDIN: "LinkedIn post",
};

export interface Question {
  key: string;
  label: string;
  help: string;
  kind: "short" | "long" | "list";
}

/** The questionnaire every profile completes before the intelligence layer writes for them. */
export const QUESTIONNAIRE: { section: string; questions: Question[] }[] = [
  {
    section: "Who you are",
    questions: [
      { key: "identity", label: "Who are you, in the way you would introduce yourself to someone you respect?", help: "Role, what you have built, where you are based. Specific beats impressive.", kind: "long" },
      { key: "thesis", label: "What is the one story your content keeps telling?", help: "The arc people follow you for. Maya's is shy-to-visible founder. What is yours?", kind: "long" },
      { key: "founderTruth", label: "What is the real reason you started doing this?", help: "The specific moment of frustration or obsession. Write it like a confession, not a bio.", kind: "long" },
      { key: "proof", label: "What receipts do you have?", help: "Numbers, names, outcomes, stages you have stood on, things you have shipped. These become proof in briefs.", kind: "list" },
    ],
  },
  {
    section: "Who it is for",
    questions: [
      { key: "audience", label: "Who is watching, and who do they want to become?", help: "Not demographics. Their ideal self. What they want to be seen as.", kind: "long" },
      { key: "enemy", label: "What are they (and you) running from?", help: "A way of doing things, a type of content, a mindset, an industry habit. Name it plainly.", kind: "long" },
      { key: "transformation", label: "Before they found you they were ___. After, they are ___.", help: "The transformation your content promises.", kind: "long" },
      { key: "feeling", label: "If someone could feel one thing after your content, what is it?", help: "One feeling. Be precise.", kind: "short" },
    ],
  },
  {
    section: "Your voice",
    questions: [
      { key: "voiceDo", label: "How should it sound? What should it always do?", help: "Tone, sentence style, words you love, references you make.", kind: "list" },
      { key: "voiceDont", label: "What should it never do?", help: "Words, framings and formats to ban. Maya bans em dashes, corporate language, hustle framing, performed authenticity.", kind: "list" },
      { key: "phrases", label: "Phrases your audience already repeats back to you, or ones you want them to.", help: "Your tribe vocabulary. Two or three is enough.", kind: "list" },
      { key: "visual", label: "Visual rules for anything designed.", help: "Fonts, colours, what to avoid. Used for carousel and thumbnail notes.", kind: "list" },
    ],
  },
  {
    section: "Your goals",
    questions: [
      { key: "pillarA", label: "Pillar A: what commercial outcome does your content serve first?", help: "Name it and say what content earns it. Maya: speaking pipeline.", kind: "long" },
      { key: "pillarB", label: "Pillar B: the second outcome.", help: "Maya: brand partnerships.", kind: "long" },
      { key: "pillarC", label: "Pillar C: the third outcome or long-term positioning.", help: "Maya: media company positioning.", kind: "long" },
      { key: "funnel", label: "What is the smallest next step someone can take, and what comes after it?", help: "Free thing, list, call, product. CTAs are built from this ladder.", kind: "long" },
    ],
  },
  {
    section: "Your understanding of social",
    questions: [
      { key: "platforms", label: "Which platforms and formats do you actually make?", help: "Reels, TikTok, carousels, LinkedIn, long form, stories. Say which matter most.", kind: "list" },
      { key: "bestWork", label: "Your best performing pieces and why you think they worked.", help: "Paste titles or hooks with rough numbers. The intelligence layer learns your winning patterns from this.", kind: "long" },
      { key: "worstWork", label: "What flopped, and your honest read on why.", help: "Patterns to avoid.", kind: "long" },
      { key: "socialBeliefs", label: "What do you believe about social that most people get wrong?", help: "Your personal theory of the feed. This is what makes the ideas yours rather than generic.", kind: "long" },
      { key: "inspirationBaseline", label: "Creators or accounts you already learn from, and what each one does well.", help: "Handles with a line each. These seed your creators library.", kind: "list" },
    ],
  },
];
