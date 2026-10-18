# JobApply Capture for Windows

A small Tauri 2 companion, not a desktop copy of the website. Capture from the
tray or a global shortcut; manage everything else on the existing Board.

## Sign-in and security design

The existing website uses Supabase email/password authentication and authenticated
direct database operations. This companion uses the same flow: enter your existing
email and password in the local window, sent directly to your Supabase project
over HTTPS with `signInWithPassword`. There is no token copying, browser callback,
OAuth redirect registration, or additional backend. Create your account on
the website as usual. This companion does not add registration or password recovery.

Sessions and refresh tokens live **only in memory**, with automatic refresh while
the app is running. They are never saved in localStorage, configuration files or
drafts. Closing the capture window hides it; it keeps running in the tray. Quit
ends the session in memory, so **sign in again after launching the app**. Sign out
uses local scope and does not log out the website. This intentionally trades
remembering login across restarts for a smaller secure first version.

Only the Supabase URL and **public anon/publishable key** are bundled. Never use
a service-role key, Gemini/OpenAI key, Adzuna secret or a user's access token here.
Inserts and project queries use the signed-in user's JWT and the existing RLS.
Cards are ordinary rows in `board_cards`, with `user_id`, optional `project_id`,
and the same validation and types imported from `src/lib/board.ts`.

Drafts (including the exact request for an unconfirmed save) are saved synchronously
in this application's WebView localStorage, separated by Supabase user UUID. They
are local text, **not encrypted**, and remain after sign-out so that the same
account can recover them. Do not capture passwords or other secrets. Windows users
with access to your profile can read its application data. The native settings
file contains only the global shortcut, in the app's config directory for
`com.jobapply.capture`. WebView data is under that application's local data area.
The companion never reads the website's localStorage or `.env.local`.

Native permissions are restricted to receiving events; Rust exposes only hide,
shortcut settings, and a validated HTTPS/localhost website opener. There is no
generic filesystem, shell or remote-page IPC permission. The CSP allows connections
to hosted `*.supabase.co` only. A custom Supabase domain requires adding its exact
HTTPS origin to `src-tauri/tauri.conf.json` before building.

## 1. Install Windows prerequisites

1. Install **Node.js 24 with npm** and Git (same as the website).
2. Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/).
   Select **Desktop development with C++**, including MSVC x64/x86 and a Windows SDK.
3. Install stable Rust with [rustup](https://rustup.rs/). Choose the default
   **MSVC** Windows toolchain, not GNU. This project requires Rust **1.90 or newer**.
4. Install [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
   if it is not already installed. It is normally present on Windows 10/11.
5. Open a new PowerShell window. Check `node --version`, `npm --version`,
   `rustc --version`, and `cargo --version`.

See the current [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
Installing the companion later does not require Rust or Node; they are build tools.

## 2. Prepare the existing website and database

Follow the repository root README to set up the website and your Supabase project.
Use the **same Supabase project** for both apps. No new SQL migration is needed.
The existing Board migration and Board/Projects migration must already be applied:

- [`20261013_personal_board.sql`](../../supabase/migrations/20261013_personal_board.sql)
- [`202610130001_board_card_delete.sql`](../../supabase/migrations/202610130001_board_card_delete.sql)
- [`202610170001_board_projects_workspace.sql`](../../supabase/migrations/202610170001_board_projects_workspace.sql)

For a completely new database, use the root README's full setup procedure instead
of applying only these files. Do not rerun the initial schema on an existing database.

From the repository root:

```powershell
npm ci
cd desktop/quick-capture
npm ci
Copy-Item .env.example .env.local
```

Edit **desktop/quick-capture/.env.local**:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
VITE_WEBSITE_URL=http://localhost:3000
```

Copy the two **public** Supabase values from the website's existing configuration,
or Supabase Project Settings → API. No other website environment variables belong
here. `VITE_WEBSITE_URL` is the website origin (use HTTPS for a hosted website).
These are build-time values: restart development or rebuild after changing them.

## 3. Launch for development

Keep the website running with `npm run dev` from the repository root in a separate
terminal if `VITE_WEBSITE_URL` points at localhost. Then, from this folder:

```powershell
npm run desktop:dev
```

Tauri starts Vite on `127.0.0.1:1420` and the native capture window. First compilation
downloads Rust dependencies and may take several minutes. `npm run dev` alone is
only the frontend preview; global shortcuts and tray controls require Tauri.

## 4. Capture a thought

1. Sign in with the same account you use on the website.
2. Press **Ctrl+Alt+Shift+Space** anywhere, or left-click the tray icon.
3. Type your thought and press **Enter**. **Shift+Enter** inserts a new line.
   The first line becomes the title; following lines become notes. A first line
   longer than 300 characters keeps the full thought in notes as well.
4. Optional: expand **Options** to choose Note, Idea, Task, Reminder, Problem, or
   Solution and a project. Defaults are **Note / General**. No due date or other
   mandatory metadata is added.
5. See “Saved to your Board.” The window stays ready for another thought.
6. **Escape** closes an options/settings panel first, then hides the window.
   The native close button also hides it. Unsaved text is retained. Right-click
   the tray for **New card**, **Open website**, or **Quit**.
7. In **Settings**, change the shortcut to `Ctrl+Alt+Shift+J` (or another uppercase
   letter/Space). It is remembered. If a shortcut is occupied, the previous one
   remains active and the tray is always available. Default registration failure
   is shown in the window rather than preventing the app from starting.

Only one instance runs at once. Launching it again focuses the existing window.
This version does not automatically launch at Windows sign-in.

The website loads cards on entry; if the Board is already open, refresh it to see
new desktop captures. The companion does not add website realtime subscriptions.
Check **All** or the selected project if your Board filters hide the new card.

### Failed saves and offline use

There is **no offline queue or automatic synchronization**. Offline capture keeps
the draft; reconnect and explicitly save. Network failures can occur even when
Windows reports online. The request has a 20-second timeout with a clear retry state.

The same UUID is retained on an unconfirmed save, including across app restarts.
Repeated Enter presses are locked immediately. Retry inserts that same UUID; if
it already exists, an owner-scoped read confirms it without overwriting the card.
Unconfirmed requests temporarily freeze editing to avoid changing a card that may
already be saved. A definite database rejection (such as a removed project)
unlocks the draft so you can correct it. Draft storage failure is reported rather
than silently discarding text. Corrupt stored drafts are retained, with editing
blocked; back up application data before clearing it through WebView developer tools.

## 5. Build and install

From this folder:

```powershell
npm run build
npm run desktop:check
cargo test --manifest-path src-tauri/Cargo.toml
npm run desktop:build
```

`npm run build` checks TypeScript and bundles the capture UI only.
`desktop:check` checks Rust/Tauri. `desktop:build` builds the native app and an NSIS
per-user Windows installer in **src-tauri/target/release/bundle/nsis/** (`*-setup.exe`).
Run that installer, then launch **JobApply Capture** from Start. It runs independently
of the dev terminal. A locally built unsigned installer may require Windows SmartScreen
confirmation; signing/distribution are outside this version. Nothing is deployed.

The installer icon is a simple generated note glyph, stored in `src-tauri/icons/`.

## Verification and remaining manual checks

Automated tests are run with **`npm test` from the repository root**. They cover
shared card validation, multiline capture, account-separated drafts, restored
pending requests, keyboard submission rules, immediate duplicate locks, a lost
response with safe retry, project pagination, and simulated desktop-to-Board
visibility. Existing Board/PostgreSQL tests continue to verify ownership and RLS.
No test sends credentials, writes to live Supabase, or calls an AI API.

Native Rust tests cover shortcut restrictions and website URL validation. They
require the Windows build prerequisites. Frontend build success alone does not
prove native compilation or Windows behavior.

On the implementation machine, WebView2 and Node were available but Rust/Cargo
and Visual Studio C++ tools were absent. Native compilation, installer generation,
and Windows UI automation could not be completed. Browser access to localhost
is also blocked by the saved browser permission. The following remain manual:

- Install prerequisites, then run native checks and build above.
- Sign in; confirm incorrect credentials show an error without losing capture text.
- Open with the shortcut while another application has focus; type immediately.
- Verify left-click tray, all three menu actions, a second launch, and native close.
- Change shortcut, restart, and test a conflicting shortcut without losing tray access.
- Save to General and an existing project; refresh website Board with the same account
  and verify the text/type/project. Do not send real applications or call Gemini.
- Hold Enter and confirm one card. Test Shift+Enter, IME, Escape, and rapid reopen.
- Disconnect, type, close/reopen, reconnect, save. Quit/restart and sign in again to
  confirm draft recovery. Check timeout retry does not duplicate an already saved card.
- Sign out and use another account; neither drafts, projects nor cards should leak.
- Check keyboard tab order, Windows display scaling, light/dark system appearance,
  and reduced-motion preference.
