# Themes and native dropdowns

Use **Theme → Light / Dark / System** on the sign-in page or in the workspace
navigation (desktop sidebar and mobile header). System is the default. Explicit
choices persist in browser local storage at `jobapply:theme`; tabs on the same
origin synchronize changes. System mode follows device changes while the app is open.
If storage is blocked, selection still works for the current page session, and
the next visit falls back to System. Board's per-account session storage is unchanged.

An inline, constant bootstrap in the root document head resolves the theme before
the body paints. React starts with matching server/client markup, then loads the
saved control value. Only the document's theme attributes skip hydration warnings.
No credentials, AI calls or database changes are involved.

`src/app/theme.css` contains semantic tokens and compatibility rules for existing
surface, text, border, status and accent utilities. Dark mode uses charcoal layers
and restrained green actions; card types retain purple, blue, amber, rose and green
labels. Forms, dialogs, study quiz choices, CV comparisons and messages share these
tokens. Theme switching does not animate the whole page. Existing reduced-motion
preferences remain honored. PDF output keeps its print styling.

All selects stay native. Shared `.field` styling adds a chevron, room for long
labels, a 44px minimum height, consistent typography and clear hover/focus/disabled
states. The native popup retains platform positioning, arrows, typeahead and touch
interaction. Popup colors and selected/hover rendering may vary with browser/OS;
`color-scheme` requests the matching native theme. Forced-colors mode restores the
platform arrow and system styling instead of forcing custom colors.

## Verification

Automated tests cover preference validation, saving and blocked storage, system
resolution, the exact pre-paint script, accessible native theme control markup,
4.5:1 minimum token text contrast in both palettes, and shared styling coverage
for all native selects. These tests do not substitute for visual or keyboard tests.

Manual browser checklist, for both themes at desktop and mobile widths:

- Sign in: theme control, invalid credentials and disabled/loading buttons.
- Board: Cards/Projects switch, all type labels, every filter, Move & more,
  card create/edit forms, delete confirmation and save/error feedback.
- Projects: progress, archived banner, project dialog, resources and decisions.
- Applications: dashboard labels, Profile / CV, Add offer, application status
  selector, CV comparisons, letter and notes. Explore filters and empty/error states.
- Study: subjects, saved material, question-count selector, radio choices,
  scores, wrong/unsure/correct labels and review explanations.
- Reload after selecting Light and Dark; switch to System and change the device
  theme. Open a second tab and change the preference there.
- Use Tab/Shift+Tab, native arrow keys/typeahead and touch selection. Check long
  option labels, disabled controls, modal focus and forced-colors preferences.

The themes and dropdown improvements are included in `main` and add no SQL migration.
