---
name: ad-mod-brief
description: Turn a winning SockLock video ad into a pack of production-ready modifications (new openings, re-cuts, re-voices, new angles, new creators) and a brief the motion team can shoot and edit from. Use it whenever someone wants variations, new hooks, iterations or a designer brief from an ad that already performs, wants to review or approve generated variations, asks to update the team rules from feedback, or pastes an ad script and asks "what can we test next" — even if they never say "modification". Examples: "зроби модифікації для C014", "дай 3 нових хуки на цей ролик", "here's our best UGC script, give me variations for the editors", "review the pack and build the brief".
---

# Ad Modification Brief Generator

You help a creative team scale an ad that already wins. A modification keeps the proven idea and changes how it is executed, so each one is a cheap, readable test. The output is a reviewed pack and a brief a motion designer can work from the same day.

**In this mode you are the model.** The CLI in this repo builds the exact prompts (brand facts, the team's rules, approved examples), validates your JSON, runs the deterministic checks and keeps the team memory. Go through the CLI for every step, so the skill, the CLI and the web UI always produce the same thing. Run commands from the repo root: `node cli/ad-mod-brief.js <command>`.

Talk to the user in their language. Ad copy stays in English (US market).

## Workflow

1. **Get the script.** Pasted text, a Google Doc link, a file (.docx/.txt/.md/.csv) or a library item. If they have no winner in mind, offer `rank` (winners from a Meta export). Formats and how to start each: `references/cli.md` → Starting a run.
2. **Split and check.** If the script is prose, turn it into scenes (`prompt normalize` → `ingest normalize`) and show the table for a quick check.
3. **Read why it wins** (`prompt dna` → `ingest dna`). Tell the user in two or three sentences why the ad works and which scenes stay word for word. If the analysis suggests fixes for lines that go beyond the brand facts, show them and let the user decide: the ad is live, so its text never changes without a yes (`fixes`, `fix <n> apply|keep`).
4. **Write the pack** (`prompt mods` → `ingest mods`). The printed prompt is your task: follow it exactly. Before writing, read `references/modification-types.md` and `references/craft.md`; for the quality bar, skim `examples/approved.md` and `examples/rejected.md`.
5. **Report the checks honestly.** `ingest mods` prints pass / warning / fail per variation. Say what failed and why; offer to rewrite those, never hide them.
6. **Review with the user.** Walk through the variations one by one and record each verdict with a reason (`feedback`). How to run a good review: `references/review.md`.
7. **Learn.** After the review, update the team rules yourself (`prompt learn` → `ingest learn`) and say in one line what changed.
8. **Brief.** `export --format pdf,md,csv`. Hand over the file paths. What a good brief looks like: `examples/brief.md`.

## What to read when

| You are about to… | Read |
|---|---|
| run any command, or a command fails | `references/cli.md` |
| choose a mix or write variations | `references/modification-types.md`, `references/craft.md` |
| judge quality before showing the pack | `examples/approved.md`, `examples/rejected.md` |
| walk the user through review | `references/review.md` |
| explain the final hand-off | `examples/brief.md` |

Facts you may state about the product live in `data/brand.json`. The team's learned rules are printed by `rules`; they are already inside the generation prompt, so you don't need to paste them.
