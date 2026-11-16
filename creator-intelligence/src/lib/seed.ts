/**
 * Demo seed profile for the fictional creator Maya Rivers. Created on first run
 * if no profile exists, so the bank is usable immediately. Everything here can
 * be edited on the Profile page. All people, brands and figures are invented.
 */

export const SEED_ANSWERS: Record<string, string> = {
  identity:
    "Maya Rivers. Founder, speaker, and founder of Northwind Studio, a content studio that partners with brands on social campaigns grounded in real creator insight. Building a second business quietly and documenting the process. Manchester. Instagram and LinkedIn.",
  thesis:
    "The quiet-to-visible founder arc. Most creators document a lifestyle. I document a company being built inside a normal life. That is the story no one else is telling.",
  founderTruth:
    "I started a coffee subscription brand from my kitchen table and grew it to a seven-figure business, then stepped away when it was sold. I learned more about attention from building that brand than from any course, and I want to show the working, not just the result.",
  proof:
    "Built and exited a coffee subscription brand\nRegular conference speaker on brand building\nInstagram 30K, top Reel 60K views and 450 new followers from one post\nLinkedIn 9K, a steady source of speaking enquiries",
  audience:
    "Founders, operators and creative professionals in the UK who want to be seen as serious builders with taste. On LinkedIn: senior decision makers and founders who book speakers. They want to become the visible, articulate version of themselves without performing.",
  enemy:
    "Performed authenticity. Hustle theatre. The polished feed with nothing behind it. Advice from people who never built anything. Generic education with no personal anchor.",
  transformation:
    "Before: capable, under-seen, watching louder people take the room. After: visible on their own terms, with systems behind the visibility and a company being built inside the life.",
  feeling: "Seen, and quietly more capable than they were before they pressed play.",
  voiceDo:
    "Strength, systems and positioning\nAuthority earned through lived experience\nIntellectual clarity about what has been built\nWarmth without performance\nEditorial, considered, direct sentences\nWrite for an intelligent reader operating at a high level",
  voiceDont:
    "No em dashes anywhere\nNo corporate language\nNo hustle framing\nNo performed authenticity\nNo oversharing before extracting the lesson\nNo 'building in public' framing for the next business (building quietly, revealing selectively)",
  phrases: "Documenting the build\nQuiet to visible\nThe company inside the life",
  visual: "Off-white ground, warm grey rules, dark ink, one muted accent colour\nA single clean sans-serif\nNo gradients\nEditorial, not dashboard\nNo emoji as bullets",
  pillarA:
    "Speaking pipeline. Attract event bookers by showing speaking is already happening, behind-the-talk moments, and what a room gets. Never ask for bookings. LinkedIn is the primary booker audience.",
  pillarB:
    "Brand partnerships. Signal selectivity, creative standards and audience trust so premium brands approach her management. Never pitch.",
  pillarC:
    "Media company positioning. The founder who builds a brand like a media company and documents everything. Compounds over time.",
  funnel:
    "Free resources (brand storytelling cheat sheet, content planning template) -> email list -> paid strategy call -> workshops and digital products -> mentorship and consulting. Every CTA is the smallest natural next step.",
  platforms: "Instagram Reels (discovery, the main growth engine)\nInstagram carousels\nLinkedIn writing (native thinking, not adapted Instagram copy)\nStories\nLong form is next\nTikTok secondary",
  bestWork:
    "'quiet people build loud brands' Reel: 60K views, 1,100 saves, 180 comments, 450 new followers, mostly non-follower reach. Contrarian identity statement.\n'what selling my company taught me about content': high comment rate on modest views, a founder confession with the lesson extracted.",
  worstWork:
    "Generic education (productivity tips, money tips) consistently underperforms. Static posts for reach. Posting outside the early-week morning peak. LinkedIn posts that were Instagram copy pasted in.",
  socialBeliefs:
    "People do not follow a life, they follow a story with a system behind it. The comment rate matters more than views. Discovery content and depth content are different jobs. Proof before promise. The documentation of the build is more interesting than the result.",
  inspirationBaseline:
    "@example.lifestyle: consistent visual palette, strong saves on lifestyle content. Missing: strategy behind the life.\n@example.flatshare: community-first documentation, high comment engagement. Missing: authority and commercial depth.",
};

export const SEED_CONTEXT = `
WHO
Maya Rivers: founder, speaker, and founder of Northwind Studio, a content studio that partners with brands on social campaigns grounded in real creator insight. Building a second business quietly and documenting the process. Manchester. Instagram and LinkedIn.

THE THESIS
The quiet-to-visible founder arc. Most creators document a lifestyle. Maya documents a company being built inside a normal life.

FOUNDER TRUTH AND PROOF
Started a coffee subscription brand from her kitchen table, grew it to a seven-figure business and stepped away when it was sold. Regular conference speaker. Instagram 30K, LinkedIn 9K.

AUDIENCE
Founders, operators and creative professionals in the UK who want to be seen as serious builders with taste. On LinkedIn: senior decision makers and founders who book speakers. Ideal self: visible on their own terms, with systems behind the visibility.
Enemy: performed authenticity, hustle theatre, the polished feed with nothing behind it, advice from people who never built anything, generic education with no personal anchor.
Transformation: capable and under-seen -> visible on their own terms with a company being built inside the life.
One feeling: seen, and quietly more capable.

VOICE
Do: strength, systems and positioning; authority from lived experience; intellectual clarity; warmth without performance; editorial, considered, direct sentences for an intelligent reader.
Never: em dashes, corporate language, hustle framing, performed authenticity, oversharing before the lesson, "building in public" framing for the next business, generic education without a personal anchor.
Tribe phrases: documenting the build; quiet to visible; the company inside the life.
Visual: off-white ground, warm grey rules, dark ink, one muted accent, a single clean sans-serif, no gradients, editorial not dashboard, no emoji bullets.

WHAT HAS WORKED
Contrarian identity statement ("quiet people build loud brands"). Founder confession with the lesson extracted. Meta-creator positioning ("I've been documenting..."). Proximity signal with a specific insight. Business-life integration.
What underperforms: generic education, static posts for reach, posting outside the early-week morning peak, LinkedIn posts that are Instagram copy.

PILLARS
A = Speaking pipeline: show speaking is already happening and what a room gets; never ask for bookings; LinkedIn is the booker audience.
B = Brand partnerships: signal selectivity, creative standards and audience trust so premium brands approach her management; never pitch.
C = Media company positioning: the founder who builds a brand like a media company and documents everything.

FUNNEL
Free resources -> email list -> paid strategy call -> workshops and products -> mentorship and consulting. Every CTA is the smallest natural next step.

PLATFORMS
Instagram Reels for discovery, carousels, native LinkedIn writing, stories; long form next; TikTok secondary.
`.trim();

export const SEED_PILLARS = { A: "Speaking pipeline", B: "Brand partnerships", C: "Media company positioning" };
