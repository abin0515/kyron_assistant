# CPE Internal Tool Design System

## Purpose

Create a restrained, efficient internal tool that feels connected to Stevens
CPE without looking like a marketing page. The interface should prioritize
repeatable workflows, clear status, readable data, and human review.

## Principles

1. **Task first:** important actions and current status should be immediately
   visible.
2. **Brand through restraint:** use black, white, and gray as the foundation;
   reserve CPE Red for primary actions and important emphasis.
3. **Consistent over decorative:** reuse the same spacing, controls, and status
   patterns across every workflow.
4. **Human in control:** automated suggestions remain editable and require
   explicit confirmation before submission.
5. **Accessible by default:** never communicate meaning through color alone.

## Color

### Brand primitives

| Token | Value | Purpose |
| --- | --- | --- |
| `cpe-red` | `#A32638` | Primary actions, focus, urgent emphasis |
| `cpe-black` | `#000000` | Primary text, strong selected states |
| `cpe-dark-gray` | `#363D45` | Secondary text and dark UI |
| `cpe-gray` | `#7F7F7F` | Muted text and metadata |
| `cpe-light-gray` | `#E4E5E6` | Borders and subtle surfaces |
| `cpe-white` | `#FFFFFF` | Main background and surfaces |

Components use semantic roles such as `background`, `surface`, `foreground`,
`muted`, `border`, `primary`, `info`, `success`, `warning`, and `destructive`
instead of brand values directly. Semantic status colors are functional, not
decorative: use muted backgrounds and restrained text/border contrast. Do not
create colorful gradients or use status colors as general decoration.

Brand primitives use the `cpe-*` namespace. Product components should normally
use semantic utilities such as `bg-primary`, `text-foreground`, and
`border-border` rather than referencing a brand primitive directly.

### Status treatment

| Status | Treatment |
| --- | --- |
| Editing / queued | Neutral gray surface, dark text, edit or queue icon |
| Saving / generating | Muted blue info surface, info text, spinner |
| Complete / ready | Muted green success surface, success text, check icon |
| Needs attention | Muted amber warning surface, warning text, warning icon |
| Error / unavailable | Muted red destructive surface, destructive text and explicit label |

Status must always include a label and, where useful, an icon. Brand red remains
reserved for primary actions and brand emphasis; it should not represent every
warning, progress state, or completed state.

## Typography

Use **Saira** for page titles and major section headings. Use one of its
lightest legible weights, normally Light, and do not use it for dense UI text.

Use **IBM Plex Sans** for navigation, body copy, controls, tables, metadata,
and other application UI. Arial is an acceptable fallback when the brand fonts
cannot be loaded. Do not use decorative serif display type.

| Role | Size |
| --- | --- |
| Page title | 28–32px, Saira Light |
| Section title | 18–20px, Saira Light |
| Component title | 14–16px |
| Body and controls | 14px |
| Metadata and helper text | 12px |

Use sentence case for headings, navigation, buttons, and status labels.

## Spacing and shape

- Use a 4px base spacing grid; prefer 8, 12, 16, 24, and 32px gaps.
- Standard controls are 40px high.
- Table rows are approximately 48–56px high.
- Use 8–12px corner radii for controls and cards.
- Prefer borders over shadows. Reserve shadows for dialogs, popovers, and
  floating menus.
- Avoid oversized cards, large decorative backgrounds, and excessive empty
  space in workflow pages.

## Responsive behavior

- Design desktop and laptop layouts as the primary experience, with a full
  sidebar, filters, and data tables.
- Keep tablet layouts fully usable with collapsed navigation and simplified or
  horizontally scrollable tables.
- Preserve all core tasks on mobile with menu navigation, card-based lists,
  stacked forms, and sufficiently large controls.
- Test representative widths around 390px, 768px, and 1440px instead of
  designing for every individual device.

## Core components

- **Primary button:** CPE Red background with white text. Use once per
  action group.
- **Secondary button:** white background, dark text, and visible border.
- **Sidebar item:** neutral by default; selected state uses strong contrast and
  a restrained red indicator.
- **Card:** white surface, light-gray border, small radius, minimal shadow.
- **Form controls:** persistent labels, clear helper/error text, and visible
  focus state.
- **Table/list:** searchable and filterable, with status and primary row action
  easy to scan.
- **Status badge:** compact text-and-icon label following the status table
  above.
- **Alert/empty state:** explain what happened and provide one clear next
  action.

## Interaction and accessibility

- Provide visible hover, focus, active, disabled, loading, empty, success, and
  error states.
- Keep keyboard focus visible and preserve logical tab order.
- Meet WCAG AA text contrast.
- Use icons as support, never as the only label for an unfamiliar action.
- Loading messages should describe the active step, such as “Generating
  content” or “Synchronizing records.”
- External, destructive, and irreversible actions require explicit user
  confirmation.
