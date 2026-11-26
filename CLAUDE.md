# LineUp

## Testing
Test the whole time, not just at the end.
- After each piece of work: write or update its automated tests and run them, run `npm run lint` and `npx tsc --noEmit`, and click through the change in `npm run dev` on desktop and on a 390px-wide phone screen.
- Never move on while a test is failing or a page is broken.
- After each step, give a one-line update on what was tested and whether it passed. End every task with a table of each check and pass or fail.
- Use fake "TEST" data on local or test databases only, never production, and never send real SMS, email or push to real people while testing.
- LineUp's live Supabase project is `rbsgsymjmptwczecgohb` (plain `npm run dev` and, until changed, Vercel previews use it). Test against the separate test project "LineUp Test" (`zfxeymtuwrjtccxqymrj`, a copy of the live schema with no real data; settings in git-ignored `.env.testdb.local`): `npm run dev:testdb`, `npm run testdb:seed` / `testdb:cleanup`, `npm run test:smoke`, `npm run test:crons`. Never write test data to the live project without asking first. New migrations go to both projects.
- Never say a feature works without having tested it. If something can't be tested, say what and why.
- Commands: `npm test` (Vitest), `npm run dev`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. `npm run lint` already fails on 51 older errors; add no new ones.
- Automated tests live in `tests/` and run with Vitest (`vitest.config.ts`). Put new logic in pure functions there can test; `npx tsx test-fixtures/calendar-import/check.ts` prints the calendar import's sample results to check by eye.
