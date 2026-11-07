# What the finished brief looks like

`export` writes the brief from the run: PDF for people, Markdown for docs and tickets, CSV for a tracker. By default it includes the approved variations; with no reviews yet, everything that passed the checks.

The motion designer should be able to start work from it without asking questions. That is why each part is there.

## Structure

1. **Header:** the original ad, the run id, how many variations and who generated them.
2. **Why it works:** two or three sentences from the analysis. It tells the designer what not to break.
3. **Keep as is in every variation:** the locked cells, word for word.
4. **Hook stack** (PDF): all approved openings grouped, because they share one body and are made in one edit session.
5. **One section per variation:**
   - type, title, effort level and the tasks behind it ("new shot: scene 1, record VO, text layers"), and how many scenes come from existing footage;
   - the hypothesis and the metric it will be read on;
   - direction (talent, location, voice, music, captions), only where it differs from the original;
   - footage per scene: reuse / trim / new;
   - "what changes" as a before → after table;
   - the full script, ready to paste into an editing doc.
6. **Differs from the live ad:** when the user applied a suggested fix to the original, the brief says so, so nobody is surprised that the "original" in the brief isn't what's running.

## Excerpt (real export of C014)

```markdown
## C014-AI01 · Hook · One Pair, Tight Pull

Production: **Medium · record VO, re-edit timing, text layers · 6/6 scenes from existing footage** · QA: **pass**

**Hypothesis:** If we open on a tight close-up of one sock pulled from the pile with its pair
still attached, then more viewers will stop scrolling, because one clear 'wait, they're stuck
together?' moment reads faster on a phone screen than a wide laundry mountain. _(read on hook rate)_

**Footage:** S1 trim, S2 reuse, S3 reuse, S4 reuse, S5 reuse, S6 reuse

**What changes:**

| Scene | Field | Before | After |
|---|---|---|---|
| 1 | Visual | Overhead: a mountain of clean laundry dumped on the bed… | Tight crop of the original overhead shot: one hand pulls a single sock… |
| 1 | Voiceover | Watch me fold socks for a family of four in ten seconds. | I pulled one sock out of the wash. Its pair came with it. |
| 1 | On-screen text | Socks for 4. Timer on. | One sock out. Two come with it. |
```

## Handing it over

Give the user the file paths and one line per approved variation: type, title, effort. Point out anything that needs booking (a new creator, a kid on camera) since that takes longest to arrange.
