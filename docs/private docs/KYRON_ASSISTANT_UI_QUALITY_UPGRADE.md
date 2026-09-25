# Kyron Assistant — UI Quality Upgrade Plan (Codex-Ready)

## Context

Repository: `abin0515/kyron_assistant`

This is an internal Stevens CPE tool for preparing source material, generating AI-recommended course setups, creating Kyron drafts, organizing Kyron destinations, managing reusable source files, and running batch creation workflows.

The application is functionally mature enough that this task should **not redesign the product workflow or backend behavior**. The goal is to raise the UI from a functional internal admin tool to a polished, calm, high-quality internal SaaS experience.

Think in the direction of the clarity and restraint found in products such as Linear, Notion, Stripe Dashboard, ChatGPT/Claude settings/workspaces, rather than a flashy marketing site.

The desired result should feel:

- quiet and professional
- spacious without wasting screen area
- deliberate in hierarchy
- consistent across Drafts, Source Library, and Batch Drafts
- clearly branded for Stevens CPE without overusing red
- responsive and keyboard accessible
- mature enough to demo to instructional designers and internal stakeholders

Do not add decorative complexity just for visual novelty.

---

# Primary objective

Improve the overall UI quality across the existing production routes while preserving all existing functionality.

The highest-priority experience is:

1. application shell/navigation
2. Drafts list
3. single-draft workspace/editor
4. Source Library
5. Batch Drafts
6. dialogs, loading/empty/error states, and mobile behavior

The visual system should feel like one coherent product instead of several independently styled feature pages.

---

# Important constraints

## Do not change product behavior

Do not intentionally modify:

- Kyron API behavior
- folder API behavior
- course setup generation behavior
- calibration data behavior
- autosave behavior
- draft polling
- source-file processing
- batch generation logic
- source attachment rules
- authentication
- database schemas
- server contracts
- validation rules

This is primarily a UI/UX refinement.

If a small component refactor is needed to achieve visual consistency, keep public behavior equivalent.

## Preserve newly added functionality

Be especially careful not to regress:

- AI-generated course setup calibration state
- regeneration confirmation behavior
- Kyron destination/folder selection
- source-file selection
- draft status polling
- batch review/edit flows
- responsive table/card fallbacks
- Clerk authentication

## No unnecessary dependency expansion

Prefer the existing stack:

- Next.js
- React
- Tailwind CSS
- Base UI
- Lucide icons
- existing shadcn-style primitives

Do not add a large design-system dependency.

---

# Current UI observations

Before implementation, inspect the current code yourself and validate these observations against the latest `main`.

## 1. The product has a solid structure, but visually reads as an internal admin prototype

The application already has:

- a desktop sidebar
- mobile navigation
- global CPE brand tokens
- shared Button/Card/Input/Textarea primitives
- responsive tables/cards
- loading/error/empty states
- a two-column draft editor
- a master/detail Batch Drafts screen

These are good foundations.

The main issue is not missing functionality. It is **visual hierarchy, consistency, spacing, and surface treatment**.

---

## 2. Too many surfaces are visually equal

Many sections use:

- white background
- rounded-xl
- thin border/ring
- full card container
- border-bottom card headers

This creates a "card soup" effect.

Important actions, primary content, helper content, and secondary metadata often receive nearly the same visual weight.

We need three clearer surface levels:

### Level A — application canvas
Soft neutral background.

### Level B — primary work surface
White or near-white surfaces for major editing/list content.

### Level C — nested/secondary content
Subtle tinted or border-only sections, not another full card inside a card unless necessary.

Avoid deeply nested white rounded boxes.

---

# Design direction

## Color

Keep Stevens/CPE red as the brand accent, but use it deliberately.

Use red primarily for:

- main CTA
- active/accent line
- important interactive emphasis
- brand identity

Do not use CPE red for every error/destructive/status meaning.

Create consistent semantic color tokens for:

- success
- warning
- info/in-progress
- destructive/error

Avoid arbitrary one-off hex values inside feature components.

Status colors should be muted and professional.

### Recommended visual behavior

- neutral canvas
- white work surfaces
- dark charcoal text
- warm/soft gray borders
- subtle brand-red highlights
- restrained semantic status colors

No large gradients.
No glassmorphism.
No neon effects.
No excessive shadows.

---

# Typography

The app already has:

- IBM Plex Sans for body
- Saira for headings

Use them consistently.

Currently some page headings use the heading font/light weight while other feature headings use bold body typography.

Standardize the hierarchy:

### Page title
- `font-heading`
- light/regular
- approximately 28–32px desktop
- tight tracking
- strong visual separation from supporting text

### Section title
- approximately 15–17px
- medium/semibold OR heading font if appropriate
- do not mix styles randomly

### Body
- 14px primary operational text
- 12–13px metadata/supporting text

### Labels
- 13–14px semibold

Avoid excessive bold text. Reserve bold/semibold for labels and important state.

---

# Spacing system

Create a more consistent rhythm.

Prefer a small spacing scale:

- 4px micro-gap
- 8px compact
- 12px related controls
- 16px component padding
- 20–24px major component padding
- 28–32px page-section spacing

Current pages sometimes mix dense table controls with large card padding.

Make the density intentional.

---

# Border radius and shadows

Use consistent radii:

- controls: ~8px
- panels/cards: ~10–12px
- modal: ~14–16px

Use borders for most surfaces.
Use shadows only when elevation is meaningful:

- modal
- mobile drawer
- floating overlay

Normal cards should not all look elevated.

---

# Interaction polish

All interactive elements should have consistent:

- hover state
- pressed state
- focus-visible state
- disabled state
- loading state

Avoid dramatic motion.

Use subtle transitions around 120–180ms.

Respect `prefers-reduced-motion`.

---

# Phase 1 — Product shell and global visual foundation

## Files to inspect

- `app/globals.css`
- `app/layout.tsx`
- `components/layout/workspace-shell.tsx`
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/input.tsx`
- `components/ui/textarea.tsx`
- `components/ui/badge.tsx`

## 1. Refine global tokens

Update `globals.css` to create a cleaner visual foundation.

Goals:

- slightly more intentional canvas/background separation
- cleaner border token
- distinct semantic success/warning/info/destructive colors
- brand red remains Stevens accent
- consistent focus ring
- optional subtle surface tokens if useful

Do not break existing Tailwind variable mappings.

## 2. Normalize core controls

Audit Button/Input/Textarea/Card/Badge.

### Buttons

Current base sizes are relatively compact and feature pages sometimes compensate with local `min-h-*`.

Normalize intended usage:

- compact/icon actions
- normal secondary action
- primary page action

Do not make everything large, but important actions should have enough physical weight.

Default button should feel closer to a polished SaaS control than a tiny utility button.

### Inputs

Inputs and textareas should share:

- height
- border behavior
- focus ring
- disabled state
- placeholder color
- background treatment

Avoid feature-level `bg-white` / `bg-card` inconsistencies when the primitive can own the style.

### Cards

Reduce dependence on a strong ring around every card.

Create a softer default work-surface treatment.

Feature components should not need to repeat:

`rounded-xl border-border ring-1 ring-border`

everywhere.

Consolidate shared styling in the primitive where sensible.

---

# Phase 2 — Application navigation shell

## Current structure

`WorkspaceShell` uses a fixed desktop sidebar and a sticky top bar.

Keep the overall concept, but make it more refined.

## Desktop sidebar

Improve:

- visual hierarchy of brand
- nav active state
- spacing between primary CTA and nav
- user area
- icon/text alignment

### Active navigation

Current active state is visually heavy.

Prefer:

- subtle neutral/red-tinted active surface
- clear text/icon contrast
- a small CPE-red indicator or accent
- avoid a large black navigation block

### Brand

Keep CPE / Course Studio identity, but make the block feel like a product header rather than a placeholder.

Do not make the logo oversized.

### New Draft

Keep this as the main sidebar CTA.

Use red deliberately here.

## Desktop top bar

The desktop top bar currently mostly repeats the page label.

Make it useful or visually quieter.

Possible treatment:

- slimmer utility bar
- breadcrumb/page context
- remove unnecessary duplicate visual weight

Do not add new features just to fill space.

## Mobile navigation

The current native `<details>` dropdown works functionally but feels basic.

Upgrade it into a proper mobile navigation drawer/sheet-like experience using existing React/Base UI capabilities or a lightweight local component.

Requirements:

- overlay
- clear close action
- current nav state
- New Draft CTA
- user account area
- keyboard accessible
- closes when route selected
- Escape closes it

Do not add a large dependency just for this.

---

# Phase 3 — Drafts list

## Files

- `features/drafts/workspaces/components/workspace-list.tsx`
- `workspace-list-filters.tsx`
- `workspace-records.tsx`
- shared status badge components

## Goal

Make Drafts feel like a polished workspace index, not a plain table inside a bordered card.

## Page header

Create/reuse a consistent `PageHeader` pattern across Drafts, Source Library, and Batch Drafts:

- page title
- concise description
- primary CTA aligned right
- consistent spacing

## Filter bar

Refine filter controls into calm segmented/pill controls with clear counts.

Avoid excessive borders.

## Table/list

Desktop table should feel lighter:

- slightly more row height
- clear title hierarchy
- metadata subdued
- hover state
- aligned actions
- clean status badges
- less visual noise from borders

Consider making the draft title/row itself a natural navigation target, while preserving explicit action buttons where useful.

Do not make the entire row clickable if it causes accessibility/action conflicts.

## Actions

Avoid three equally prominent buttons in a row.

Priority:

1. primary next action (`Continue`, `Open editor`)
2. secondary (`Preview`, `View details`)
3. destructive/rare actions should be quiet

## Empty/loading states

Replace generic spinner-only states with polished but lightweight loading skeletons where practical.

Empty state should stay simple and actionable.

---

# Phase 4 — Single Draft Workspace (highest priority)

## Files

- `features/drafts/workspaces/components/workspace-editor.tsx`
- `course-source-card.tsx`
- `workspace-form.tsx`
- `workspace-status-panel.tsx`
- `workspace-source-files.tsx`
- `workspace-source-file-picker.tsx`
- `workspace-draft-attachment.tsx`
- `kyron-destination-field.tsx`
- calibration/regeneration UI

This is the most important screen to make excellent.

## Overall layout

Keep the current useful structure:

- primary editor area
- right-side sticky readiness/status rail

But improve hierarchy.

Recommended desktop layout:

```text
Page header / context
------------------------------------------------
Primary editing column          Status rail
  Source & AI setup             Draft readiness
  Course setup                  Save state
  Kyron destination             Calibration option
  Attachment                    Primary submit CTA
```

The content column should have a comfortable maximum reading/editing width.

The right rail should remain compact and stable.

## Page header

Current back link + title + status can feel fragmented.

Refine into:

- subtle back navigation
- strong draft title
- compact status/autosave metadata
- no oversized header

The title should be the visual anchor.

## Step treatment

The current sections already conceptually represent:

1. Add source information
2. Review course setup
3. readiness/submit

Keep the workflow, but make it visually more intentional.

Use a restrained numbered-step treatment:

- small numbered circle/label
- clear title
- one-line description

Do NOT build a large wizard/stepper that prevents free editing.

## Source section

Improve the "AI generation" moment.

The Generate/Regenerate action should feel important, but not like a marketing CTA.

Suggested treatment:

- brief/source area
- selected files
- a separated AI action row at bottom
- subtle Sparkles icon/accent
- current generation state visually clear

For regenerated content:
- preserve existing confirmation behavior
- improve modal styling
- do not alter calibration semantics

## Course setup form

The form is currently correct but visually dense.

Improve:

- vertical grouping
- labels and helper text
- field spacing
- textarea sizing
- native select appearance consistency
- clearer distinction between large text fields and metadata controls

Recommended grouping:

### Content
- Title
- Description
- Learning objective
- Audience

### Format
- Asset type
- Duration

### Delivery
- attachment
- Kyron destination

Do not change submitted values or validation.

## AI-generated state

Keep the existing state:

- AI generated
- AI generated · Edited

Make this badge visually meaningful but subtle.

Do not over-emphasize it.

## Kyron destination

Current functionality is strong but visually nested.

Reduce "card inside card" appearance.

Destination should read like a form section/field rather than a separate mini-dashboard.

Display:

- folder icon
- path
- small descriptive metadata
- Change folder action

Keep folder picker behavior intact.

## Sticky readiness/status rail

This should feel like a concise operational summary.

Improve:

- clearer readiness checklist
- stronger separation between status and CTA
- primary Create Course Draft button
- calibration checkbox visually secondary
- destructive Delete Workspace visually detached from the main path

Avoid repeating large headings or excessive card borders.

When submitted, the panel should cleanly transition to:

- generation state
- latest message
- Preview
- Open editor
- Check status

## Calibration option

The calibration option is an internal data-collection feature.

Keep it clear but visually secondary.

Do not make it compete with the main submit CTA.

---

# Phase 5 — Kyron folder picker modal

## File

- `features/drafts/workspaces/components/kyron-destination-field.tsx`

The functionality is already sophisticated.

Improve visual polish without changing behavior.

Goals:

- clearer modal header
- breadcrumb hierarchy
- more compact info/warning notice
- folder rows with refined hover/selected states
- cleaner "new folder" mode
- stronger footer hierarchy
- better mobile height/spacing

The modal should feel like a professional file/folder picker, not a large bordered form.

Keep:

- pagination
- folder creation
- nested browsing
- top-level Library selection
- error handling
- Escape behavior
- click-outside behavior
- save semantics

---

# Phase 6 — Source Library

## Files

- `features/source-library/components/source-library.tsx`
- `source-file-list.tsx`
- `source-upload-dialog.tsx`
- `source-file-dialogs.tsx`

## Page header

Use the shared PageHeader pattern.

## Summary metrics

Current stat cards are useful but visually heavy.

Options:

- keep three compact metric tiles with lower visual weight
- OR convert into a single compact summary strip

Do not remove the information.

## File controls

Search/type/sort should feel like one control bar.

Normalize select styling with the rest of the app.

## File table

Refine:

- file identity
- file-type badge
- size
- workspace usage
- upload date
- delete action

Use a slightly more descriptive file-type treatment instead of relying only on uppercase text.

Actions should remain quiet until needed.

## Upload dialog

Audit for:

- spacing
- drop-zone clarity
- progress states
- validation
- duplicate-file handling
- mobile layout

Do not change upload semantics.

---

# Phase 7 — Batch Drafts

## Files

- `features/batches/components/batch-list-page.tsx`
- `batch-detail-page.tsx`
- `batch-draft-list.tsx`
- `batch-review-drawer.tsx`
- `batch-source-picker.tsx`
- `new-batch-page.tsx`

The Batch list already has a strong master/detail concept.

Preserve it.

## Fix visual inconsistency

Currently Batch Drafts has some styling conventions that differ from Drafts and Source Library.

Standardize:

- page title typography
- status colors
- badges
- buttons
- spacing
- empty/error/loading states

Do not keep ad-hoc colors such as feature-local blue/green hex values if semantic tokens can be used.

## Master/detail list

Improve:

- selected batch indication
- progress visualization
- search field
- list density
- detail-panel hierarchy

Progress bar should not use bright brand red simply because it is the primary token; use semantic progress styling.

## Batch detail

This page contains many controls and states.

Improve through hierarchy, not more boxes.

Recommended structure:

```text
Batch header + overall progress

Filters / bulk controls

Workspace queue
  each item:
  source
  generated setup summary
  status
  next action

Review drawer
```

Make "what needs my attention next?" visually obvious.

## Review drawer

Treat it like a focused editor:

- clear drawer header
- source context
- editable setup
- validation
- primary save/confirm action
- secondary cancel

Avoid excessive nested separators.

---

# Phase 8 — Sign-in

## File

- `app/sign-in/[[...sign-in]]/page.tsx`

Keep sign-in simple.

Improve the surrounding product presentation:

- polished CPE Course Studio identity
- calm neutral background
- balanced spacing around Clerk card
- consistent typography

Do not build a marketing landing page.

---

# Shared components to consider

Create only components that meaningfully reduce inconsistency.

Potential additions:

- `PageHeader`
- `SectionHeader`
- `StatusPill` / semantic status config
- `EmptyState`
- `InlineNotice`
- `AppDialog` shell
- `MetricTile`
- `FormSection`
- `FieldLabel` / helper wrapper
- mobile navigation drawer

Do not create a huge abstract design system.

Prefer practical reuse across 2+ production screens.

---

# Status semantics

Unify status rendering across Drafts and Batches.

Suggested semantic categories:

- neutral / queued
- info / generating
- success / complete
- warning / needs attention
- destructive / error

Status badges should use:

- subtle tinted background
- matching text/icon
- no overly saturated fill

Avoid raw status names with inconsistent styling.

---

# Responsive requirements

Verify at minimum:

- ~375px mobile
- ~768px tablet
- ~1280px desktop
- ~1440px+ desktop

Important behaviors:

- sidebar becomes mobile drawer
- primary CTA remains reachable
- sticky status panel becomes normal-flow below/before appropriate content on small screens
- tables continue to use mobile card representations
- dialogs fit viewport
- folder picker does not overflow
- long titles/folder paths truncate gracefully
- no horizontal page scroll

---

# Accessibility requirements

Do not regress accessibility.

Maintain/improve:

- proper headings
- form labels
- `aria-current`
- dialog labeling
- keyboard navigation
- visible focus
- sufficient contrast
- `aria-live` for async status where appropriate
- icon-only button labels
- disabled/loading semantics
- Escape-close behavior
- reduced motion support

Do not communicate status by color alone.

---

# Copy refinement

Small copy improvements are allowed when they reduce ambiguity, but do not change product semantics.

Prefer:

- concise labels
- short helper text
- task-oriented button names
- consistent capitalization

Avoid repeated explanatory paragraphs.

---

# Explicit visual anti-patterns to avoid

Do not:

- place every section inside another bordered card
- add gradients as a default decoration
- use glass effects
- use giant shadows
- make every button red
- make every status a colored filled badge
- add ornamental illustrations
- introduce unnecessary tabs
- turn the workspace into a multi-step wizard
- hide important operational state behind hover
- remove useful responsive mobile views
- create a dashboard full of vanity metrics
- redesign the underlying workflow

---

# Implementation order

Implement in this order so the visual system becomes consistent before feature-level polishing.

## 1. Foundation
- global tokens
- buttons
- inputs/textareas
- cards
- badges/status semantics

## 2. Shell
- desktop sidebar
- desktop top bar
- mobile navigation
- content width/padding

## 3. Drafts
- page header
- filters
- draft list/table
- editor
- readiness panel
- folder picker

## 4. Source Library
- summary
- controls
- file list
- dialogs

## 5. Batch Drafts
- list master/detail
- detail page
- review drawer
- new batch

## 6. Sign-in + global states
- sign-in
- loading
- errors
- empty states
- responsive verification

---

# Implementation strategy for Codex

Before editing:

1. Read `AGENTS.md`.
2. Read the required project docs listed there.
3. Inspect the latest production components, not the `*-concept.tsx` design experiments unless they contain reusable ideas.
4. Map repeated visual patterns and decide which belong in shared components/tokens.
5. Preserve all existing public behavior.

Then implement incrementally.

Do not do a giant rewrite.

Prefer several coherent refactors over replacing entire feature modules.

---

# Acceptance criteria

The task is complete when:

## Visual consistency
- all three core product areas feel like one application
- typography is consistent
- page headers are consistent
- controls share the same visual language
- status colors are semantic and consistent
- unnecessary nested card borders are reduced

## Draft experience
- single draft editor is noticeably calmer and more premium
- source → AI setup → review → submit path is visually obvious
- right-side readiness rail is concise
- folder picker is polished
- calibration controls remain secondary but clear

## Lists
- Drafts, Source Library, and Batch Drafts are easier to scan
- primary vs secondary actions are clear
- table density feels intentional
- mobile fallbacks remain excellent

## Navigation
- desktop sidebar feels refined
- mobile navigation behaves like a real application drawer
- active state is clear without a heavy black block

## Functionality
No regressions in:
- AI generation/regeneration
- calibration collection
- autosave
- source selection/upload
- Kyron attachment
- folder selection/creation
- batch creation/review
- draft submission
- polling
- preview/editor links
- deletion confirmations
- authentication

---

# Verification

Run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Fix any regressions caused by the UI refactor.

Also manually inspect major states:

- no drafts
- populated draft list
- editing draft
- AI generated setup
- edited AI setup
- regeneration confirmation
- Kyron folder picker
- submitted/generating draft
- completed draft
- Source Library empty/populated
- upload dialog
- Batch Drafts empty/populated
- batch detail
- batch review drawer
- mobile navigation

---

# Final report

After implementation, report:

1. files changed
2. new/reused shared UI components
3. global token/design-system changes
4. page-by-page UI changes
5. responsive/accessibility improvements
6. functionality deliberately left unchanged
7. commands run and results
8. any remaining visual inconsistencies or follow-up opportunities

Do not merge or push without explicit user approval.
