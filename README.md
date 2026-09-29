# Clarity

An AI-enabled discovery workspace for product managers. Clarity keeps **evidence, reasoning and decisions together** so you can answer four questions: *what is happening, which problems are worth solving, what could improve things, and what evidence do we need before deciding.*

The permanent unit is a **product**. Inside it live discovery initiatives, standalone analyses, evidence, findings, opportunities, experiments and decisions — all reading and writing the same records.

## Run it

Requires **Node 22.13+** (uses the built-in `node:sqlite`; no native modules to compile).

```bash
npm install
cp .env.example .env.local     # optional — see "AI modes"
npm run dev                    # http://localhost:3000
```

The first screen offers **Load the two demo examples** (or run `npm run seed`). `npm run reset` deletes the local database (`data/clarity.db`).

Production: `npm run build && npm start`.

### Tests

```bash
npm test            # 50 unit/integration tests (calculations, boundaries, proposals, staleness, maps, briefs, workbenches)
npm run test:e2e    # Playwright journeys; builds the app and runs it on :3200 with a throwaway database
npm run typecheck
```

E2E uses the Chromium at `/opt/pw-browsers`; set `CLARITY_CHROMIUM` to point elsewhere.

## AI modes

| | Without `ANTHROPIC_API_KEY` | With it |
|---|---|---|
| Manual workflows, deterministic analysis, exports | ✅ fully working | ✅ |
| AI proposals | **Demo mode** — keyword/template samples, badged “Demo sample — not a model response” | **Live model** via the Anthropic Messages API (server-side only; model from `CLARITY_AI_MODEL`) |

Either way, a proposal is a **preview**. Every quote and record ID in it is re-verified against your data before you can accept anything; unverifiable items are rejected and listed. Accepting is idempotent (double-click safe). Source documents are treated as untrusted data. Evidence strength is **computed from your excerpts** (independent voices, not quote counts) — never taken from the model. Event-log numbers come only from deterministic code.

## How it works (the flow)

1. **Add a product** (a name is enough). Each product is its own workspace; nothing mixes between products.
2. **Add a topic** — an **idea, problem, requirement or question**, in a sentence (or paste a brief).
3. **Choose what to do** from the catalog — as many as you like:
   - *Understand:* user research plan · questionnaire / interview guide · synthesize research · market analysis · competitor scan
   - *Diagnose:* root-cause analysis · process mining (event-log CSV) · process map · frame the problem
   - *Design:* user journey map · solution design · requirements & user stories · **PRD**
   - *Prioritise & validate:* prioritise opportunities · assumption map · test plan

   Each option shows what it produces and whether it is **Ready / Better later / Needs input**. Nothing is ever blocked.
4. **Work happens in workbenches** with one shape: *what it will use → a few questions (only what isn’t already known; “I don’t know” is fine) → generate a draft → edit → export.*
5. **Come back any time.** The topic page lists your work with its state, and a **What now?** strip suggests specific next steps (refresh something whose inputs changed; “add a journey map after your research synthesis”; “generate a PRD from what you have”).

Everything stays connected: evidence, findings, opportunities, concepts, assumptions and decisions are shared records that every workbench can read and cite (`[[finding:…]]` links inside documents resolve back to the source).

## Honesty rules the workbenches follow

- **Nothing is invented.** In demo mode a draft only restructures your words and records; market and competitor tables are left empty for facts you can cite. Live mode may not cite unknown record IDs and its quotes are verified against your sources.
- **Your edits are never overwritten.** Regenerating refreshes only sections you haven’t touched; for the rest it offers “Use the new draft / Keep mine”. Every run is kept.
- **Answers you type are not evidence** and are labelled as your description.
- **Numbers are deterministic** (event-log metrics, prioritisation); AI never calculates them.
- **Drafts say what they are:** *Starter draft from your records* (demo), *AI draft — review it* (live), or *Edited by you*.

## What’s in the box

- **My Products** portfolio and **Topics**, **Outputs** (all work across topics, filterable), **Knowledge**, **Experiments**, activity history, product-scoped search, recently deleted.
- **Evidence:** paste, `.txt`, `.md`, `.csv`; reader with highlights, observations, finding links, versioning; CSV row references.
- **Deeper views inside a topic:** Evidence · Explore (opportunities, tree, prioritisation, process lens) · Validate · Decide · Brief.
- **Process maps** (React Flow + synchronized table), future-state clones with a frozen baseline, comparison, benefit scenarios (always labelled estimates).
- **Event-log analysis:** column mapping → validation review → deterministic metrics with plain-language definitions.
- **Decisions & brief:** decision trace to exact source/analysis versions; living brief; Markdown, JSON and print exports.

## Architecture

```
src/lib/schema.ts        relational schema (SQLite)          src/lib/eventlog.ts   pure event-log engine
src/lib/db.ts            node:sqlite wrapper, tx helper      src/lib/strength.ts   evidence strength (computed)
src/lib/links.ts         relationships + product boundary    src/lib/priority.ts   scoring, unknown-safe
src/lib/entities.ts      generic CRUD, soft delete, impact   src/lib/brief.ts      brief + refresh hashing
src/lib/evidence.ts      sources, versions, excerpts, stale  src/lib/analyses.ts   runs, freshness, compare
src/lib/process.ts       maps, clone, diff, layout           src/lib/ai/*          adapter: demo | live, schemas, validate, accept
src/lib/catalog.ts    the catalog + readiness + “what next” rules
src/lib/templates.ts  workbench templates, adaptive questions, scaffold generators
src/lib/docs.ts       generate / apply / save for document workbenches
src/lib/commands.ts      the single write path (/api/command)  src/lib/queries.ts    read side (always product-scoped)
```

Design choices worth knowing:

- **Product boundaries are enforced in the data layer.** `links.link()` and every command verify that both ends belong to the same product; queries always filter by `product_id`. There are tests for this.
- **One `links` table** holds all relationships (many-to-many): excerpt→finding, finding→opportunity, opportunity→concept, concept→assumption, assumption→experiment, anything→decision, analysis run→decision, etc. Deleting is soft; relationships are kept so restore is lossless, and read paths hide far ends that are deleted.
- **Staleness is explicit.** Changing a source creates a new version, re-locates excerpts (`ok`/`moved`/`broken`, original text preserved), flags dependent findings and decisions, and marks analyses that ran on older versions as possibly outdated. Nothing is rewritten silently.
- **Analyses vs runs.** An analysis is editable; each run snapshots its inputs (sources + versions, config) and results. Reruns append.

## Deviations from the suggested stack

- **`node:sqlite` with a thin repository layer instead of an ORM** — zero native builds, works in restricted sandboxes. The schema is plain SQL in `src/lib/schema.ts`.
- **Anthropic API via `fetch`**, not the SDK — one small adapter, easy to mock in tests.
- Next.js 16 / React 19 / Tailwind 4 / React Flow (`@xyflow/react`) / Zod / PapaParse as suggested.

## Known limitations / not built

See the end-of-build report in the repository’s final commit message and `AGENTS.md`. In short: single-user only (no auth), journey analysis and a standalone “current-state analysis” type are not exposed (process mapping covers current state), hypotheses are edited inside experiments rather than as separate objects, live AI mode is implemented and tested with a mocked transport but has not been run against the real API in this environment.
