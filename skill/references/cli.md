# CLI in skill mode

All commands: `node cli/ad-mod-brief.js <command>` from the repo root. Add `--json` when you want to parse the output.

## The prompt → answer → ingest loop

Every model step works the same way, so the prompts stay identical to the CLI and the UI:

1. `prompt <step>` prints the system text, the task and the JSON schema the answer must match.
2. You write the answer as JSON to a temp file outside the repo (for example `$TMPDIR/dna.json`).
3. `ingest <step> <file>` validates it against the schema and saves it to the run. If validation fails, the error names the field; fix the JSON and ingest again.

Steps: `normalize` (prose → scenes), `dna` (why it wins + what stays), `mods` (the pack), `learn` (team rules).

## Starting a run

The creative id is optional; without one the tool makes an `S-XXXXX` id.

| The user gives you | Command |
|---|---|
| Pasted text | save it to a temp file, then `start [<id>] --script <file> --defer` |
| A Google Doc link (shared "anyone with the link") | `start [<id>] --doc <link> --defer` |
| A file | `start [<id>] --script <path> --defer` (.docx, .txt, .md, .csv) |
| A library item | `library`, then `start --from <item> --defer` |
| An example by id | `start C014 --defer` |

`--defer` means: don't call an API, you are the model. If the script is prose, the run waits for `normalize`.

## Other commands

| Command | Use |
|---|---|
| `show` | print the current run: script, DNA or the pack with checks |
| `lock 3.voiceover` / `unlock 1.visual` | change what stays word for word (cell ids are `<scene>.<field>`) |
| `fixes` | list suggested fixes for lines that go beyond the brand facts |
| `fix <n> apply` / `fix <n> keep` | apply a suggested fix to the original, or keep the live text; the list renumbers after each, so run `fixes` again |
| `feedback <mod_id> approve\|reject "<reason>"` | record a verdict |
| `rules` | print the team rules |
| `library` | earlier scripts, approved variations, examples |
| `rank` | winners from the Meta export (`--csv <file>` for another export) |
| `export --format pdf,md,csv` | write the brief (approved variations; `--only all` for everything) |
| `stats` | acceptance rate, check pass rate, cost per approved variation |

## When something fails

- **Schema error on ingest**: the message lists the path, e.g. `$.mods[3].scenes[2].footage: missing`. Fix only that and ingest again.
- **"No script found"**: the id has no file in `data/scripts/`; ask for the script or use `--script` / `--doc`.
- **Google Doc can't be opened**: it isn't shared as "anyone with the link". Ask the user to change sharing or paste the text.
- **Demo has no recorded answer**: you are in skill mode, so don't use `--provider demo`; use `--defer` and write the answers yourself.
