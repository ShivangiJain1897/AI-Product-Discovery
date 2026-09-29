<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- Clarity project notes -->
# Clarity — working notes

- Write path: every mutation goes through `src/lib/commands.ts` (`execute(action, args)`, exposed at `/api/command`). Read path: `src/lib/queries.ts`. Both enforce `product_id` boundaries; never query a discovery record without it.
- Relationships live in the `links` table; create them only with `links.link()` (validates same-product ends).
- Client components cannot receive functions from server components (use string templates such as `gotoTemplate="…{id}"`).
- Modal `onClose` fires only for user-initiated closes; programmatic closes must not navigate.
- Tests: `npm test` (vitest, temp SQLite per file), `npm run test:e2e` (Playwright, builds and serves on :3200). Use `CLARITY_DB_PATH` to point at a throwaway DB; never `rm` with an unset variable.
