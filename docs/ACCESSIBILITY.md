# Accessibility

Target: WCAG 2.2 AA.

## What is verified automatically

`pnpm e2e` runs `e2e/a11y.spec.ts`, which loads representative pages for every role (public, learner, faculty, placement officer, recruiter, mentor, platform admin) in **light and dark** themes and runs axe-core with the WCAG 2.0/2.1/2.2 A and AA rule sets. The test fails on any serious or critical violation. It currently passes.

## How the UI is built for accessibility

- Dialogs, menus, popovers, tabs, tooltips, switches and checkboxes use Radix primitives (focus trapping, Esc to close, focus return, roving tab index).
- Every text colour token meets 4.5:1 on the surfaces it is used on, in both themes; code editor syntax colours were chosen to meet 4.5:1 too.
- Visible focus rings on every interactive element (`:focus-visible`), a skip-to-content link, landmarks (`nav`, `main`), and one `h1` per page.
- Form fields have real labels; errors are announced (`role="alert"`) and tied to inputs with `aria-describedby`.
- Status is never colour-only: badges carry text, icons have labels or are hidden from assistive tech.
- Long-running results (quiz grading, code runs, AI answers) are announced through `aria-live` regions; the assessment timer announces at 10, 5 and 1 minute rather than every second.
- Kanban boards and reorderable lists have keyboard alternatives (move menus / up-down buttons), not drag only.
- Charts and the Skill DNA map have table or list alternatives.
- `prefers-reduced-motion` and a manual reduced-motion preference disable animations.
- Layouts work at phone width, at 200% zoom, and avatars/initials are decorative.

## Known gaps

- A full manual screen-reader pass (NVDA/VoiceOver) across every workflow has not been completed.
- The CodeMirror editor follows CodeMirror's own accessibility model (Tab inserts indentation; press Esc then Tab to move focus out).
- UI text is English only.
