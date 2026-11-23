# LineUp

## Testing
Test the whole time, not just at the end.
- After each piece of work: write or update its automated tests and run them, run `npm run lint` and `npx tsc --noEmit`, and click through the change in `npm run dev` on desktop and on a 390px-wide phone screen.
- Never move on while a test is failing or a page is broken.
- After each step, give a one-line update on what was tested and whether it passed. End every task with a table of each check and pass or fail.
- Use fake "TEST" data on local or test databases only, never production, and never send real SMS, email or push to real people while testing.
- LineUp has one Supabase project and it is live (local dev and Vercel previews use it too). Until a separate test database exists, ask before writing any test data to it, label it TEST, and delete it afterwards.
- Never say a feature works without having tested it. If something can't be tested, say what and why.
- Commands: `npm test` (Vitest), `npm run dev`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. `npm run lint` already fails on 51 older errors; add no new ones.
- Automated tests live in `tests/` and run with Vitest (`vitest.config.ts`). Put new logic in pure functions there can test; `npx tsx test-fixtures/calendar-import/check.ts` prints the calendar import's sample results to check by eye.
