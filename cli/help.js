export const HELP = `Ad Modification Brief Generator — turn winning SockLock ads into checked, production-ready modification briefs.

Usage: ad-mod-brief <command> [options]

Main flow
  rank                         Rank winners from the Meta ads export (EGP, ROMI, hook rate, topic age)
  generate <creative_id>       Full run: script → DNA → modifications → QA
      --n 10                   number of modifications
      --types hook,recut       limit modification types (hook, recut, revoice, ending, new_angle, new_creator)
      --script <file|->        .md/.txt/.csv/.docx file, or "-" for stdin (default: data/scripts/<id>.*)
      --doc <google doc link>  read the script from a Google Doc shared "Anyone with the link"
      --from <item>            reuse a script from the library: earlier run or approved modification
                               (the creative id is optional with --script/--doc/--from)
  show [--run <id>]            Print the modifications with diffs and QA notes
  review [--run <id>]          Approve / reject modifications interactively, with a reason
  learn                        Rebuild team rules from review notes (runs automatically after review and before generation)
  library                      Scripts you can reuse: script files, earlier runs, approved modifications
  export [--run <id>]          Write briefs: --format md,csv,html,pdf  --only auto|approved|passed|all
  demo                         Whole flow on recorded answers, no API key needed (separate demo workspace)
  ui [--port 4321]             Open the web interface

Step by step
  start <creative_id>          Create a run (turns a free-text script into a scene table)
  dna [--run <id>]             Analyze why the winner works and which cells are locked
  lock <cell...> / unlock <cell...> [--run <id>]   e.g. lock 3.voiceover
  fixes [--run <id>]           Suggested fixes for lines of the original that go beyond the brand facts
  fix <n> apply|keep [--run <id>]   Apply a suggested fix to the original, or keep the live text
  mods [--run <id>] [--n] [--types]                Generate modifications for a run with DNA
  check [--run <id>]           Re-run QA
  feedback <mod_id> approve|reject [reason...] [--run <id>]
  runs                         List runs
  stats                        Success metrics from the logs: acceptance rate, QA pass rate, cost per approved modification
  rules                        Print the current team rules

Claude Code skill / bring your own LLM
  prompt <normalize|dna|mods|learn> [--run <id>]   Print the exact prompt and JSON schema for a step
  ingest <normalize|dna|mods|learn> <file|-> [--run <id>]   Validate and save a JSON answer for a step
  start <creative_id> --defer  Create a run without calling an LLM (normalize later via prompt/ingest)

Options
  --provider anthropic|openai|claude-code|demo   default: ANTHROPIC_API_KEY → OPENAI_API_KEY → claude CLI → demo
  --csv <file>                 Meta ads export (default: data/ads.csv)
  --json                       Machine-readable output (for your own UI or scripts)
  --run <id>                   Run to work on (default: latest)
`;
