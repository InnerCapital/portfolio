# How I work with AI

Every tool in this repo was built by me working with Claude (in Claude Code) as a partner. That does not mean typing "build me an app". It works because of the structure around the model: instructions that tell it how to think, how to execute and when to stop and prove something works. This folder holds the skills I wrote to do that.

A skill is a set of written instructions Claude loads when a task matches it. Writing a good one is the same job as writing a good SOP. You decide what "good" looks like, set the order of work, list the failure modes, and say exactly when a person has to decide.

## The operating system: how the work gets done

| Skill | What it makes Claude do |
|---|---|
| [`elite-operator-system`](operating-system/elite-operator-system.md) | Picks a mode from the task: **Analyst** (clarify, root cause, pre-mortem, scope to the smallest useful version), **Operator** (execute on the bottleneck, lowest waste) or **Engineer** (reproduce, fix the root cause, test, and never claim something is fixed without proof). Non-trivial work runs in that order. |
| [`project-analyst`](operating-system/project-analyst.md) | Treats every request as a hypothesis. 5 Whys, feasibility and reversibility scoring, Murphy's-law pre-mortems, Parkinson's-law timeboxing. |
| [`conscientious-operator`](operating-system/conscientious-operator.md) | Execution discipline from Theory of Constraints, Lean, Black Belt problem-solving and ISO-style process control, plus a self-check before every answer. |
| [`builder-skill-stack`](operating-system/builder-skill-stack.md) | Routes business problems to the right specialist mode (distribution, conversion, feedback loops, product, operating rhythm, narrative, leverage) and says which combinations to use. |

These come straight from my background. I trained in Theory of Constraints and Lean at Goldratt, and the skills turn that way of working into instructions a model follows every time.

## Domain skills: giving the model the business

| Skill | What it holds |
|---|---|
| [`acme-hire-operations`](operations/acme-hire-operations.md) | The rental lifecycle as gated D-minus stages, the non-negotiable rules, the asset ID schema, the cleaning standard, contract gaps and the tech stack. Any operational advice starts from the real process. |
| [`acme-hire-design-system`](operations/acme-hire-design-system.md) | Logo, colour, type, voice and layout rules, so every document, deck and page Claude produces is on brand without a second pass. |
| [`staff-portal-architecture`](operations/staff-portal-architecture.md) | How the internal tool estate fits together: a staff hub that only shows links after a server-verified Google sign-in, one subdomain per tool, a vault with a second factor, one-off links for customers and couriers, safe mode on every write to money or CRM, and one alert channel. Includes the checklists for adding a tool and reviewing security. |
| [`admin-folder-mapping`](operations/admin-folder-mapping.md) | How to restructure or merge company Drive folders without breaking anything: inventory, map into the owner's existing structure, move (never copy) so links survive, leave app-written folders alone, check permissions first, verify every move by API, then update the docs that name paths. Written from a real leaver handover. |

All four are white-labelled. The operations skill is also trimmed: pricing, fleet size and expansion plans are the client's and are left out.

## Content skills: creative strategy as a system

Written for a founder-creator (here the fictional "Maya Rivers" of "Northwind Studio"). Together they form a pipeline from raw life moment to finished post.

| Skill | Stage |
|---|---|
| [`human-truth-story-system`](content/human-truth-story-system.md) | **Mine the story.** A 14-question interview that asks "why" three times until the event becomes a human truth, a hidden fear and a tension, then builds through Safe, Real and Raw to a reframe and an audience mirror. |
| [`audience-psychology-big-ideas`](content/audience-psychology-big-ideas.md) | **Find the idea.** Audience archetypes, research hypotheses, seven direct-response copywriters used as methods (Schwartz, Collier, Halbert, Caples, Ogilvy, Sugarman, Hopkins), white-space checks and a "Big Idea" handoff card. |
| [`content-waterfall`](content/content-waterfall.md) | **Make the content.** The CRIT intake, a hook bank, one hero asset, then native versions for Reels, LinkedIn, carousels, captions, newsletters and Stories, with an 8-point check before delivery and banned AI-sounding patterns. |

The skills hand work to each other, with a rule for which one owns what, so they never compete. The same thinking runs the [creator-intelligence](../creator-intelligence) product, which measures which of these ideas actually perform.

## Finance skill

[`pnl-analysis`](finance/pnl-analysis.md) reads a profit and loss statement the way an operator should: check the books are coded correctly before trusting them (deposits booked as revenue, VAT on the wrong lines, income in the wrong period), then margins, break-even and unit economics against a comparison, a bridge explaining what moved profit, the run rate after one-offs, and what the P&L can't show about cash. It never invents a figure and always leads with the conclusion.

## Product skill

[`scenario-engine`](product/scenario-engine.md) generates decision-making scenarios for a learning game: trade-offs with no single right answer, the outcomes of each choice, and the pattern behind them (game theory, power, negotiation, Stoicism).

## Working rules I hold the model to

These run through every project in this repo:

1. **Think, then build, then prove.** Plan before large changes. Never accept "fixed" without a test or a live check.
2. **Ship in stages.** Smallest useful version first, tested on real data, before the next stage starts.
3. **Never invent numbers.** Every claim cites a real figure; missing data stays missing and is labelled.
4. **People decide, AI drafts.** Anything touching money, customers or damage claims is a draft or test mode until a person confirms.
5. **Memory between sessions.** A short running brief (current project, what shipped, the exact next step, open risks) is rewritten at the end of every session, so each new session starts where the last one stopped.
6. **Least privilege.** Secrets live in one vault. Tools never hold each other's keys. The browser never decides who someone is.
