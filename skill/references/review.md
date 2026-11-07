# Running the review with the user

The review decides what gets produced, and the reasons teach the next pack. Make it fast for the user and useful for the tool.

## How to present each variation

One at a time, in this order:

1. Type, title, the effort level (light / medium / heavy) and what the designer has to do.
2. What changes, as "was → becomes" per scene. Mention which scenes stay.
3. The hypothesis and the metric it will be read on.
4. Check notes, if any, in plain words.

Then ask for a verdict. Openings (hooks) can be shown together, since they share the same body.

## Getting a reason that becomes a good rule

A reason turns into a team rule, so ask for one that names the cause, not the feeling:

| Weak | Strong |
|---|---|
| "don't like it" | "the split screen is too much production for a hook test" |
| "good" | "reuses our demo footage, ships today" |
| "too long" | "the grandma setup takes too long; the first line runs past the limit" |

If the user is short on time, offer a reason in their words and confirm it, then record it with `feedback <mod_id> approve|reject "<reason>"`.

## Check results, in plain words

Errors make a variation **fail**; warnings make it **warn**.

| Code | Level | Means | What to do |
|---|---|---|---|
| `claim_*` | error | a line makes a claim the brand can't back (medical, "forever", free shipping, a competitor…) | rewrite that line or reject |
| `offer` | error | wrong price or pair count in an offer line | rewrite with "5 pairs for $29" |
| `locked_changed` | error (warning for re-cuts) | a cell meant to stay word for word was changed | reject; the variation broke the proven core |
| `no_change` | error | nothing changed | drop it |
| `scope` | warning | a hook or ending also changed other scenes | rewrite to change only its part, or reject |
| `too_small` | warning | a new angle or new creator changed less than half of the open scenes | it won't read as a new ad; rewrite bolder |
| `near_duplicate` | warning | too close to another variation in the pack | keep the stronger one |
| `long_hook`, `long_text` | warning | first line over 14 words, or on-screen text over 8 | tighten before production |
| `locked_reshoot` | warning | a scene whose picture should stay is planned as a new shot | switch it to reuse or trim |
| `recut_new_shot` | warning | a re-cut asks for new footage | re-cuts use existing footage only |
| `no_quiz_cta` | warning | the last scene doesn't send people to the quiz | add the quiz CTA |

A variation that failed can still be approved when the user has a reason; record that reason, it will teach the rules.

## After the review

Run the learn step yourself (`prompt learn` → `ingest learn`) and tell the user in one line how the rules changed, e.g. "Rules updated: +2, hooks should be one take at home; keep the voice warm."
