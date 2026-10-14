# JobApply

A personal workspace for job applications, everyday organization and self-testing.
Built with Next.js App Router, TypeScript, Tailwind CSS, Supabase and Gemini.
The interface and newly generated study quizzes are in English. Generated CVs and cover letters are in French.

This guide sets up the **`feature/study-quizzes` branch** on your own computer.
It includes applications, Board, Explore offers and Study. These features may not
all be available on `main` yet.

## What you need

| Requirement | Purpose |
| --- | --- |
| [Node.js 24](https://nodejs.org/en/download) with npm | Runs the app; matches the repository's CI configuration |
| [Git](https://git-scm.com/downloads) | Downloads the repository and its updates |
| A terminal and a text editor | PowerShell on Windows, Terminal on macOS/Linux; VS Code is optional |
| A [Supabase account](https://supabase.com/dashboard) and your own project | Database and email/password authentication |
| A [Google AI Studio account and Gemini API key](https://aistudio.google.com/apikey) | Generates adapted CVs, cover letters and study quizzes |
| An [Adzuna developer account](https://developer.adzuna.com/signup), optional | Enables Explore offers |
| An internet connection | Connects the local app to Supabase and the selected providers |

You do **not** need Docker, a local PostgreSQL installation, Python, a global Next.js
installation or a Supabase service-role key for this setup. Supabase runs the database
online; the web app runs on your computer.

## 1. Install Node.js and Git

Install Node.js 24 and Git using the links above, then open a **new terminal**.
Check that all three commands work:

```sh
node --version
npm --version
git --version
```

`node --version` should start with `v24.`. If a command is not recognized, restart
the terminal after installation and check that the installer added it to PATH.

## 2. Download the project

Choose a folder where you keep projects, open a terminal there, then run:

```sh
git clone --branch feature/study-quizzes https://github.com/AnasElmaliki69/job-apply.git
cd job-apply
git branch --show-current
```

The last command should print `feature/study-quizzes`. If the repository is private,
you need access and must authenticate with GitHub when Git requests it.

If you already have a clone, use it instead of cloning again. Check `git status`
and preserve any local changes before switching branches:

```sh
git fetch origin
git switch feature/study-quizzes
git pull --ff-only origin feature/study-quizzes
```

If the branch only exists on the remote, use
`git switch --track origin/feature/study-quizzes` instead of `git switch` above.

Run every following terminal command from the **repository root**, the folder
containing `package.json`, `.env.example` and `supabase/`.

## 3. Install the dependencies

```sh
npm ci
```

This installs the exact dependencies in `package-lock.json`. Wait for the command
to finish before continuing. You do not need to install Next.js separately.

## 4. Create your Supabase project

1. Sign in to [Supabase](https://supabase.com/dashboard).
2. Create a new project in your organization. Choose its name, database password
   and region, then wait for provisioning to finish.
3. Open the project's **Connect** dialog to find its **Project URL** and public
   **publishable key**. You can also find keys under **Settings → API Keys**.
4. Keep these values for step 7. A legacy public `anon` key is also supported.

Use the public publishable/anon key, **not** a secret key, database password or
`service_role` key. The variable in this project is named
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, including when you supply a publishable key.
See [Supabase's key documentation](https://supabase.com/docs/guides/getting-started/api-keys).

## 5. Create the database tables

### New, empty Supabase database

Download or open **[setup-database.txt](supabase/setup-database.txt)**. On GitHub,
open the file and use **Raw** or the download button to get its plain text.
It contains the complete database setup for this branch in the correct order.

1. Open **SQL Editor → New query** in your Supabase project.
2. Copy the **entire contents** of `setup-database.txt` into that query.
3. Click **Run** and wait for success.

Use this text file **only on a new, empty database**, and do not also run the source
files individually afterward. The SQL is in the downloadable file, not this README.

For reference, it bundles these source files:

If applying source files separately instead, use this exact order; do not rely on
alphabetical filename order.

| Order | File | What it installs |
| --- | --- | --- |
| 1 | [supabase/schema.sql](supabase/schema.sql) | Profiles, master CV text and job applications |
| 2 | [20261013_personal_board.sql](supabase/migrations/20261013_personal_board.sql) | Board projects, cards, problems and solutions |
| 3 | [202610130001_board_card_delete.sql](supabase/migrations/202610130001_board_card_delete.sql) | Owner-only permanent card deletion |
| 4 | [202610140001_explore_offers.sql](supabase/migrations/202610140001_explore_offers.sql) | Search preferences and saved/dismissed offers |
| 5 | [202610140002_study_quizzes.sql](supabase/migrations/202610140002_study_quizzes.sql) | Subjects, material, quizzes, attempts and scoring functions |

These scripts create indexes, table permissions and row-level security (RLS).
Do not disable RLS to fix a setup error. It keeps each account's data private.
The app does **not** apply SQL automatically when you run `npm run dev`.

### Existing Supabase database

Do **not** rerun `supabase/schema.sql`: it is the initial schema, not an upgrade
script. Do **not** run `setup-database.txt` on an existing installation either.
Keep your existing project and data, and run only the migrations you have
not applied, in the order above. Keep a backup before database maintenance.

The feature migrations are rerunnable. If you rerun the base Board migration,
rerun the card-delete migration immediately afterward because the base Board
migration resets its table grants. If SQL reports a missing referenced table,
check the preceding steps rather than deleting existing tables.

## 6. Configure email/password authentication

In your Supabase dashboard:

1. Open **Authentication → Sign In / Providers** and enable the **Email** provider
   with email/password sign-in. Dashboard wording may vary.
2. Open **Authentication → URL Configuration**.
3. Set **Site URL** to `http://localhost:3000`.
4. Add `http://localhost:3000/login` to the allowed **Redirect URLs** and save.
5. Leave email confirmation enabled if you want verified accounts. When creating
   an account in step 9, open its confirmation email before signing in.

For a private local test, you may choose to disable email confirmation in your
Supabase email settings. For wider use, configure reliable email delivery and
review Supabase's [SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).
If you use another port later, update both local URLs to match it.

Reference: [Supabase redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## 7. Create your local environment file

In the repository root, copy the example file **once**.

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env.local
```

**macOS / Linux:**

```sh
cp .env.example .env.local
```

If `.env.local` already exists, edit it in place instead of overwriting your keys.
Open it in your editor and replace the placeholders. Keep the filename exactly
`.env.local`, not `.env.local.txt`.

Minimum configuration for applications, Board and Study:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-publishable-or-anon-key
AI_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.5-flash-lite
```

### Get your Gemini key

1. Open [Google AI Studio → API keys](https://aistudio.google.com/apikey).
2. Select or create your Google project and create an API key.
3. Paste the actual key into `GEMINI_API_KEY` in `.env.local`.
4. Check that your project has access to the configured `GEMINI_MODEL`. The value
   above is this app's default; set another supported model if unavailable to you.
5. Check your active model limits and any billing requirements in AI Studio before
   generating. Availability and free allowances depend on your project and model.

The key stays server-side. Do not add `NEXT_PUBLIC_` to Gemini, OpenAI or Adzuna
credentials. Never commit `.env.local`; it is already excluded by `.gitignore`.
See [Google's API key guide](https://ai.google.dev/gemini-api/docs/api-key) and
[rate-limit documentation](https://ai.google.dev/gemini-api/docs/rate-limits).

### Environment variable reference

| Variable | Required? | Where to get it / behavior |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project's Connect dialog |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase public publishable or legacy anon key |
| `AI_PROVIDER` | Set to `gemini` for this guide | Selects Gemini or OpenAI for job analysis; set it explicitly |
| `GEMINI_API_KEY` | Yes for Gemini analysis and Study | Your Google AI Studio API key |
| `GEMINI_MODEL` | Optional | Defaults to `gemini-3.5-flash-lite`; must be available to your project |
| `ADZUNA_APP_ID` | Only for Explore offers | Adzuna developer dashboard application ID |
| `ADZUNA_APP_KEY` | Only for Explore offers | Adzuna developer dashboard application key |
| `OPENAI_API_KEY` | Only if job analysis uses `AI_PROVIDER=openai` | Your own OpenAI API key; leave unused for the Gemini setup |
| `OPENAI_MODEL` | Optional for OpenAI job analysis | Defaults to `gpt-4.1-mini` in this codebase |
| `MASTER_CV_OWNER_EMAIL` | Only for optional local text-file import | Your verified app account email; not needed for pasted CV text |

Study always uses Gemini, including when job analysis is configured for OpenAI.
There is no automatic fallback to another AI provider. This project does not
require `SUPABASE_SERVICE_ROLE_KEY` for normal operations.

## 8. Enable Explore offers (optional)

Skip this step if you only need applications, Board and Study. Explore will show
a configuration message until you add its credentials; other sections still work.

1. [Register with Adzuna](https://developer.adzuna.com/signup), or
   [sign in](https://developer.adzuna.com/login).
2. Open your API dashboard/application details and find `app_id` and `app_key`.
3. Confirm your account can use the France (`fr`) job-search API and review the
   [provider's terms](https://developer.adzuna.com/docs/terms_of_service).
4. Add both values to `.env.local`:

```dotenv
ADZUNA_APP_ID=your-application-id
ADZUNA_APP_KEY=your-application-key
```

The API credentials stay on the server. If access is denied, check your account's
approval with Adzuna; the app cannot grant access.

Each search requests up to 20 offers. Search, page navigation and reopening Explore
with saved search preferences make requests. Saving/dismissing an offer or switching
result tabs does not. There is no background polling, shared cache or automatic retry.
Check your account's quota; published default limits are listed in Adzuna's terms.

## 9. Start the app and create your account

```sh
npm run dev
```

Keep the terminal open. Once Next.js reports **Ready**, visit
[http://localhost:3000](http://localhost:3000).

1. On the sign-in page, select **New here? Create an account**.
2. Enter your email and a password of at least eight characters.
3. Confirm your email if your Supabase project requires it, then sign in.
4. You should reach Dashboard and see Board, Study, Profile / CV, Explore offers
   and Add job offer in the navigation.

For later visits, open a terminal in the project folder and run `npm run dev` again.
Stop it with **Ctrl+C**. Restart it after any change to `.env.local`.

If port 3000 is occupied, stop the other process or choose a different port:

```sh
npm run dev -- --port 3001
```

Use `http://localhost:3001` and update Supabase's Site URL and login redirect URL
accordingly. `npm run dev` serves the app locally; it does not deploy it online.

## 10. Try the main features

### Save your master CV and prepare an application

1. Open **Profile / CV**, paste your CV as text and click **Save CV**.
2. Open **Add job offer** and enter a title, company and offer text.
3. Click **Analyze Offer** to explicitly call your selected AI provider.
4. The saved application opens with a tailored French CV, match analysis,
   cover letter, interview questions, status and notes.
5. Use **Download CV (PDF)** for the adapted CV. Use the **Lettre de motivation**
   shortcut and **Copy letter** for the letter. Review both before using them.
6. Return to Dashboard to find the application later.

Your master CV is saved in Supabase as text in `profiles.cv_text`. Each generated
application keeps a snapshot of the master text used for that analysis. Generating
an adapted CV does not overwrite the master. PDF export reconstructs a formatted
CV from the saved analysis; it does not edit an original Word/PDF file directly.
The normal profile form accepts text, not PDF/DOCX uploads.

A fresh clone contains **no personal CV**. You can ignore **Use my provided CV** and
paste your own text. Optional local import requires your own UTF-8
`private/master-cv.txt`, `MASTER_CV_OWNER_EMAIL`, a matching verified account and no
existing saved profile. Neither that private folder nor `.env.local` is committed.

### Use Board

Enter a short thought and press Enter or **Save card**. Optionally select Note,
Idea, Task, Reminder, Problem or Solution, plus a project, category or due date.
Use General, All, Problems, Upcoming and project views; open **Search & filters**
when needed. Problems support attached solutions and outcomes. Archive preserves
cards; **Delete permanently** removes a card and, for a problem, its solutions.
Board uses Supabase, with no AI calls or email/push notifications.
Unsaved drafts and navigation preferences are remembered per account in the current
browser tab's session storage; closing the tab ends that storage.

### Find offers

Open **Explore offers**, enter keywords and/or a French location, then search.
Save preferences for later visits. **Save** adds a shortlist entry;
**Prepare application** fills the existing job-offer form. AI runs only when you
click **Analyze Offer**. Dismissed listings stay hidden until shown or restored.

Adzuna supplies **excerpts**, not full adverts. Follow **Original listing** to check
availability and full details. Remote filtering checks explicit wording only;
unknown arrangements can be excluded and a filtered page can be empty. Alternance
and Stage use keywords. Saved offers reach Dashboard after application analysis.
Every displayed offer retains its Adzuna attribution and original redirect link.
Review provider terms before public/commercial reuse. If provider access is
terminated, remove its saved listing data and excerpts from displayed pages and
the database, including any copied into application offer text, as required.

### Test your knowledge

1. Open **Study**, create a subject and select it.
2. Enter a topic and paste 50–20,000 characters of notes or a summary. Save material.
3. Open that material, choose **5** or **10** questions and click **Generate quiz**.
4. Choose an answer or **I'm not sure** for every question, then submit the whole quiz.
5. Read your score, correct answers, explanations and supporting excerpts.
6. Use **Review again** for wrong/unsure questions, or retry a saved quiz and compare
   previous scores. Retrying uses no Gemini call.

New quizzes, answer options, explanations and review-topic labels are generated in English, even from notes in another language. Supporting excerpts keep the source language. Previously saved quizzes keep their original text; generate a new quiz from the same material to use English.

One explicit generation makes one Gemini request. A 30-second per-user cooldown
limits repeated generation clicks; it is separate from Google's project-wide quota.
Review uses the latest attempt per quiz; a successful full retry clears recovered
mistakes. Practice checks in Review again do not change saved scores. Material is
immutable in this version: save a new entry for revised notes. AI can make mistakes;
check explanations against the shown excerpts and your sources.

## 11. Check your installation

Run these from the project root. Build first so Next.js generates route types on
a fresh clone:

```sh
npm run build
npm run typecheck
npm test
```

Tests use synthetic data, mocked providers and a local in-memory PostgreSQL engine
(PGlite). They do not require real AI keys, spend API credits or change your live
Supabase database. Passing tests does not verify your personal credentials or
email delivery: test signup, saving a CV and a Board card in your browser too.

To run the production build locally:

```sh
npm run build
npm start
```

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `npm` or `node` is not recognized | Install Node.js 24, reopen the terminal and check PATH |
| PowerShell blocks `npm.ps1` | Use `npm.cmd ci` / `npm.cmd run dev`, or use Command Prompt |
| Repository not found during clone | Confirm the URL, GitHub login and permission to access this private repository |
| `package.json` cannot be found | Change into the cloned `job-apply` folder before running npm commands |
| Missing Supabase configuration / invalid API key | Replace placeholders in `.env.local`, confirm the URL/key belong to the same project, then restart |
| Missing relation/table/function or a Board/Explore/Study setup error | Run the SQL files for this branch in the order in step 5 |
| Email confirmation never arrives | Check spam, Email provider settings, SMTP delivery and Supabase Auth logs |
| Confirmation returns to the wrong URL | Match Site URL and the allowed `/login` redirect to your current local port |
| Save CV does not create a PDF | Save CV stores the master text; analyze an offer, then download from application details |
| Gemini reports 429 | Check the selected model's active quota in AI Studio; wait before trying again; saved quiz retries do not use Gemini |
| Gemini rejects the key or model | Check your key, project restrictions and model access; restart after changing configuration |
| Explore reports missing credentials, 403 or 429 | Add both Adzuna credentials, verify France API approval and check account quota |
| Quiz generation fails | Material remains saved; use clearer/more detailed notes or fewer questions and retry later |
| Port is already in use | Stop the other server or use the alternate-port command in step 9 |

## Updating an existing installation

1. Stop the running app and preserve local changes (`git status`).
2. On `feature/study-quizzes`, run `git pull --ff-only origin feature/study-quizzes`.
3. Run `npm ci` when dependencies or the lockfile change.
4. Run any newly introduced SQL migrations; do not rerun the base schema.
5. Add any new environment variables without overwriting your existing values.
6. Restart with `npm run dev` and check the affected pages.

## Project layout and contributions

- `src/app/(workspace)/` — authenticated pages, including Board, Explore and Study.
- `src/app/api/` — server routes for AI analysis, quiz generation and PDF export.
- `src/components/` — forms, views and browser session handling.
- `src/lib/` — validation, Supabase access and provider integrations.
- `supabase/schema.sql` — initial database setup.
- `supabase/setup-database.txt` — downloadable full setup for an empty database;
  keep it synchronized with the source files when adding migrations.
- `supabase/migrations/` — additive database upgrades.
- `tests/` — unit, API and PostgreSQL security tests.

See [CONTRIBUTING.md](CONTRIBUTING.md) for branches, pull requests and required
checks. Keep API keys, real CVs and generated personal documents out of Git.
