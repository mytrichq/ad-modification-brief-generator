# Rejected variations

Real variations of C014 that the reviewer rejected or the checks caught, and what to do instead. Each one looked reasonable on paper; the reason is what makes it a lesson.

---

## Hook · "Before and After Split" · rejected

> Reviewer: "Split-screen is too much production for a hook test. Hooks should be one take at home."

| Scene | Footage | Visual | Voiceover | On-screen text |
|---|---|---|---|---|
| 1 | new | Split screen. Left (new shot): she kneels over loose socks holding two that don't match. Right (original overhead): socks come out already in pairs | Left is how I used to do socks. Right is now. Same laundry. | Before vs. now: same family laundry |

**What went wrong:** the idea is fine, the cost is not. A hook test should be cheap enough to make five of; this one needs a new shot plus compositing.
**Instead:** the same before/after contrast in one take, e.g. a hand holding two mismatched socks, then cut to the original overhead.

---

## Re-voice · "Deadpan Tired-Parent Voice" · rejected

> Reviewer: "The tired deadpan voice makes the product feel like a chore. Keep the energy warm."

Same pictures, new delivery: "deadpan and dry, a bit faster, flat delivery", lo-fi beat, word-by-word captions. Lines tightened: "Socks for a family of four. Matched: zero. Watch."

**What went wrong:** the tone works against the promise. The ad sells relief; a tired voice sells the chore.
**Instead:** change the voice in a direction that keeps the warmth: a different family member, a faster, excited pace, or a whisper "secret".

---

## New creator · "Grandma's Sleepover Laundry" · rejected

> Reviewer: "The grandma setup takes too long; the first line runs past the limit."

| Scene | Footage | Visual | Voiceover | On-screen text |
|---|---|---|---|---|
| 1 | new | She tips a laundry bag of kids' and adults' clothes onto her kitchen table and lifts out socks already in pairs | The grandkids slept over. Here's their laundry, and I'm not matching one sock. | Sleepover laundry. Zero matching. |

The check flagged it: `long_hook`, first spoken line 15 words (max 14).

**What went wrong:** a good persona, but the context (sleepover, grandkids, laundry bag) eats the first two seconds before the payoff.
**Instead:** lead with the payoff and let the persona show in the picture: "Grandkids' socks. All still in pairs."

---

## Ending · "Quiz On Her Phone" · caught by the checks

| Scene | Footage | Visual | Voiceover | On-screen text |
|---|---|---|---|---|
| 1 | reuse | (original) | Watch me put away socks for a family of four without matching a single pair. | Socks for 4. Zero matching. |
| 6 | new | Over her shoulder: her thumb taps through the quiz on her phone, picking an adult size, then a kid size | Adult sizes, kid sizes, all picked in the quiz. Your turn. | Pick everyone's size in the quiz → |

The checks flagged it: `scope` (an ending test also changes scene 1) and `long_hook`.

**What went wrong:** the model "fixed" the opening line while writing an ending. Now the CTR result mixes two changes. Fixes to the original are suggested separately (`fixes`); a variation never makes them on its own.
**Instead:** keep scene 1 exactly as the original and change only scene 6.
