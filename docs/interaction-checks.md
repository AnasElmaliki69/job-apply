# Interaction polish

The interaction improvements are included in `main`. There is no additional SQL
migration for these changes; existing Board/Projects database setup is still required.

## What changed

- Natural-height disclosures open and close over 180 ms, with a shorter opacity
  transition. Closed content becomes inert immediately. Enter/Space toggles the
  button, and Escape inside an expanded panel returns focus to its trigger.
- Stable card keys preserve focus and menu state across saves. Grid items align
  to the top, so opening a menu does not stretch neighboring cards and move their
  controls. Action panels are now remembered with filters, drafts and scroll.
- Save actions lock synchronously against repeated clicks. Busy feedback appears
  immediately; success and error feedback overlays the workspace instead of
  inserting a banner that pushes the grid down. Success notices dismiss after
  five seconds; errors stay until dismissed or another action starts.
- Cards/Projects views use a 120 ms fade without delaying the switch. Clicking an
  already selected view no longer resets scroll. Loading uses a stable skeleton.
- Modals keep native focus containment and Escape handling. Focus restoration
  avoids scrolling the page; stable scrollbar space prevents width changes. A
  drag from inside a dialog onto its backdrop does not dismiss the dialog.
- Project sections, optional forms and saved study material use the same
  disclosure. Invalid hidden URL fields reopen their form panel for correction.
  Saving a new project card opens only its relevant section rather than every one.
- Reduced-motion settings disable transitions, animations and smooth scrolling.

## Manual browser checks

Run with a configured test Supabase project or an isolated fixture; never use real
applications or AI requests to test these interactions. Check both desktop and a
small touch viewport, using a keyboard and reduced-motion settings as well.

1. Open and close Move & more, including rapidly reversing direction. The trigger
   should stay in place; adjacent cards should not stretch. Tab must skip closed
   controls. Escape from its project selector should close it and focus the trigger.
2. Change status and move a card. Check immediate busy feedback, one write for a
   rapid double-click, a visible success/error message, and no grid displacement.
   Open a card and return: filters, menu state and scroll should be restored.
3. Switch Cards/Projects. Check the subtle fade and preserved filters. Click the
   already active view: the page should not jump. Reload with existing saved state.
4. Open create/edit dialogs. Test Tab/Shift+Tab containment, Escape, closing by
   clicking the backdrop, and dragging from a field to the backdrop. After closing,
   focus should return to the initiating control without scrolling.
5. Enter an invalid optional URL, collapse its panel and submit. The panel should
   reopen with its invalid field available. Failed saves must preserve input.
6. Add a task, resource or decision in a project. Only its section should open;
   other collapsed sections should remain collapsed. Open/edit a card and return.
7. Open saved study material. Verify its disclosure and a saved quiz still work
   without another AI call. Existing job-application pages should remain accessible.

Automated checks cover disclosure accessibility markup, duplicate-action exclusion,
success/error/retry behavior, and memory compatibility. Static markup tests do not
verify visual motion, actual browser focus or mobile touch behavior.
