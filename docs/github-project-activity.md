# Project GitHub activity setup

This optional **website** integration initially reads 6 recent commits from a linked
repository's current default branch. **Show more** loads another 6 at a time.
It never writes to GitHub, creates Board
cards, changes tasks, or changes progress. Private repositories are supported.

While this feature is unmerged, use branch `feature/project-github-activity`.
Preserve local work before switching; the desktop companion is on its separate branch.

## 1. Apply the database migration

For an existing installation, open
[`202610180001_project_github_activity.sql`](../supabase/migrations/202610180001_project_github_activity.sql),
copy the entire file into **Supabase → SQL Editor → New query**, and Run.
Apply it after `202610170001_board_projects_workspace.sql`. It is additive and
rerunnable; existing projects, cards, job applications and Study data are preserved.
Do not rerun the base schema or the full setup file on an existing database.

For a new empty database, use the updated
[`setup-database.txt`](../supabase/setup-database.txt) as described in the README.
No service-role key or separate Supabase GitHub login provider is required.

## 2. Register a GitHub App

1. Open [GitHub → Settings → Developer settings → GitHub Apps → New GitHub App](https://github.com/settings/apps/new).
   Register a **GitHub App**, rather than an OAuth App.
2. Give it a unique name (for example, `YourName JobApply Activity`) and a homepage
   URL for your website. GitHub shows its slug on its public page.
3. Set **User authorization callback URL** to
   `http://localhost:3000/api/github/callback` for local development.
4. Leave **Request user authorization (OAuth) during installation** **unchecked**.
   The website explicitly starts authorization with its own state and PKCE.
5. Set **Setup URL** to that same `http://localhost:3000/api/github/callback`.
   Enable **Redirect on update** so installation changes can return to the website.
   Keep **Enable Device Flow** disabled.
6. Disable **Webhook → Active**. No webhook receiver or background processing is
   needed: access is checked on reads/manual Refresh, and commit data is not cached.
7. Under **Repository permissions**, set **Contents: Read-only**. **Metadata:
   Read-only** is required by GitHub automatically. Leave all other repository,
   organization and account permissions at **No access**. Subscribe to no events.
8. Keep **User-to-server token expiration** enabled (Optional Features). The website
   requests expiring tokens and refreshes them server-side when needed.
9. For installations only on your account, choose **Only on this account**. To let
   other users install it on their accounts/organizations, choose **Any account**.
   Organization installation may need an organization's administrator approval.
10. Create the App. Copy its **App ID** and **Client ID**, then **Generate a new
    client secret** and store it securely. This implementation uses user access
    tokens; it needs **no GitHub App private key**, installation token, or PAT.

For a hosted website, use its exact **HTTPS** origin in both callback and setup
URLs and in `GITHUB_APP_ORIGIN`. A separate App registration for local development
keeps the setup URL and authorization environment unambiguous. If you change
ports, update both URLs and the environment variable. `localhost` and `127.0.0.1`
are different origins; consistently use the configured one.

## 3. Add server environment variables

Add these to `.env.local` (or the host's server environment):

```dotenv
GITHUB_APP_ID=123456
GITHUB_APP_CLIENT_ID=Iv1.your-client-id
GITHUB_APP_CLIENT_SECRET=your-client-secret
GITHUB_APP_SLUG=your-app-slug
GITHUB_APP_ORIGIN=http://localhost:3000
GITHUB_CREDENTIALS_KEY=your-random-64-character-hex-key
```

The App ID is numeric; the Client ID is different. The slug is the last part of
`https://github.com/apps/YOUR-SLUG`, not the display name. Origin has no trailing
slash, path, or query.

Generate the encryption key **once**, locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the result into `GITHUB_CREDENTIALS_KEY`. Keep it in your secret manager
alongside the client secret. All server instances must use the same key; changing
or losing it makes saved credentials unreadable and users must disconnect and
reconnect. Never use `NEXT_PUBLIC_` for these settings or commit `.env.local`.
The existing Supabase URL/public key and email/password authentication are reused.

Restart the website:

```sh
npm ci
npm run dev
```

On Windows PowerShell, use `npm.cmd` if `npm.ps1` is blocked.

## 4. Connect and link a repository

1. Sign in to JobApply with your existing Supabase account.
2. Open **Board → Projects → a project → GitHub activity**.
3. Click **Connect GitHub** and authorize the App on GitHub.
4. Click **Grant repository access on GitHub**. Choose the GitHub account or
   organization, choose **Only select repositories**, and select the repositories
   you want to permit (including private repositories). Complete the installation
   and authorization redirect. This is a real permission grant on GitHub.
5. Click **Choose repository**, choose the installation/account and one repository,
   then **Link repository**. The native dropdown supports keyboard and touch.
   **More accounts/repositories** loads subsequent pages if necessary.
6. The section shows the default branch, commit messages, authors, dates and GitHub
   links. **Show more** appends 6 older commits and disappears at the end of history.
   Subsequent pages stay anchored to the initial latest commit so new pushes do not
   shift pagination. Every page rechecks access. **Refresh** fetches current access,
   branch and commits, resetting the list to the latest 6; there is no polling.
7. Use **Change repository** or **Remove repository link** later. The existing
   project-context “Git repository” URL remains an ordinary independent link;
   pasting a URL does not grant access or automatically link a repository.
8. **Disconnect GitHub** disconnects the signed-in user's account across all of
   their projects, removes links, encrypted credentials and pending authorization
   state, and attempts to revoke the GitHub authorization. It does not uninstall
   the App from the repository owner's account. Manage installations under
   **GitHub Settings → Applications → Installed GitHub Apps**.
   If GitHub cannot be reached, local deletion still succeeds and the UI tells you
   to revoke authorization manually under **Authorized GitHub Apps**.

An authorization denied/cancelled or a callback older than 10 minutes requires a
fresh Connect attempt. Starting another connection invalidates the earlier one.
Switching to a different GitHub account clears old repository links. Reconnecting
the same GitHub account preserves links. GitHub SAML organizations may require an
active SSO session before reauthorization; pending approvals show no repositories.

## Security and data handling

- Every server API request validates the Supabase bearer token with `getUser` and
  checks project ownership using the user's Supabase client/RLS. There is no
  service-role access or shared installation token.
- GitHub App user tokens represent the intersection of the connected user's and
  App installation's access. Linking and reading commits revalidate the active,
  readable installation and that the repository is selected. Public API readability
  alone does not make a repository eligible. Revocation, suspension, removed
  repositories, and expired tokens produce errors rather than stale commit data.
- OAuth uses a cryptographically random state, S256 PKCE, a ten-minute encrypted
  HttpOnly/SameSite=Lax cookie (Secure on HTTPS), and a single-use, user-scoped state
  record. The cookie temporarily carries the existing Supabase access token to
  verify the app user on the server callback because the website normally uses
  browser bearer auth. It contains no GitHub tokens. Authorization codes are
  exchanged server-side and stripped from the return URL. Setup `installation_id`
  is never trusted as authorization. Keep query strings out of production access
  logs on the callback route; use HTTPS for hosted deployments.
- Access/refresh tokens are stored together as AES-256-GCM ciphertext with a fresh
  IV and authenticated purpose/user binding. The encryption key stays on the
  website server. Tables have owner-only RLS and foreign keys prevent linking
  another user's project/connection. Stored metadata consists of GitHub user ID,
  login, expiry/version/refresh lease, project/installation/repository IDs and
  timestamps. Plaintext tokens never enter a response or client bundle.
- Refreshes use a database lease and version comparison to avoid concurrent token
  rotation. A failed/uncertain refresh can require reconnecting. No background jobs.
  A crash releases the lease after 45 seconds. Expired refresh tokens require
  reconnecting. Disconnect cancels pending callbacks and cannot be undone by a
  concurrent refresh or callback.
- Private repository names and commit data are fetched on demand, sent only to the
  verified project owner with `private, no-store` responses, and held only in that
  page's memory. Errors clear rendered activity/options. Nothing is written to
  browser storage or shared caches. At most 100 installation/repository pages are
  examined per access validation (10,000 entries); beyond that linking/reading
  fails closed. There is no automatic synchronization or GitHub write permission.

## Verification and manual acceptance checklist

Run `npm test`, `npm run typecheck`, and `npm run build`. Focused tests:

```sh
node --import tsx --test tests/github.test.ts tests/github-security.test.ts
```

They use mocked GitHub/Supabase HTTP and real PostgreSQL semantics in PGlite, with
synthetic accounts. They do not contact your GitHub repositories or live database.

After registering the App/applying SQL, test in a desktop and mobile browser:

- Connect, deny authorization, retry, and try an expired/replayed callback.
- Install on selected public/private repositories; link, change, remove and reload.
- Verify branch and 6 latest commits against GitHub, Show more through multiple
  pages and the end of history, Refresh resets to 6, including an empty repo and
  a changed default branch; keyboard-tab through the native selectors and buttons.
- Remove repository access, suspend/uninstall the App or revoke authorization on
  GitHub, then Refresh; previous activity must disappear with an access error.
- Exercise token expiry/refresh and disconnect; verify project/task progress is
  unchanged and a second Supabase user cannot see the first user's connection.
- Check Light/Dark/System and narrow mobile layouts.

Real OAuth authorization, installation and private-repository access cannot be
verified until a GitHub App and matching environment variables are configured.

Official references checked during implementation:
[user token authorization and PKCE](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app),
[installation links/state](https://docs.github.com/en/apps/sharing-github-apps/sharing-your-github-app),
[setup URL security](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url),
[user-accessible installations/repositories](https://docs.github.com/en/rest/apps/installations),
[commits and Contents permission](https://docs.github.com/en/rest/commits/commits#list-commits),
[token refresh](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens),
[revoking authorization](https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-authorization).
