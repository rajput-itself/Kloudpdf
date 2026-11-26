# KloudPDF Design System (`DESIGN.md`)

Central architectural reference for KloudPDF's user interface across landing directory pages, single-purpose tool workspaces, and full-bleed interactive editors (`Edit PDF`, `Compress PDF`, `Batch PDF`, `OCR PDF`, `Redact PDF`).

---

## 1. Brand Identity
- **Product**: KloudPDF
- **Tagline**: *PDF tools. Made simple.*
- **Positioning**: A fast, trustworthy, privacy-first browser PDF instrument. Zero accounts, zero server uploads, zero dark patterns.
- **Voice & Copy**:
  - Direct, plain active verbs (`Merge PDF`, `Save changes`, `Compress & download`).
  - Specific operational feedback (`Compressed 4.2 MB → 780 KB (-81.4%)` rather than vague adjectives).
  - Never use marketing hyperbole, fabricated metrics, emojis as UI chrome, or decorative eyebrows.

---

## 2. Core Design Principles
1. **Document Is the Hero**: In tool workspaces and editors, the PDF page surface commands maximum visual prominence (`>65%` viewport area on desktop). Interface chrome recedes behind neutral hairline borders.
2. **Hairline Structure Over Card Stacking**: Avoid nested bordered cards and blurry elevation shadows. Separate workspace zones with crisp `1px` borders and restrained surface stepping.
3. **High Signal-to-Noise**: Distinguish flagship workflows (`Edit PDF`, `Compress PDF`, `Merge PDF`, `Batch PDF`) visually from long-tail utilities so 36+ tools scan in under 2 seconds.
4. **Honest Interaction Affordance**: Instant micro-transitions (`120ms–160ms` on `color`, `background-color`, `border-color`, `transform`), accessible `:focus-visible` outlines, explicit loading states ending in `…`, and `prefers-reduced-motion` respect.
5. **Contrast First (WCAG 2.2 AA)**: Minimum `4.5:1` contrast for all body text and active pills; minimum `3:1` for UI graphics and borders in both Light and Dark themes.

---

## 3. Color Tokens (Semantic CSS Custom Properties)

> Components must reference **semantic variables only**—never raw hex values inside feature stylesheets so Light and Dark modes synchronize across every workspace.

### Light Mode (`:root`)
| Token | Value | Role / Contrast |
| :--- | :--- | :--- |
| `--color-bg` | `#ffffff` | Primary page & inspector surface |
| `--color-bg-subtle` | `#f8f9fb` | Recessed header/panel & table header surface |
| `--color-bg-canvas` | `#f1f3f6` | Matte neutral stage framing rendered PDF sheets |
| `--color-bg-hover` | `#f2f4f7` | Subtle interactive surface hover |
| `--color-bg-card` | `#ffffff` | Interactive tile background |
| `--color-text-main` | `#09090b` | Primary headings & ink (`19.8:1` on `#ffffff`) |
| `--color-text-secondary` | `#4b5563` | Descriptions, body & labels (`7.5:1` on `#ffffff`) |
| `--color-text-muted` | `#595d62` | Captions, metadata & footers (`6.6:1` on `#ffffff`) |
| `--color-text-inverse` | `#ffffff` | Primary button foreground |
| `--color-primary` | `#1d4ed8` | Restrained cobalt action & active state (`6.7:1` on `#ffffff`) |
| `--color-primary-hover` | `#1e40af` | Hovered primary action |
| `--color-primary-active` | `#1e3a8a` | Pressed action / active pill ink on tint (`8.2:1` on `#eff6ff`) |
| `--color-primary-light` | `#eff6ff` | Active tab / icon subtle tint |
| `--color-primary-focus-ring` | `rgba(29, 78, 216, 0.28)` | Accessible keyboard ring |
| `--color-border` | `#e4e4e7` | Standard `1px` container & divider border |
| `--color-border-subtle` | `#efefef` | Hairline inner divider |
| `--color-border-hover` | `#cbd5e1` | Interactive control border hover |
| `--color-success` | `#15803d` | Verified savings / privacy indicators |
| `--color-success-bg` | `#f0fdf4` | Success callout surface |
| `--color-danger` | `#dc2626` | Destructive actions & redaction indicators |
| `--color-danger-bg` | `#fef2f2` | Error surface |
| `--color-warning` | `#b45309` | Caution / signature warnings |
| `--color-warning-bg` | `#fffbeb` | Caution background |

### Dark Mode (`[data-theme="dark"]`)
| Token | Value | Role |
| :--- | :--- | :--- |
| `--color-bg` | `#09090b` | Primary dark surface |
| `--color-bg-subtle` | `#111114` | Panel & toolbar background |
| `--color-bg-canvas` | `#050507` | Deep studio backdrop behind white PDF sheets |
| `--color-bg-hover` | `#1c1c21` | Interactive hover surface |
| `--color-bg-card` | `#111114` | Card / tile surface |
| `--color-text-main` | `#fafafa` | Primary ink |
| `--color-text-secondary` | `#a1a1aa` | Secondary body copy |
| `--color-text-muted` | `#9ca3af` | Tertiary captions |
| `--color-text-inverse` | `#09090b` | Inverse ink on light accents |
| `--color-primary` | `#60a5fa` | Accessible blue accent on dark ground |
| `--color-primary-hover` | `#93c5fd` | Hover accent |
| `--color-primary-active` | `#bfdbfe` | Active text on dark tint |
| `--color-primary-light` | `rgba(59, 130, 246, 0.16)` | Active pill tint |
| `--color-border` | `#27272a` | Structural hairline border |
| `--color-border-subtle` | `#1e1e22` | Fine internal separator |

---

## 4. Typography Scale
- **Primary UI Font Stack**: `'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` (`--font-sans`)
- **Monospace / Telemetry Stack**: `'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace` (`--font-mono`)
- **Numeric Precision**: Apply `font-variant-numeric: tabular-nums` to all zoom controls (`100%`), page counters (`Page 1 of 4`), file sizes (`1.4 MB`), and compression savings metrics (`-64.2%`).

| Token | Size | Line Height | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- |
| `--text-xs` | `0.75rem` (12px) | `1.4` | `0.01em` | Metadata, shortcut badges, helper captions |
| `--text-sm` | `0.875rem` (14px) | `1.5` | `0` | Navigation links, buttons, tool descriptions, controls |
| `--text-base` | `1rem` (16px) | `1.55` | `-0.005em` | Primary body copy, tool titles |
| `--text-lg` | `1.125rem` (18px) | `1.4` | `-0.01em` | Section headers |
| `--text-xl` | `1.25rem` (20px) | `1.3` | `-0.015em` | Workspace page titles (mobile) |
| `--text-2xl` | `1.5rem` (24px) | `1.25` | `-0.02em` | Workspace titles (desktop) |
| `--text-3xl` | `2rem` (32px) | `1.15` | `-0.03em` | Hero display heading |

---

## 5. Spacing, Grid & Containers
- **4px Base Rhythm**: `--space-1` (`4px`), `--space-2` (`8px`), `--space-3` (`12px`), `--space-4` (`16px`), `--space-5` (`20px`), `--space-6` (`24px`), `--space-8` (`32px`), `--space-10` (`40px`), `--space-12` (`48px`), `--space-16` (`64px`).
- **Container Max Widths**:
  - Directory / Homepage (`--max-width`): `1200px` (`padding-inline: 16px` mobile, `24px` tablet/desktop).
  - Tool Stage (`--workspace-max-width`): `1140px`.
  - Full-Bleed Editors (`Edit PDF`, `Compress`, `Batch`, `OCR`, `Redact`): `100vw` edge-to-edge workspace shell.
- **Grid Systems**:
  - Featured Tools Strip: `1` col `<480px`, `2` cols `>=640px`, `4` cols `>=1024px`.
  - Full Catalog Index: Compact `1` col `<560px`, `2` cols `>=560px`, `3` cols `>=960px`, `4` cols `>=1200px`.

---

## 6. Radii, Borders & Shadows
- **Border Radius**: Restrained architectural geometry (avoid puffy capsules).
  - `--radius-xs`: `3px` (shortcut keycaps)
  - `--radius-sm`: `5px` (small pills, toolbars buttons)
  - `--radius-md`: `6px` (buttons, inputs, compact tiles)
  - `--radius-lg`: `8px` (modals, dropzones, PDF preview panels)
- **Shadows (Minimal)**:
  - Directory cards and panels use `1px solid var(--color-border)` instead of drop shadows.
  - `--shadow-sm` (`0 1px 2px rgba(0, 0, 0, 0.05)`) reserved strictly for hovered tiles & floating segmented toggles.
  - `--shadow-sheet` (`0 2px 10px rgba(0, 0, 0, 0.08)`) applied solely to physical PDF sheet canvases over matte `--color-bg-canvas`.
  - `--shadow-modal` (`0 12px 32px rgba(0, 0, 0, 0.14)`) for dialog overlays.

---

## 7. Interactive Components & States
- **Buttons**:
  - Minimum touch height: `36px` compact / `40px` standard (`44px` on touchscreens `<768px`), `gap: 8px`, `white-space: nowrap`.
  - Variants: `primary` (`--color-primary` solid), `secondary` (`--color-bg` + `1px` border), `outline` (cobalt border), `ghost` (transparent hover surface), `danger` (destructive red — reserved for delete/cancel/redaction execution).
- **Inputs & Controls**:
  - Explicit visible labels (`<label htmlFor>`), `min-height: 40px`, `1px solid var(--color-border)`, focus border `--color-primary` + `3px` `--color-primary-focus-ring`.
- **Icons**: Consistent `1.75px` stroke weight from `lucide-react`; strictly `aria-hidden="true"` when decorative beside text labels.
- **Motion Guidelines**:
  - Never use `transition: all`. Specify explicit properties (`background-color`, `border-color`, `color`, `opacity`, `transform`).
  - Duration: `120ms` micro-hover, `180ms` panel/modal reveal.
  - Honor `@media (prefers-reduced-motion: reduce)` globally.

---

## 8. Responsive Breakpoints & Accessibility Targets
- **Breakpoints Verified**: `320px`, `375px`, `390px`, `414px`, `768px`, `1024px`, `1280px`, `1440px`, `1920px`, `2560px` with zero horizontal overflow (`scrollWidth <= innerWidth`).
- **Accessibility Target (WCAG 2.2 AA)**:
  - Skip-to-content link, semantic `<header>`, `<main>`, `<footer>`, `<nav>`, single `<h1>` per route.
  - Non-nested interactive elements (no interactive `<button>` inside `role="button"` dropzones).
  - Live regions (`aria-live="polite"`) for processing updates and validation errors.
