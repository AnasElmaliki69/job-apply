# JobApply

Minimal job application assistant using Next.js App Router, TypeScript, Tailwind CSS,
Supabase email/password Auth and database, and configurable Gemini / OpenAI analysis.

## Local setup

### Gemini setup (selected in this local checkout)

Edit .env.local and replace the GEMINI_API_KEY placeholder with your Google AI
Studio key. Keep it server-only; never use a NEXT_PUBLIC prefix or commit the key.

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-3.5-flash-lite
```

Restart npm run dev after editing. No OpenAI key or OpenAI credit is required when
AI_PROVIDER=gemini. Supabase credentials and your saved master CV are still needed.
The configured Gemini model must be available in your Google project. Gemini also
has quotas; free-tier availability and billing/data terms depend on the model and
region. Check https://ai.google.dev/gemini-api/docs/pricing and
https://ai.google.dev/gemini-api/terms for your use case.
To return to OpenAI, set AI_PROVIDER=openai and configure OPENAI_API_KEY.
Generation uses the same French instructions, validation, and PDF export for both
providers. There is no automatic fallback that transmits your CV to another provider.

1. Install Node.js 20.9+ (a supported LTS version is recommended), which includes npm.
2. Open a terminal in this project folder and run `npm install`.
3. This checkout already has `.env.local` with your private master CV owner setting.
   Edit it in place to add your Supabase and AI provider keys; preserve MASTER_CV_OWNER_EMAIL.
   On a fresh checkout without that file, copy `.env.example`:
   ```powershell
   Copy-Item .env.example .env.local
   ```
4. Add your credentials:
   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
   AI_PROVIDER=gemini
   GEMINI_API_KEY=your-gemini-api-key
   ```
   Optional: `OPENAI_MODEL` defaults to `gpt-4.1-mini`. Use a model that supports
   Responses API structured outputs. OpenAI requires API billing/quota; Gemini limits depend on your project.
5. Create a Supabase project. Run `supabase/schema.sql` once in its SQL Editor
   on a fresh database. This creates tables, indexes, timestamps, and RLS policies.
6. Enable email/password under Supabase Authentication providers. Set the Auth
   Site URL to `http://localhost:3000` and allow `http://localhost:3000/login`
   as a redirect URL. Configure SMTP if needed for signup confirmation delivery.
7. Run `npm run dev` and open http://localhost:3000.

No `SUPABASE_SERVICE_ROLE_KEY` is needed. Both browser and server database calls
use the public anon key plus the user's JWT, so row-level security is enforced.
Never put an OpenAI or service-role key in a NEXT_PUBLIC variable.
Restart the dev server after changing environment variables.

## Usage

### French CV tailoring

New analyses generate a complete French CV, French change explanations, a French
lettre de motivation, analysis and interview questions. The interface remains English.
Each application stores the exact master CV snapshot used for its analysis inside
ai_analysis, alongside rewritten sections and suggested skills. The master profile
is not modified by generation. The detail page compares original text with rewritten
French paragraphs, highlighting changes. Click Download CV (PDF) to get a clean A4
PDF with the master CV's navy typography, centered identity header and blue rules.
The export follows the supplied Word CV's hierarchy: bold entry titles and category
labels, right-aligned dates when space allows, italic experience descriptions,
indented blue bullets, and two-column certifications/languages. New analyses keep
titles, dates and achievements on separate lines. Existing analyses receive the
same formatting when their saved text has recognizable line breaks and dates.
The content is rewritten and reflowed; this is a reconstructed PDF template, not
a direct edit or exact reproduction of the Word file. The original is never overwritten.
Longer CVs paginate rather than losing text. The PDF excludes comparison notes,
unconfirmed skills, and learning suggestions. Export uses the application's saved
analysis and requires authentication and ownership; it makes no extra AI call.
Original excerpts are matched against the saved master text while tolerating PDF
line wrapping and typographic variants. Unmatched excerpts are not displayed as
authentic quotes; use the full master snapshot for comparison in that case.

Suggested skills are excluded from the CV until you confirm you have them and save.
Other suggestions remain under “Compétences à développer”. These are not exported.
Existing applications remain readable; analyze a new offer to get the new features.
No SQL migration is needed: the new fields live in the existing AI analysis JSON.

Your provided PDF has been extracted locally into git-ignored private/master-cv.txt.
Sign up with the email address on your CV, confirm your email, then use “Use my
provided CV” on the Profile page. This saves it as your master CV in Supabase.
The import checks the server-only MASTER_CV_OWNER_EMAIL in .env.local against your
verified account email. It never overwrites an existing profile and is unavailable
to other users. Neither the source CV nor this owner setting is included in Git.
The text extraction preserves your CV content, but not the original PDF layout.

Create an account, confirm your email if enabled, and sign in. Paste your CV on
Profile / CV and save it. Add a job title, company, and offer text; click Analyze
Offer. The application is saved with status `saved` and opens its detail page.
Change status or notes and click Save changes. All saved applications appear on
the dashboard with title, company, status, match score, and creation date.

## Structure

- `src/app/login`: signup and login
- `src/app/(workspace)`: dashboard, profile, add offer, application detail
- `src/app/api/analyze/route.ts`: verified user, saved CV, AI call, database save
- `src/components`: session, layout helpers, application detail
- `src/lib`: validation, Supabase browser client, OpenAI structured outputs
- `supabase/schema.sql`: schema and owner-only policies
- `tests/analysis.test.ts`: input and AI response validation

## Verification

```sh
npm run test
npm run typecheck
npm run build
```

Manual integration checks after configuring real credentials:

- Sign up, confirm email, sign in, save CV, analyze an offer.
- Reload detail and dashboard; status and notes should persist.
- Analyze without a saved CV; expect an actionable validation error.
- Call /api/analyze without an Authorization header; expect HTTP 401.
- Create two users. Verify neither can read/update the other's records through
  the app or direct Supabase calls, including requests with another user's ID.
- Anonymous database calls cannot read either table.
- Test invalid/expired credentials and OpenAI/database failure states.
- Check mobile and desktop layouts.

Verification in the creation session: all 7 tests, TypeScript checks, and the
production webpack build passed. The dev server reached Ready, but the Windows
sandbox blocked loopback connections for the HTTP/browser smoke check. Live
Supabase/OpenAI integration and visual checks require your credentials and a
normal local browser session.

Auth sessions are managed in the browser; the Supabase SDK persists and refreshes
tokens. Client route guards support navigation. RLS provides data isolation and
the API independently verifies the JWT with Supabase getUser(). Profiles are
created when the CV is saved, so no signup database trigger is required.

Analysis returns matchScore, summary, missingSkills, keywordsToAdd,
improvedCvBullets, coverLetter, interviewQuestions, and applicationId.
The CV is fetched server-side from the verified user's profile. Inputs and AI
outputs are validated, request size is bounded, and AI calls have a timeout.

The CV and offer are sent to your selected AI provider only when analyzing. OpenAI uses
store=false. The app does not log their content or render generated HTML.
Scores are estimates; review generated text before sending an application.

This MVP excludes PDF uploads and application submission automation. Add durable
per-user rate limits before exposing a public paid AI endpoint. A database failure
after successful AI generation may require another paid call when retried.

Dependencies have been installed and package-lock.json is included. Use `npm ci`
for reproducible installs. The dev/build scripts explicitly use Next.js's supported
webpack bundler for compatibility with this Windows environment.

## Official references

- https://nextjs.org/docs/app/getting-started/installation
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://developers.openai.com/api/docs/guides/structured-outputs
