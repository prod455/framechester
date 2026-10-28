# Framechester Studio

## Surface and context

Mode: **Operate**. This is a local production tool used by one operator to
research, write and review videos across several channels. It is not the
product's marketing site. The channel selector establishes the work context;
the main surface contains the work itself.

The operator rejected both the purple decorative dashboard and its subsequent
amber card-based revision. The current direction follows Impeccable's
distill/quieter guidance: restrained chrome, real content, consistent native
controls and a small fixed type scale. Do not recreate a dashboard kit by
putting each heading, count, note and action inside a rounded rectangle.

## Composition

- A light secondary surface carries navigation; the working canvas is white.
- The header contains the channel selector and refresh action. Do not repeat
  the page title in a breadcrumb or add a second channel profile panel.
- Productions use aligned rows with actual local thumbnails, title, date,
  state and action. Never invent thumbnails, revenue or activity for styling.
- In-development research and scripts use compact lists. Selecting an item
  opens that actual item. A review action opens the corresponding video.
- Financial details are available in the overview disclosure and Results.
- Forms group related fields with spacing and light separators. Avoid nested
  cards, decorative icon tiles and duplicated create actions.
- Authentication is a form, not a landing-page hero. Do not add slogans,
  illustrations, benefit lists or fake social proof.

## Tokens and components

`web/src/design-tokens.css` owns colors and sizes. Body uses the local system
UI family at 14px; auxiliary text is 12–13px, section headings 15px, page
headings 24px. Product headings use fixed sizes, not viewport scaling.

White canvas, a light neutral navigation surface, charcoal primary actions,
blue focus/link affordances and semantic state colors form the palette. Color
does not replace state text. Decorative shadows and accent backgrounds do
not belong on working sections; dialogs can use elevation.

Basecoat 1.1.0 owns shared control structure, variants and interactive states.
Its CSS is compiled locally by Tailwind/Vite from `basecoat.css`. The local
Basecoat core and tabs runtime own tab selection, ARIA and arrow/Home/End keys;
no CDN or framework is required. `dom.ts` and `components.ts` adapt
native controls to the application's typed API. `components.css` contains
Studio sizing, status treatments and task layouts, not duplicate button/input
implementations. `design-tokens.css` maps the Basecoat semantic contract:
`--primary` is the main action, `--muted` is a surface and
`--muted-foreground` is secondary text. Mobile form values use 16px type.
Native dialogs have one `.dialog-surface` containing the header and scrollable
body; native modality and edit-protected close paths remain in TypeScript.
Keep Basecoat classes for controls; namespace bespoke sidebar, toast and empty
state layouts to avoid collisions with unused library style rules.

Research, scripts and narratives use mounted Basecoat tab panels grouped by
task. Keep save/apply actions in a stable toolbar and reveal the first invalid
panel before native validation. The assistant takes over the same editor
surface, with Pedido, Dados usados and Proposta tabs, then returns to the
mounted form. Do not stack an assistant dialog over an editor or put scroll
boxes inside its output. On narrow screens, select the document with a native
select instead of a horizontal strip. Inactive tabs use the secondary text
token at full opacity to preserve contrast on white.

Compact labels (buttons, tabs, document lists, filenames, channel/account
names) use ellipsis with the full text retained in the DOM and a native title;
opening the record or native select exposes its content. `setButtonLabel()`
preserves that structure during busy and restored states. Reading content,
errors, references and financial values wrap, including unbroken strings;
do not truncate these to make a layout pass. Flex children must be allowed to
shrink (`min-width: 0`); content grid tracks use `minmax(0, 1fr)`. Do not hide
overflow on the page to mask an escaping child. Wide tables scroll inside
their own bounded container. The body has no pixel minimum that would add
horizontal overflow when a classic scrollbar reduces the available width.

`components.ts` also owns media thumbnails.
`styles.css` owns the shell; `workspace.css` owns task layouts; `overview.css`
owns the content overview. Replace obsolete rules when changing these files
instead of appending another layer of overrides.

## Precision of neighboring elements

Use `precise-ui-alignment` when available. Compare named relationships in the
render, not arbitrary pairs of coordinates: sibling headings, page title and
actions, tab/form edges, control padding, icon centers and sidebar rails.
The acceptance tolerance for equivalent edges/centers is 0.5 CSS px. Record
the viewport and participants; stacked mobile sections have a different
contract from neighboring desktop columns. This is a visual preference of
this product, not a clinical or universal accessibility claim.

Controls share `--control-height:44px`, `--control-inset:12px`,
`--control-gap:8px`, `--icon-size:18px` and `--line-ui:20px`. UI headings use
explicit 24/32px leading; reading text uses `--line-copy:24px`. Do not add
another almost-equal size in a component override. Header rows reserve a
44px alignment band, including section headings without an action. Plain
section actions align their visible text to the trailing rail; framed buttons
align their external edge. Native labels remain associated with controls.
Native-dialog titles occupy a 44px line band aligned with the close button.

Horizontal form rows use subgrid where supported so wrapped labels and hints
share tracks. One-column layouts return to normal field flow. Statistics use
shared tracks for labels, values and details. Tab tracks have zero inherited
padding and 44px height; the active rule stays inside the tab's actual bounds.
Header and content share `--page-inset` and the same maximum-width rails,
including wide windows. Brand, navigation icons and group labels share one
leading rail; brand/navigation text share a second rail.

Use the spacing scale for related elements. Do not conceal structural
misalignment with per-element transforms or negative margins. Optical
adjustments need visual evidence and an explicit scope. Preserve ellipsis,
focus, touch targets, edit protection, authentication and channel isolation.

## Functional floor

Preserve selected channel, authentication, CSRF, local secret storage, source
provenance and separate technical/editorial QA states. Publishing remains
disabled. Responsive layouts retain working controls, readable text, visible
focus, meaningful labels and Escape behavior. Model output remains text for
review; UI styling never authorizes external actions.

Validate populated, empty and error states in the browser at desktop and
narrow widths. Run the mechanical detector as supplementary evidence, never
as a substitute for visual judgment. Project Impeccable telemetry is disabled.
