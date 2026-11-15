# Evaluation harness

How `sem-jiff` is measured, and everything needed to repeat it. The labels live in
`test/fixtures/labels/`; the projects they come from are listed here and downloaded on
demand (nobody else's code is committed).

## What is measured

Extracted and inlined functions in real commits: does the engine find the real ones
(recall), and how often is a claim it makes wrong? Moves, renames and formatting are
checked separately, with generated known changes (`bench/synthetic.ts`) and the test suite.

## The test sets

- **Practice** projects are studied: their misses and wrong claims are read and used to
  improve the engine. Their scores are optimistic.
- **Held-out** projects are never looked at. Independent agents label them and report only
  counts; the engine is scored on them by totals only (`harness/score.ts` prints nothing
  else for them). They are the honest estimate for unseen code. When a held-out set has
  been used for a while it is retired into practice and a fresh one labelled.

Each project's dataset is every changed source file in up to its last 300 commits at the
recorded head (tests, vendored code and generated files left out; a few projects also had
bundled copies of other repositories or data folders removed). `manifest.json.gz` records
exactly which commits and files each dataset holds, so it rebuilds identically.

## How the labels were made

For each project, a candidate search (independent of the engine) proposed possible
extracts and inlines: a new (or removed) function whose body shares at least 30% of its
words with code its caller lost (or gained). A random sample of those, plus every claim the
engine made, went to independent labelling agents following `LABELLING.md`, who read the
actual commits and judged each one extract, inline, borderline or no.

## Running it

```sh
node harness/setup.ts                      # download projects, rebuild datasets (all sets; a few GB)
node harness/setup.ts --set held-ts        # or one set
node harness/setup.ts ghost peektrace      # or named projects
node harness/score.ts                      # score every set
node harness/score.ts --set held-effect    # one set
node harness/score.ts --engine <other-checkout>   # compare another version of the engine
SEMANTIC_NO_<RULE>=1 node harness/score.ts --set practice --label rule-off   # one rule off
python3 harness/analysis/judge.py rule-off rule-on    # did the rule help? (reads the ledger)
harness/unlabelled.sh <out-dir> [SEMANTIC_NO_<RULE>=1]   # practice claims with no label yet
```

Data goes to `harness/work/` (git-ignored); `--dir` puts it elsewhere.

## Projects

### Held out: final, fresh (7 projects, 2026-11-11)

Built with `heldout/` and scored once (`node harness/score.ts --set held-final`).

| Project | Repository | Files |
|---|---|---|
| astro | [withastro/astro](https://github.com/withastro/astro) | 659 |
| mockito | [mockito/mockito](https://github.com/mockito/mockito) | 157 |
| mudblazor | [MudBlazor/MudBlazor](https://github.com/MudBlazor/MudBlazor) | 276 |
| nushell | [nushell/nushell](https://github.com/nushell/nushell) | 1000 |
| pydantic | [pydantic/pydantic](https://github.com/pydantic/pydantic) | 493 |
| tanstack-router | [TanStack/router](https://github.com/TanStack/router) | 511 |
| traefik | [traefik/traefik](https://github.com/traefik/traefik) | 437 |

### Held out: TypeScript (6 projects)

| Project | Repository | Files |
|---|---|---|
| apollo-client | [apollographql/apollo-client](https://github.com/apollographql/apollo-client) | 437 |
| core | [vuejs/core](https://github.com/vuejs/core) | 267 |
| mermaid | [mermaid-js/mermaid](https://github.com/mermaid-js/mermaid) | 251 |
| query | [TanStack/query](https://github.com/TanStack/query) | 242 |
| tldraw | [tldraw/tldraw](https://github.com/tldraw/tldraw) | 932 |
| trpc | [trpc/trpc](https://github.com/trpc/trpc) | 669 |

### Held out: Effect (6 projects)

| Project | Repository | Files |
|---|---|---|
| aksara | [nakafaai/aksara](https://github.com/nakafaai/aksara) | 1699 |
| dotflowy | [cameronapak/dotflowy](https://github.com/cameronapak/dotflowy) | 873 |
| foldkit-alchemy-starter | [NolanGC/foldkit-alchemy-starter](https://github.com/NolanGC/foldkit-alchemy-starter) | 112 |
| foldkit-dials | [Manzanita-Research/foldkit-dials](https://github.com/Manzanita-Research/foldkit-dials) | 60 |
| ghost | [corasan/ghost](https://github.com/corasan/ghost) | 992 |
| peektrace | [Mark-Life/peektrace](https://github.com/Mark-Life/peektrace) | 570 |

### Held out: mixed languages (6 projects)

| Project | Repository | Files |
|---|---|---|
| alacritty | [alacritty/alacritty](https://github.com/alacritty/alacritty) | 528 |
| caddy | [caddyserver/caddy](https://github.com/caddyserver/caddy) | 415 |
| efcore | [dotnet/efcore](https://github.com/dotnet/efcore) | 315 |
| nest | [nestjs/nest](https://github.com/nestjs/nest) | 320 |
| netty | [netty/netty](https://github.com/netty/netty) | 332 |
| poetry | [python-poetry/poetry](https://github.com/python-poetry/poetry) | 346 |

### PHP (3 projects, 2026-11-14)

Built before any PHP engine code (`harness/lang/php/`, `harness/lang/build.ts php`); answers pinned in
`harness/lang/php/PREREGISTERED.sha256`. All MIT.

| Project | Set | Repository | Head | Files |
|---|---|---|---|---|
| laravel | practice-php | [laravel/framework](https://github.com/laravel/framework) | da870df31b | 467 |
| symfony | practice-php | [symfony/symfony](https://github.com/symfony/symfony) | 979969dc83 | 548 |
| composer | held-php | [composer/composer](https://github.com/composer/composer) | 5147ea1a01 | 501 |

Each holds the last 300 commits plus the spec's curated refactor commits. Extract/inline labels: every loose
candidate, judged blind by independent agents (`lang-php-extracts.json`, `locked-php-extracts.json`). Moves,
renames and formatting: `lang-php-expected.json` for the curated commits, and a pooled blind audit of every other
claim by any tool (`harness/lang/audit_export.py`, `audit_merge.py`, `judge.py`). Trap cases:
`test/fixtures/traps/php.json`.

### Ruby (9 projects, 2026-11-15)

Practice: the curated refactor commits of `harness/lang/ruby/` (`harness/lang/build.ts ruby`), answers pinned in
`harness/lang/ruby/PREREGISTERED.sha256` before any Ruby engine code. jekyll and brew were the first held-out set;
it was opened to find a false formatting claim (`harness/lang/ruby/NOTES.md`) and is practice since.
Held out: `harness/lang/ruby-held2/` (`harness/lang/build.ts ruby-held2`), the last 1,000 commits of five projects
used nowhere before, labelled blind and pinned (`PREREGISTERED.sha256`) before the engine ran on any of it.

| Project | Set | Repository | Licence | Head | Files |
|---|---|---|---|---|---|
| rails | practice-ruby | [rails/rails](https://github.com/rails/rails) | MIT | curated | 15 |
| rubocop | practice-ruby | [rubocop/rubocop](https://github.com/rubocop/rubocop) | MIT | curated | 13 |
| jekyll | practice-ruby | [jekyll/jekyll](https://github.com/jekyll/jekyll) | MIT | curated | 11 |
| brew | practice-ruby | [Homebrew/brew](https://github.com/Homebrew/brew) | BSD-2-Clause | curated | 5 |
| sinatra | held-ruby2 | [sinatra/sinatra](https://github.com/sinatra/sinatra) | MIT | cb22afd790 | 919 |
| devise | held-ruby2 | [heartcombo/devise](https://github.com/heartcombo/devise) | MIT | 05811fb836 | 663 |
| fastlane | held-ruby2 | [fastlane/fastlane](https://github.com/fastlane/fastlane) | MIT | ca02a524e3 | 1,492 |
| puma | held-ruby2 | [puma/puma](https://github.com/puma/puma) | BSD-3-Clause | 25836c62bc | 923 |
| hanami | held-ruby2 | [hanami/hanami](https://github.com/hanami/hanami) | MIT | 38445663c7 | 1,628 |

Extract/inline labels: the curated answers (`lang-ruby-extracts.json`); for held-ruby2, the engine-free loose search
(`heldout/loose.ts`, `todo.ts` with `NO_ENGINE=1`), judged blind (`locked-ruby2-extracts.json`), and the extracts the
engine made beyond it, judged blind after the run (`locked-ruby2-engine-extracts.json`). Moves, renames and
formatting: `lang-ruby-expected.json` on practice; on held-ruby2 a pooled blind audit of every sem-jiff claim and a
fixed-seed sample of the other tools' claims. Generated changes: the last 300 commits of rails and rubocop (not
committed; `bench/history.ts`). Trap cases: `test/fixtures/traps/ruby.json`.

### Kotlin (4 projects, 2026-11-15)

Built before any engine run on them (`harness/lang/kotlin/`, `harness/lang/build.ts kotlin`); answers pinned in
`harness/lang/kotlin/PREREGISTERED.sha256`. All Apache-2.0.

| Project | Set | Repository | Head | Files |
|---|---|---|---|---|
| okhttp | practice-kotlin | [square/okhttp](https://github.com/square/okhttp) | 5c34f67a3f | 248 |
| kotlinx-coroutines | practice-kotlin | [Kotlin/kotlinx.coroutines](https://github.com/Kotlin/kotlinx.coroutines) | ead082131c | 533 |
| ktor | held-kotlin | [ktorio/ktor](https://github.com/ktorio/ktor) | 07bb933995 | 1,064 |
| exposed | held-kotlin | [JetBrains/Exposed](https://github.com/JetBrains/Exposed) | 51b78c1fa4 | 455 |

Each holds the last 300 commits plus the spec's curated refactor commits. Extract/inline labels: every loose
candidate on practice and a fixed-seed sample of 70 on held, judged blind by independent Fable agents
(`lang-kotlin-extracts.json`, `locked-kotlin-extracts.json`). Moves, renames and formatting: `lang-kotlin-expected.json`
for the curated commits, and a pooled blind audit of every sem-jiff and difftastic claim and a fixed-seed sample of
sem v0.8.0's (`harness/lang/audit_export.py`, `audit_merge.py`, `judge.py`). Trap cases: `test/fixtures/traps/kotlin.json`.

### Swift (4 projects, 2026-11-15)

Built before any engine run on them (`harness/lang/swift/`, `harness/lang/build.ts swift`); answers pinned in
`harness/lang/swift/PREREGISTERED.sha256`. Grammar: tree-sitter-swift 0.7.3, the GitHub release wasm
(`vendor/tree-sitter-swift`).

| Project | Set | Repository | Head | Files |
|---|---|---|---|---|
| vapor | practice-swift | [vapor/vapor](https://github.com/vapor/vapor) (MIT) | e4a5b7050f | 1,412 |
| alamofire | practice-swift | [Alamofire/Alamofire](https://github.com/Alamofire/Alamofire) (MIT) | dea4bab917 | 526 |
| swift-nio | held-swift | [apple/swift-nio](https://github.com/apple/swift-nio) (Apache-2.0) | b440f7bae8 | 558 |
| swift-composable-architecture | held-swift | [pointfreeco/swift-composable-architecture](https://github.com/pointfreeco/swift-composable-architecture) (MIT) | bf66bd83f3 | 777 |

Each holds the last 300 commits plus the spec's curated refactor commits. Extract/inline labels: every loose
candidate (47 practice, 29 held), from the engine-free search run on 643015d (no Swift engine), judged blind by two
independent Fable agents each (a disagreement is borderline) (`lang-swift-extracts.json`, `locked-swift-extracts.json`).
Moves, renames and formatting: `lang-swift-expected.json` for the curated commits, and a pooled blind audit of every
held-out sem-jiff claim and fixed-seed samples of the rest (seed 20261115; see harness/compare/README.md). Trap cases:
`test/fixtures/traps/swift.json`.

### Practice (studied while tuning) (57 projects)

| Project | Repository | Files |
|---|---|---|
| alchemy | [alchemy-run/alchemy](https://github.com/alchemy-run/alchemy) | 6527 |
| alchemy-async | [alchemy-run/alchemy-async](https://github.com/alchemy-run/alchemy-async) | 523 |
| allthingsweb | [allthingsweb-dev/allthingsweb](https://github.com/allthingsweb-dev/allthingsweb) | 1166 |
| automapper | [AutoMapper/AutoMapper](https://github.com/AutoMapper/AutoMapper) | 621 |
| avalonia | [AvaloniaUI/Avalonia](https://github.com/AvaloniaUI/Avalonia) | 698 |
| beep-effect | [beep-effect/beep-effect](https://github.com/beep-effect/beep-effect) | 2101 |
| black | [psf/black](https://github.com/psf/black) | 298 |
| cli | [cli/cli](https://github.com/cli/cli) | 495 |
| discord-bot | [Effect-TS/discord-bot](https://github.com/Effect-TS/discord-bot) | 242 |
| django | [django/django](https://github.com/django/django) | 401 |
| drizzle-orm | [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm) | 1243 |
| effect | [Effect-TS/effect](https://github.com/Effect-TS/effect) | 636 |
| effect-aws | [floydspace/effect-aws](https://github.com/floydspace/effect-aws) | 2634 |
| effect-smol | [Effect-TS/effect-smol](https://github.com/Effect-TS/effect-smol) | 3953 |
| effected | [spencerbeggs/effected](https://github.com/spencerbeggs/effected) | 1670 |
| efffrida | [leonitousconforti/efffrida](https://github.com/leonitousconforti/efffrida) | 183 |
| excalidraw | [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw) | 1556 |
| foldkit | [foldkit/foldkit](https://github.com/foldkit/foldkit) | 2085 |
| foldkit-domains | [foldkit/foldkit-domains](https://github.com/foldkit/foldkit-domains) | 307 |
| foldkit-plus | [doeixd/foldkit-plus](https://github.com/doeixd/foldkit-plus) | 409 |
| ghui | [kitlangton/ghui](https://github.com/kitlangton/ghui) | 886 |
| guava | [google/guava](https://github.com/google/guava) | 2456 |
| helix | [helix-editor/helix](https://github.com/helix-editor/helix) | 210 |
| herdr-ts-sdk | [dmmulroy/herdr-ts-sdk](https://github.com/dmmulroy/herdr-ts-sdk) | 133 |
| hono | [honojs/hono](https://github.com/honojs/hono) | 327 |
| hugo | [gohugoio/hugo](https://github.com/gohugoio/hugo) | 594 |
| janitor | [Effect-TS/janitor](https://github.com/Effect-TS/janitor) | 1185 |
| jellyfin | [jellyfin/jellyfin](https://github.com/jellyfin/jellyfin) | 399 |
| jenkins | [jenkinsci/jenkins](https://github.com/jenkinsci/jenkins) | 173 |
| kafka | [apache/kafka](https://github.com/apache/kafka) | 539 |
| language-service | [Effect-TS/language-service](https://github.com/Effect-TS/language-service) | 700 |
| livestore | [livestorejs/livestore](https://github.com/livestorejs/livestore) | 691 |
| motel | [kitlangton/motel](https://github.com/kitlangton/motel) | 420 |
| opencode | [anomalyco/opencode](https://github.com/anomalyco/opencode) | 1630 |
| overseer | [dmmulroy/overseer](https://github.com/dmmulroy/overseer) | 923 |
| pi-claude-cli | [dmmulroy/pi-claude-cli](https://github.com/dmmulroy/pi-claude-cli) | 311 |
| playwright | [microsoft/playwright](https://github.com/microsoft/playwright) | 406 |
| polly | [App-vNext/Polly](https://github.com/App-vNext/Polly) | 63 |
| prisma | [prisma/prisma](https://github.com/prisma/prisma) | 4598 |
| prometheus | [prometheus/prometheus](https://github.com/prometheus/prometheus) | 362 |
| react-router | [remix-run/react-router](https://github.com/remix-run/react-router) | 437 |
| rich | [Textualize/rich](https://github.com/Textualize/rich) | 385 |
| ripgrep | [BurntSushi/ripgrep](https://github.com/BurntSushi/ripgrep) | 250 |
| scrapy | [scrapy/scrapy](https://github.com/scrapy/scrapy) | 683 |
| spring-boot | [spring-projects/spring-boot](https://github.com/spring-projects/spring-boot) | 205 |
| stack | [kitlangton/stack](https://github.com/kitlangton/stack) | 89 |
| storybook | [storybookjs/storybook](https://github.com/storybookjs/storybook) | 457 |
| strider | [usestrider/strider](https://github.com/usestrider/strider) | 229 |
| svelte | [sveltejs/svelte](https://github.com/sveltejs/svelte) | 460 |
| tokio | [tokio-rs/tokio](https://github.com/tokio-rs/tokio) | 534 |
| typescript | [microsoft/TypeScript](https://github.com/microsoft/TypeScript) | 1645 |
| uv | [astral-sh/uv](https://github.com/astral-sh/uv) | 454 |
| visual-effect | [kitlangton/visual-effect](https://github.com/kitlangton/visual-effect) | 59 |
| vite | [vitejs/vite](https://github.com/vitejs/vite) | 981 |
| vitest | [vitest-dev/vitest](https://github.com/vitest-dev/vitest) | 968 |
| watchdog | [kzndotsh/watchdog](https://github.com/kzndotsh/watchdog) | 2043 |
| zod | [colinhacks/zod](https://github.com/colinhacks/zod) | 763 |
