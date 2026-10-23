# Design system

LearnSphere Nexus is a product UI used for hours at a time by learners, faculty,
placement officers and recruiters. The look is quiet and precise: an ink navigation
rail frames a cool canvas, and a single cobalt accent marks what you can act on.

Everything below lives in code. Tokens are in `web/src/index.css`; shared building
blocks are in `web/src/components/ui/`. Pages compose these and do not invent their
own colours, radii or spacing.

## Identity

| Element | Choice |
| --- | --- |
| Rail | Ink navy (`--rail`) in both themes, with the active item marked by a cobalt bar and a filled icon |
| Canvas | Cool off-white (`--bg`) with a faint accent wash at the top; dark theme is deep navy |
| Accent | Cobalt (`--accent`). Used for primary buttons, links, focus rings, selection and progress. Nothing decorative |
| Display type | Bricolage Grotesque (`font-display`) for page titles, stat values and dialog titles |
| UI type | Geist for everything else; Geist Mono for code and identifiers |
| Icons | Phosphor only. 16 px in buttons, 18 px in navigation and list rows |

Semantic colours mean one thing each: success = verified / healthy, warning = needs
attention, danger = failed / destructive, info = neutral information, xp = earned
points and streaks. They are never used for decoration.

## Shape (one scale)

| Token | Size | Used for |
| --- | --- | --- |
| `rounded-sm` | 6 px | chips inside controls, kbd, inline code |
| `rounded-md` | 10 px | buttons, inputs, selects, nav items, menu items, icon chips |
| `rounded-lg` | 14 px | cards, panels, tables, list groups, empty states, banners |
| `rounded-xl` | 20 px | dialogs |
| `rounded-full` | pill | badges, avatars, switches, progress bars |

## Spacing

4 px grid. The rhythm that repeats on every page:

- Page header to first content: 28 px (`PageHeader` has `mb-7`).
- Between page sections: 32 px (`space-y-8` or `mt-8`).
- Between cards in a grid: 16 px (`gap-4`); between a main column and a side column: 32 px (`gap-8`).
- Card padding: 20 px (`CardHeader` + `CardBody`, or `p-5` for a custom card).
- List rows inside a card or list group: `px-5 py-4` (dense tables: `px-4 py-3`).

## Building blocks

| Need | Use |
| --- | --- |
| Page title, one-line purpose, primary action | `PageHeader` (actions sit on the title row) |
| Titled block on a page | `Section` (title, optional description, optional action) |
| "All drives", "Manage", "Open" links in a header | `CardAction` (never a ghost button or a bare link) |
| Grouping with a header | `Card` + `CardHeader` + `CardBody` |
| A list of items | one `rounded-lg border bg-surface` container with `divide-y` rows, not a stack of separate boxes |
| Key numbers | `StatTile` in a `grid gap-4` (2 columns on phones, 3 or 4 on desktop) |
| Status | `StatusBadge` / `Badge` with a semantic tone |
| Nothing here yet | `EmptyState` with icon, one sentence and the action that creates the first item |
| Problems | `ErrorState` (with retry) or `Banner` |
| Loading | `Skeleton` / `SkeletonRows` in the shape of the content |
| Two or more mutually exclusive views | `Segmented` (2 to 5 options) or `Tabs` |

## Layout rules

- No half-empty rows. A card that sits next to another card is the same height, and
  its contents fill it, or the layout changes (single column, list instead of grid).
- A grid with one item does not render as a half-width card; use a full-width row.
- Side columns are 320 to 360 px; the main column is `minmax(0, 1fr)`.
- No cards inside cards. Inside a card, group with dividers, spacing or `bg-surface-2` rows.
- Long lists are capped with a link to the full view.
- Every row with actions puts them at the right end, in the same order on every page.
- Phone width (390 px) is a real layout: one column, actions wrap under the description.

## Copy

Plain words, verbs on buttons, one name per concept, no em dashes. Content whose origin
matters is labelled with `ProvenanceTag` (AI generated, Verified, Self-reported, Sample data, Estimate).

## Accessibility

Contrast is AA or better for every text and token pair in both themes (checked when
the palette was chosen). Focus is always visible with the accent ring. Status is never
conveyed by colour alone. `prefers-reduced-motion` and the in-app reduced-motion setting
turn animations off.
