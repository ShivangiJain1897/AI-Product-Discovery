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
npm test            # 38 unit/integration tests (calculations, boundaries, proposals, staleness, maps, briefs)
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

## What’s in the box

- **My Products** portfolio (add, search, archive/restore, resume) with a “What are you trying to understand?” start box.
- **Product workspace**: Overview · Discovery · Analyses · Knowledge · Experiments (+ activity history, product-scoped search, recently deleted).
- **Discovery initiative**: Overview (frame, editable plan, readiness *signals* — no completion %) · Evidence · Explore (opportunities, tree, prioritisation, optional process lens) · Validate · Decide · Brief.
- **Evidence**: paste, `.txt`, `.md`, `.csv`; reader with highlights, observations, finding links, source versioning; CSV row references.
- **Analyses** with runs, history, comparison, duplicate, saved revisions: research synthesis, problem analysis, process mapping, event-log analysis, opportunity analysis, solution comparison, assumption analysis, future-state comparison, experiment analysis, custom.
- **Process maps** (React Flow + synchronized table): steps, decisions, labelled branches, loops, owners; evidence/inferred provenance; future-state clones with a frozen baseline; stable step IDs; change rationale; optional formula-based benefit *scenarios* (always labelled estimates).
- **Event-log analysis**: column mapping → validation review → deterministic metrics (variants, percentiles, repeats, handoffs, gaps) with plain-language definitions and honest caveats.
- **Decisions & brief**: decision trace back to exact source/analysis versions; living brief with editable narrative (never overwritten; “needs refresh” flags), Markdown export, print view, JSON workspace export.

## Architecture

```
src/lib/schema.ts        relational schema (SQLite)          src/lib/eventlog.ts   pure event-log engine
src/lib/db.ts            node:sqlite wrapper, tx helper      src/lib/strength.ts   evidence strength (computed)
src/lib/links.ts         relationships + product boundary    src/lib/priority.ts   scoring, unknown-safe
src/lib/entities.ts      generic CRUD, soft delete, impact   src/lib/brief.ts      brief + refresh hashing
src/lib/evidence.ts      sources, versions, excerpts, stale  src/lib/analyses.ts   runs, freshness, compare
src/lib/process.ts       maps, clone, diff, layout           src/lib/ai/*          adapter: demo | live, schemas, validate, accept
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
