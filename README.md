# JobApply

Minimal job application assistant using Next.js App Router, TypeScript, Tailwind CSS,
Supabase email/password Auth and database, and configurable Gemini / OpenAI analysis.

## Development

Version two is developed on `develop`; `main` retains the stable first version.
Use feature branches and pull requests for upgrades. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the branch workflow and required checks. GitHub Actions runs TypeScript checks,
tests and a production build once the workflow is pushed to GitHub.

## Personal Board setup (existing and new Supabase projects)

For an existing installation, **do not rerun `supabase/schema.sql`**. In your
Supabase dashboard, open **SQL Editor → New query**, paste the complete contents
of **`supabase/migrations/20261013_personal_board.sql`**, and click **Run**.
Then run **`supabase/migrations/202610130001_board_card_delete.sql`** to enable owner-only
card deletion. If Board is already installed, only this second migration is needed.
Apply these files in the listed order when setting up a new database or rerunning
all migrations; the base Board migration resets its table grants.
This migration is additive and rerunnable. It adds `board_projects`, `board_cards`
and `board_solutions` with indexes, ownership policies and update timestamps.
It does not modify or remove your existing profiles, CVs or job applications.
On a brand-new database, run `supabase/schema.sql` first, then this migration.

After updating the project, run:

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`, sign in normally, and choose **Board** in the
navigation. No additional environment variables, service-role key, AI provider,
notification service or scheduled job is needed for Board operations.
Until the migration is applied, Board shows a setup error with a retry button;
the existing job-application pages continue to use their existing tables.

### Using the Board

Board remembers the current view, filters, expanded panels and scroll position
when you return from a card. Unsaved quick-capture text and optional fields survive
view changes and navigation. Drafts and workspace preferences use session storage,
separately for each signed-in account, in the current browser tab; they are not
saved to Supabase until you click Save card. Saving successfully or choosing
Clear draft clears the draft. Closing the tab ends this storage. If browser storage
is blocked, capture still works, but restoration across navigation may be unavailable.
Quick type buttons let you choose Note, Idea, Task, Reminder, Problem or Solution
without opening Optional details. Changing a view never reassigns an existing draft
to a new project or type; the capture form shows where it will be saved.

Application details has CV, Lettre de motivation and Progress shortcuts at the
top. Copy letter copies the saved letter without making another AI call; if the
browser denies clipboard access, the page explains how to copy the text manually.

- Enter a title or a short thought and press Enter or **Save card**. The default
  is an open note in General. Expand Optional details for type, category, project,
  date or longer notes. Capture within a project defaults to that project; capture
  in Problems defaults to a problem, and Upcoming defaults to a reminder.
- Use **All**, **General**, **Problems**, **Upcoming**, project buttons and
  **Archive**. Search title/body/category and combine type, category, project,
  status and due-date filters. Upcoming includes overdue and future dated open
  tasks/reminders, ordered by date. Undated reminders remain in All or General.
- Open a card to edit it, move it to a project or General, mark it done/resolved,
  or reopen it. Type remains fixed after creation to preserve problem relationships.
- Open a problem to add any number of solutions. For each solution, record
  what you tried, its result and whether it worked, partly worked, did not work,
  or has not been tried. Marking a solution as worked does not automatically
  resolve the problem. Archived solutions remain visible in the problem history.
- Manage projects to create, rename, archive or restore one. Archiving a project
  hides its navigation button; its cards remain accessible in All. Use View in
  project management to browse an archived project, or move its cards elsewhere.
- Archive preserves
  their current content, attempts, outcomes and timestamps. This MVP does not keep
  a separate revision for every text edit. Cards also have a **Delete** action on
  Board and card details, with a second **Delete permanently** confirmation.
  Deleting a problem permanently removes all its attached solutions and outcomes.
  Projects and individual solutions still use archive/restore. RLS restricts card
  deletion to the signed-in owner, and stale card edits block deletion until reloaded.

All Board database operations use the existing signed-in browser Supabase client
and RLS. Composite foreign keys ensure cards cannot reference another user's
project and solutions cannot reference another user's card or a non-problem card.
Saving also checks `updated_at` to reject stale edits from another tab.
Data is private to each account, with no new AI calls or background notifications.

### Verification

```powershell
npm run build
npm run typecheck
npm test
```

Board tests cover capture validation, date and combined filters, project/General
views, completion/reopening, and migration/RLS behavior. The development-only
PGlite dependency runs a local PostgreSQL engine with synthetic users to verify
the SQL; tests do not read or modify your live Supabase database.

## Local setup

### Explore offers setup

1. For an **existing Supabase project**, run the complete file
   **`supabase/migrations/202610140001_explore_offers.sql`** in Supabase → SQL Editor.
   Do not rerun the original `schema.sql` on an existing installation. For a new
   database, run `supabase/schema.sql` first, then this Explore migration. Board
   migrations are independent. This adds owner-scoped preferences and offer states,
   plus a nullable source link on applications. Existing CVs, applications and Board
   data are preserved; the migration can be rerun safely.
2. Register your own application at <https://developer.adzuna.com/signup>. Complete
   the registration for your actual personal project and review/accept the provider
   terms yourself. Get the application ID and key from your account. Confirm that
   your access permits the France (`fr`) job-search endpoint. If your account is not
   approved or receives 403, contact Adzuna for access; the app cannot grant it.
3. Add these **server-only** variables to `.env.local`:

   ```dotenv
   ADZUNA_APP_ID=your-application-id
   ADZUNA_APP_KEY=your-application-key
   ```

   Do not add a `NEXT_PUBLIC_` prefix. No service-role key is used. The existing
   Supabase URL and anon key are still required. Do not commit `.env.local`.
4. Run `npm install`, restart `npm run dev`, sign in, and open **Explore offers**.
   Search by keywords and/or a French city/postcode; use **Save preferences** to
   restore them on later visits. Saved preferences trigger one search on page open.
   Otherwise, searches run only when you press Search or change results pages.

**Why Adzuna:** France Travail was evaluated first. Its official data.gouv listing
currently reports restricted access and directs new users to a contact request:
<https://www.data.gouv.fr/dataservices/api-offres-demploi>. Adzuna provides a documented
France search API with keyword, location and contract filters. Implementation uses
the official [search guide](https://developer.adzuna.com/docs/search) and the
[OpenAPI specification](https://developer.adzuna.com/swagger/spec/test2.json), linked
from its interactive documentation. It returns **description excerpts**, not complete
adverts. The app makes this clear on results and on the prepared application form.

**Using it:** Save adds an offer to **Saved offers**, without an AI call. Select
**Prepare application** to open the existing Add job offer form with title, company,
source link and excerpt already filled in. You can edit these before explicitly
clicking **Analyze Offer** for the French CV and lettre de motivation. Existing
applications for the same saved offer are reused, with a unique database index
preventing duplicate application rows. Saved offers do not appear on Dashboard
until an analysis has produced an application; find the shortlist in Explore.

Dismiss hides an offer on future searches by provider ID, independently of your
current preferences. **Show dismissed** or the **Dismissed** tab lets you see and
restore it. Saved and dismissed items are personal snapshots, not an assertion
that a vacancy remains open. Follow **Original listing** through Adzuna to verify
availability and read the full advert. There is no scraping or automated application.

Results are requested newest-first within 30 days of publication, in pages of 20.
Location uses the provider's 20 km radius. Remote filtering checks explicit wording
in the returned page only; unknown arrangements are excluded for a specific remote
preference. It does not verify eligibility for remote work. A filtered page may be
empty while later pages still contain matches. Alternance and Stage append keywords;
the remaining contract choices use the provider's documented contract/time flags.
There is no AI ranking, background refresh, scheduler or automatic application.

**Provider rules:** Review the current [API terms](https://developer.adzuna.com/docs/terms_of_service)
and linked general terms for your account. Each displayed offer includes the required
linked Adzuna attribution (at least 116 × 23 pixels) and retains its returned listing
link. API fetches and responses use `no-store`; no shared results cache or bulk feed
archive is created. Only explicitly saved/dismissed offers are retained per account.
Default published quotas are 25 requests/minute, 250/day, 1,000/week and 2,500/month;
your account's actual entitlement controls access. Provider 429 errors stop the
request, with no automatic retry. Personal use and wider/public/commercial reuse have
different terms; obtain any required licence before expanding usage. If access is
terminated, remove the provider's stored listing data/excerpts and attribution from
your database and displayed pages as required by the agreement, including excerpts
copied into `applications.job_offer_text`. Do not scrape the source to obtain missing
description text or bypass the provider's redirect links.

**Verification:** `npm test` includes mocked provider/authentication tests and real
local PostgreSQL migration/RLS tests using PGlite. They cover duplicate saves,
cross-user links, dismissal restoration and reuse of an existing application without
an AI call. Real France searches require an approved Adzuna ID/key and the SQL
migration above. No live provider or AI credentials are used by these tests.

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

## Study: self-testing quizzes

This feature lives on `feature/study-quizzes`. It adds Study to desktop and mobile
navigation. No course hosting or automatic generation is included.

### Setup for an existing installation

1. Open your existing Supabase project → SQL Editor → New query.
2. Paste and run **`supabase/migrations/202610140002_study_quizzes.sql`** in full.
   This additive, rerunnable migration creates `study_subjects`, `study_materials`,
   `study_quizzes`, `study_attempts`, `study_generation_limits`, their indexes,
   ownership policies and scoring functions. It does not modify existing job,
   profile, Explore or Board tables. Do not rerun the base schema to add Study.
   A new installation should first follow the original database setup above.
3. Keep the existing Supabase URL and anon key in `.env.local`. Study uses the
   signed-in user's JWT and never a service-role key.
4. Set `GEMINI_API_KEY` server-side in `.env.local`. Study uses the same
   `GEMINI_MODEL` as application analysis (default `gemini-3.5-flash-lite`).
   No new provider or client-side secret is required. `AI_PROVIDER` does not switch
   Study to OpenAI: this section specifically uses Gemini.
5. Run `npm ci` if needed, then `npm run dev`. Restart after environment changes.
   Open `http://localhost:3000/study` and sign in with your existing account.

### Using Study

- Add a subject, select it, then save a topic and 50–20,000 characters of notes,
  excerpts or a summary. Material is saved independently of AI calls and retained
  when generation fails. These saved records are immutable in this first version;
  save a new material entry when you have revised notes.
- Open saved material and choose 5 (default) or 10 questions. Click Generate quiz
  explicitly. It makes one Gemini `generateContent` request, never automatic
  background requests or retries. Generated questions and explanations are French.
  The notes are sent to Gemini only for this explicit action.
- Answer all questions, choosing “I'm not sure” when appropriate. Correct answers,
  evidence excerpts and explanations are withheld until whole-quiz submission.
  Supabase grades and saves the attempt atomically. A repeated submission with the
  same attempt ID returns that existing score rather than duplicating history.
- Retry this quiz loads the same saved questions, with no Gemini request. Previous
  scores (latest 50) remain available on its quiz page. Changing answers requires a
  new attempt; saved attempts cannot be edited.
- Review again uses the latest submitted attempt for **each quiz**, showing wrong
  and unsure answers. Check an answer locally for practice; this does not change a
  score. Retry the full quiz to clear recovered questions from the review list.

### Limits, privacy and validation

Google's [current rate-limit documentation](https://ai.google.dev/gemini-api/docs/rate-limits)
states that RPM, TPM and daily limits depend on the model and project tier, and
apply per project, not per API key. Check **your active limits** in
[Google AI Studio](https://aistudio.google.com/usage?timeRange=last-28-days&tab=rate-limit)
before generating. Study and application analysis share that project's allowance.
The public documentation does not reveal this installation's private quota.

Study adds a database-backed 30-second generation cooldown per user (including
failed generation attempts). This is a guard against repeated clicks, not an
estimate of Google's allowance or a global spending cap. Both quiz sizes take one
request, but 10 questions use more output tokens. Material is bounded to 20,000
characters and output to 10,000 tokens. There is no auto-regeneration on failure.
Provider 429, unavailable models, missing keys, invalid/truncated output and
insufficient material produce actionable errors without showing upstream secrets.

Structured output is validated for question count, four distinct options, answer
index, duplicate questions and supporting excerpts found in the saved material.
These checks do not guarantee factual correctness or perfect question quality;
review the shown evidence against your notes.

Answer keys are stored in `study_quizzes.questions` with no direct authenticated
column read permission. `study_quiz_questions` returns prompts/options only.
Authenticated users can read their own metadata and completed attempts; narrowly
scoped database functions check `auth.uid()` before creating quizzes, scoring or
returning review data. Composite foreign keys prevent cross-user relationships.
Anonymous access is denied. No normal operation uses `SUPABASE_SERVICE_ROLE_KEY`.

### Study verification

Run `npm test`, `npm run typecheck`, and `npm run build`. Study tests cover real
PostgreSQL migration reruns, preservation of existing data, RLS, hidden answer
keys, server scoring, unsure answers, immutable/idempotent attempts, successful
retries clearing review items, generation cooldowns, malformed AI output and
mocked authenticated Gemini generation. Tests do not spend Gemini credits.

Implementation verification: all 63 tests, TypeScript checks and the production
build passed. The local production server reached Ready, but the browser connection
to `/study` timed out in this environment. No live Supabase migration, authenticated
browser walkthrough or real Gemini generation was performed in this session.

For a live smoke test after setup: create a subject → save notes → generate five
questions → submit with one wrong and one unsure answer → inspect score and
explanations → open Review again → retry the saved quiz → confirm the previous
score remains and that retrying sends no `/api/study/generate` request. Test a
second account to confirm it cannot see your data.

## Official references

- https://nextjs.org/docs/app/getting-started/installation
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://developers.openai.com/api/docs/guides/structured-outputs
