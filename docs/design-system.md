# Bank Data Explorer: Design System

A purpose-built design system for a financial data explorer. Not a generic dashboard theme.

## Philosophy

The goal is "FRED meets Bloomberg for retail users." That means:

- **Information density over whitespace worship.** Financial users want data, not hero sections.
- **Scannable numbers.** Every metric should be comparable at a glance. Tabular figures, consistent alignment, semantic color for direction.
- **Two modes, one system.** Accessible mode (welcoming, lighter, more breathing room) and Power mode (dark, dense, Bloomberg-energy). Same design tokens, different surfaces.
- **Authority through restraint.** No gradients, no rounded-everything, no cute illustrations. Tight grids, precise type, deliberate color. The data is the UI.

Visual references we're drawing from:
- **Bloomberg Terminal**: Dark backgrounds, amber/orange accents, extreme density, monospace numbers, the feeling of "this tool means business"
- **Koyfin**: Cleaner Bloomberg. Dark mode with good chart colors, well-organized dense data, professional but approachable
- **FRED**: Clean, academic, white-background charts with a focus on the data series. Good at not getting in the way
- **Macrotrends**: Dense tables, lots of numbers, functional rather than pretty. We want to be prettier than this
- **Capital IQ**: Spreadsheet-density with organized sections. Tab-heavy navigation, very professional

What we're NOT copying: generic fintech pastel gradients, oversized cards with 3 numbers per screen, Stripe-style polish (wrong context), anything that looks like a Figma template.

---

## 1. Color System

### Design Principle

We use a **warm neutral** base (not cool gray/slate) with a **teal** primary accent. Not blue. Blue is every banking app. Teal reads as "analytical, precise, financial" without being "generic SaaS." The warm neutrals give the app a sense of solidity (think: aged paper, oak desks, institutional weight) while teal provides clarity and focus.

### Light Mode (Accessible Mode)

```
Background tiers (layered surfaces):
  --surface-0:    oklch(0.985 0.005 80)    /* #faf9f7  Page background, warm off-white */
  --surface-1:    oklch(1.000 0.000 0)      /* #ffffff  Cards, primary containers */
  --surface-2:    oklch(0.970 0.005 80)     /* #f3f1ee  Inset areas, table headers */
  --surface-3:    oklch(0.940 0.008 80)     /* #e8e5df  Deeper insets, hover states */

Border & Dividers:
  --border:       oklch(0.880 0.010 80)     /* #d6d2cb  Default borders */
  --border-muted: oklch(0.920 0.008 80)     /* #e2dfda  Subtle dividers */

Text hierarchy:
  --text-primary:   oklch(0.200 0.015 80)   /* #1c1a17  Primary text, headings */
  --text-secondary: oklch(0.450 0.010 80)   /* #6b6660  Secondary text, labels */
  --text-tertiary:  oklch(0.600 0.008 80)   /* #948f88  Muted text, captions */
  --text-disabled:  oklch(0.720 0.005 80)   /* #b5b1ab  Disabled states */

Primary accent (teal):
  --accent:       oklch(0.550 0.120 195)    /* #0d7d7d  Primary buttons, links, active tabs */
  --accent-hover: oklch(0.480 0.110 195)    /* #096a6b  Hover state */
  --accent-muted: oklch(0.930 0.035 195)    /* #e0f2f1  Accent backgrounds, selected rows */
  --accent-text:  oklch(0.450 0.100 195)    /* #0a6565  Accent text on light backgrounds */

Semantic (financial):
  --positive:       oklch(0.520 0.140 155)  /* #1a8a4a  Gains, up trends, healthy metrics */
  --positive-muted: oklch(0.940 0.040 155)  /* #e4f5ec  Positive background */
  --negative:       oklch(0.520 0.160 25)   /* #c53d2f  Losses, down trends, risk */
  --negative-muted: oklch(0.940 0.040 25)   /* #fce8e5  Negative background */
  --warning:        oklch(0.650 0.150 70)   /* #c48a00  Caution, watchlist */
  --warning-muted:  oklch(0.940 0.045 70)   /* #fef3d6  Warning background */
  --neutral:        oklch(0.600 0.010 80)   /* #918c85  Unchanged, flat */
```

### Dark Mode (Power Mode)

```
Background tiers:
  --surface-0:    oklch(0.160 0.010 250)    /* #111318  Page background, deep blue-black */
  --surface-1:    oklch(0.200 0.012 250)    /* #191c23  Cards, containers */
  --surface-2:    oklch(0.240 0.014 250)    /* #22262f  Elevated elements, popovers */
  --surface-3:    oklch(0.280 0.012 250)    /* #2d3139  Hover states, active elements */

Border & Dividers:
  --border:       oklch(0.320 0.010 250)    /* #383c44  Default borders */
  --border-muted: oklch(0.260 0.008 250)    /* #282c33  Subtle dividers */

Text hierarchy:
  --text-primary:   oklch(0.920 0.005 80)   /* #e8e5e0  Primary text */
  --text-secondary: oklch(0.700 0.008 80)   /* #a8a39c  Secondary text */
  --text-tertiary:  oklch(0.540 0.006 250)  /* #7a7e86  Muted text */
  --text-disabled:  oklch(0.400 0.005 250)  /* #555961  Disabled */

Primary accent (teal, brighter for dark bg):
  --accent:       oklch(0.700 0.120 195)    /* #2db5a8  Links, active states */
  --accent-hover: oklch(0.750 0.130 195)    /* #3fc8ba  Hover */
  --accent-muted: oklch(0.250 0.040 195)    /* #1a3535  Accent backgrounds */
  --accent-text:  oklch(0.700 0.120 195)    /* #2db5a8  Accent text */

Semantic (financial, adjusted for dark):
  --positive:       oklch(0.680 0.140 155)  /* #34c772  Gains */
  --positive-muted: oklch(0.230 0.040 155)  /* #142e1f  Positive background */
  --negative:       oklch(0.650 0.160 25)   /* #e85c4a  Losses */
  --negative-muted: oklch(0.230 0.040 25)   /* #301a17  Negative background */
  --warning:        oklch(0.750 0.140 70)   /* #e0a620  Caution */
  --warning-muted:  oklch(0.250 0.040 70)   /* #302810  Warning background */
  --neutral:        oklch(0.540 0.006 250)  /* #7a7e86  Unchanged */
```

### Chart Colors (10-series palette)

Designed for both light and dark backgrounds. High chroma, well-separated hues. Ordered by visual distinctiveness, not rainbow order.

```
Light mode:
  --chart-1:  oklch(0.550 0.120 195)   /* #0d7d7d  Teal (primary series) */
  --chart-2:  oklch(0.550 0.140 25)    /* #c53d2f  Warm red */
  --chart-3:  oklch(0.600 0.130 280)   /* #6b5ce7  Purple */
  --chart-4:  oklch(0.650 0.150 70)    /* #c48a00  Amber */
  --chart-5:  oklch(0.520 0.130 155)   /* #1a8a4a  Green */
  --chart-6:  oklch(0.580 0.140 330)   /* #c44e8a  Rose */
  --chart-7:  oklch(0.600 0.100 230)   /* #4a82c4  Steel blue */
  --chart-8:  oklch(0.650 0.120 120)   /* #7da82e  Olive */
  --chart-9:  oklch(0.550 0.100 350)   /* #b04e6e  Burgundy */
  --chart-10: oklch(0.600 0.080 180)   /* #3e9a8a  Seafoam */

Dark mode (same hues, lifted lightness):
  --chart-1:  oklch(0.700 0.120 195)   /* #2db5a8 */
  --chart-2:  oklch(0.680 0.150 25)    /* #e07060 */
  --chart-3:  oklch(0.700 0.130 280)   /* #8b7ef0 */
  --chart-4:  oklch(0.750 0.140 70)    /* #e0a620 */
  --chart-5:  oklch(0.680 0.140 155)   /* #34c772 */
  --chart-6:  oklch(0.700 0.130 330)   /* #e070a8 */
  --chart-7:  oklch(0.700 0.100 230)   /* #6aa0e0 */
  --chart-8:  oklch(0.750 0.120 120)   /* #a0c850 */
  --chart-9:  oklch(0.680 0.100 350)   /* #d07090 */
  --chart-10: oklch(0.700 0.080 180)   /* #5ec0aa */
```

---

## 2. Typography

### Font Stack

**Headings & UI text:** Inter (variable, loaded from rsms.me, NOT Google Fonts)
- Inter from Google Fonts strips OpenType features. The official variable font from rsms.me keeps tabular figures, case-sensitive forms, and stylistic alternates.
- Fallback: `system-ui, -apple-system, sans-serif`

**Numbers & Data:** Inter with `font-feature-settings: "tnum" 1`
- Tabular figures make columns of numbers align perfectly. This is non-negotiable for financial data.
- Apply to ALL number-heavy contexts: table cells, metric cards, charts.

**Code/IDs:** Geist Mono (from Vercel, open source) or `ui-monospace, monospace`
- For CERT numbers, RSSD IDs, exact values, API-style data
- Smaller than body text, slightly muted color

### Type Scale

Designed for dense data. Smaller than typical web defaults. Every size has a purpose.

```
--text-2xs:  0.625rem / 10px    Line height: 1rem      /* Micro-labels, footnotes */
--text-xs:   0.6875rem / 11px   Line height: 1rem      /* Table headers, badges, fine print */
--text-sm:   0.8125rem / 13px   Line height: 1.25rem   /* Table cells, secondary info, metadata */
--text-base: 0.875rem / 14px    Line height: 1.375rem  /* Body text, descriptions, form labels */
--text-lg:   1rem / 16px        Line height: 1.5rem    /* Section headers, emphasized body */
--text-xl:   1.25rem / 20px     Line height: 1.75rem   /* Page section titles */
--text-2xl:  1.5rem / 24px      Line height: 2rem      /* Page titles */
--text-3xl:  2rem / 32px        Line height: 2.5rem    /* Hero numbers, landing page */
```

### Weight Usage

```
300 (Light):    Large display numbers only (the big hero stat on landing page)
400 (Regular):  Body text, descriptions, table cells
500 (Medium):   Labels, nav items, section headers, table headers
600 (Semibold): Page titles, metric values, emphasis
700 (Bold):     Sparingly. Hero heading only. Overuse kills the professional feel.
```

### Key Rules

1. **All number columns get `font-variant-numeric: tabular-nums`**. Period. No exceptions.
2. **Body text is 14px (0.875rem), not 16px.** Data apps need density. 16px body wastes space.
3. **Table cells are 13px.** Dense but readable.
4. **Table headers are 11px uppercase, medium weight, wider tracking.** Bloomberg-style labels.
5. **Letter spacing:** Headings get `tracking-tight` (-0.01em). Labels/table headers get `tracking-wide` (0.05em) or `tracking-wider` (0.08em).
6. **Never use bold (700) for body text.** Medium (500) or semibold (600) provide enough hierarchy without making text feel "shouting."

---

## 3. Spacing System

Financial data UIs need tighter spacing than typical web apps. We use a compressed scale.

```
--space-0:   0
--space-px:  1px
--space-0.5: 0.125rem / 2px     /* Inline gaps, icon padding */
--space-1:   0.25rem / 4px      /* Tight gaps within components */
--space-1.5: 0.375rem / 6px     /* Table cell vertical padding */
--space-2:   0.5rem / 8px       /* Default inner padding, small gaps */
--space-3:   0.75rem / 12px     /* Card padding, comfortable inner spacing */
--space-4:   1rem / 16px        /* Section gaps, generous card padding */
--space-5:   1.25rem / 20px     /* Between sections */
--space-6:   1.5rem / 24px      /* Major section breaks */
--space-8:   2rem / 32px        /* Page-level spacing */
--space-10:  2.5rem / 40px      /* Hero spacing (landing page only) */
```

### Spacing Rules

1. **Card inner padding: 12px (space-3).** Not 16px. Tighter = more data visible.
2. **Table cell padding: 6px vertical, 12px horizontal.** Compact rows. More data in view.
3. **Gap between cards in a grid: 8px (space-2).** Tight grid, not scattered tiles.
4. **Section spacing: 16-20px.** Enough to separate, not enough to lose context.
5. **Page max-width: 1400px** for data pages (not 1280px). We need the horizontal room.

---

## 4. Component Patterns

### 4.1 Cards (MetricCard)

**Current (generic):**
```html
<div class="rounded-lg border border-gray-200 bg-white px-4 py-4">
```

**New (light mode):**
```html
<div class="rounded border border-[--border] bg-[--surface-1] px-3 py-3">
  <p class="text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">LABEL</p>
  <p class="mt-0.5 text-xl font-semibold text-[--text-primary] tabular-nums">$1.2B</p>
  <p class="mt-0.5 text-[11px] text-[--text-tertiary]">sublabel</p>
</div>
```

Key changes:
- `rounded-lg` to `rounded` (4px, not 8px). Financial tools have sharper corners. Bloomberg uses 0px. We go 4px as a compromise.
- Padding 16px to 12px. Tighter.
- Tabular-nums on the value. Always.
- Font size for label drops to 11px. Numbers stay prominent at 20px.

**With directional indicator (enhanced MetricCard):**
```html
<div class="rounded border border-[--border] bg-[--surface-1] px-3 py-3">
  <p class="text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">ROA</p>
  <div class="mt-0.5 flex items-baseline gap-1.5">
    <span class="text-xl font-semibold text-[--text-primary] tabular-nums">1.24%</span>
    <span class="text-xs font-medium text-[--positive] tabular-nums">+0.08%</span>
  </div>
  <p class="mt-0.5 text-[11px] text-[--text-tertiary]">vs prev quarter</p>
</div>
```

### 4.2 Data Tables

**Current (generic):**
```html
<table class="min-w-full divide-y divide-gray-200">
  <thead class="bg-gray-50">
    <th class="px-4 py-3 text-xs font-medium tracking-wider text-gray-500 uppercase">
```

**New (light mode):**
```html
<div class="rounded border border-[--border] overflow-hidden">
  <table class="min-w-full text-[13px]">
    <thead>
      <tr class="bg-[--surface-2] border-b border-[--border]">
        <th class="px-3 py-2 text-[11px] font-medium tracking-wider text-[--text-tertiary] uppercase text-left">
          NAME
        </th>
        <th class="px-3 py-2 text-[11px] font-medium tracking-wider text-[--text-tertiary] uppercase text-right">
          TOTAL ASSETS
        </th>
      </tr>
    </thead>
    <tbody class="divide-y divide-[--border-muted]">
      <tr class="hover:bg-[--surface-2] transition-colors duration-75 cursor-pointer">
        <td class="px-3 py-1.5 font-medium text-[--text-primary]">JPMorgan Chase</td>
        <td class="px-3 py-1.5 text-[--text-secondary] text-right tabular-nums">$3.4T</td>
      </tr>
    </tbody>
  </table>
</div>
```

Key changes:
- Row padding: `py-3` (12px) to `py-1.5` (6px). Much denser. 2x more rows visible.
- Cell text: `text-sm` (14px) to `text-[13px]`. Tighter.
- Header: 11px uppercase, tracked. Distinct from body rows.
- First column (name) gets `font-medium`. Other columns regular weight.
- Number columns always get `tabular-nums` and `text-right`.
- Hover is subtle: one tier up in surface, near-instant transition (75ms).
- No divide-y on tbody by default (too heavy). Use `divide-[--border-muted]` for very subtle row lines.
- `rounded-lg` to `rounded`. Sharper.

**Sortable header pattern:**
```html
<th class="px-3 py-2 text-[11px] font-medium tracking-wider text-[--text-tertiary] uppercase text-right
           cursor-pointer select-none hover:text-[--text-secondary] transition-colors">
  <span class="inline-flex items-center gap-1">
    ASSETS
    <!-- Active sort: filled, accent color -->
    <svg class="w-3 h-3 text-[--accent]">...</svg>
    <!-- Inactive sort: ghost arrow -->
    <svg class="w-3 h-3 text-[--text-disabled]">...</svg>
  </span>
</th>
```

### 4.3 Navigation

**Current (generic):**
```html
<nav class="bg-slate-800 text-white">
```

**New (both modes):**
```html
<nav class="bg-[--surface-1] border-b border-[--border]">
  <div class="max-w-[1400px] mx-auto px-4 h-11 flex items-center gap-6">
    <!-- Logo / app name -->
    <a href="/" class="text-[15px] font-semibold text-[--text-primary] tracking-tight flex items-center gap-2">
      <!-- Small monogram or icon here, NOT a big logo -->
      <span class="text-[--accent] font-bold">BDE</span>
      <span class="hidden sm:inline text-[--text-secondary] font-normal text-[13px]">Bank Data Explorer</span>
    </a>

    <!-- Nav links -->
    <div class="flex items-center gap-5 text-[13px] font-medium">
      <a href="/banks" class="text-[--text-secondary] hover:text-[--text-primary] transition-colors">Banks</a>
      <a href="/industry" class="text-[--text-disabled]">Industry</a>
      <a href="/compare" class="text-[--text-disabled]">Compare</a>
      <a href="/glossary" class="text-[--text-disabled]">Glossary</a>
    </div>

    <!-- Right side: mode toggle -->
    <div class="ml-auto flex items-center gap-3">
      <!-- Mode toggle (Accessible / Power) -->
      <button class="text-[11px] font-medium uppercase tracking-wider text-[--text-tertiary] hover:text-[--text-primary]
                      px-2 py-1 rounded border border-[--border] transition-colors">
        Power Mode
      </button>
    </div>
  </div>
</nav>
```

Key changes:
- Height reduced to 44px (`h-11`). Compact. Every pixel of vertical space matters for data.
- Background uses surface-1, not a separate dark color. In dark/power mode, this naturally becomes dark. Light mode nav is light.
- Logo is a monogram + name, not just text. "BDE" in accent color is distinctive.
- 13px nav links. Medium weight. Compact.
- Mode toggle is always visible in the nav. Small, understated, but always accessible.

### 4.4 Bank Detail Page Layout

**Tab navigation:**
```html
<nav class="border-b border-[--border] -mx-4 px-4">
  <div class="flex gap-0">
    <!-- Active tab -->
    <a class="px-4 py-2.5 text-[13px] font-medium text-[--accent] border-b-2 border-[--accent]
              -mb-px">Overview</a>
    <!-- Inactive tab -->
    <a class="px-4 py-2.5 text-[13px] font-medium text-[--text-tertiary] border-b-2 border-transparent
              hover:text-[--text-secondary] hover:border-[--border] transition-colors -mb-px">Financials</a>
  </div>
</nav>
```

**Section pattern:**
```html
<section>
  <!-- Section header with a subtle left accent bar -->
  <div class="flex items-center gap-2 mb-3">
    <div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
    <h2 class="text-[15px] font-semibold text-[--text-primary]">Key Metrics</h2>
    <span class="text-[11px] text-[--text-tertiary] ml-1">as of Mar 2024</span>
  </div>
  <!-- Content -->
</section>
```

**Key/value detail rows (bank info):**
```html
<div class="rounded border border-[--border] bg-[--surface-1] divide-y divide-[--border-muted]">
  <div class="flex justify-between items-center px-3 py-2">
    <span class="text-[13px] text-[--text-tertiary]">Regulator</span>
    <span class="text-[13px] font-medium text-[--text-primary]">OCC</span>
  </div>
  <div class="flex justify-between items-center px-3 py-2">
    <span class="text-[13px] text-[--text-tertiary]">Charter Class</span>
    <span class="text-[13px] font-medium text-[--text-primary]">National Bank</span>
  </div>
</div>
```

### 4.5 Search Input

**Current:**
```html
<input class="rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-10 text-sm text-gray-900
              placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
```

**New:**
```html
<input class="w-full rounded border border-[--border] bg-[--surface-1] py-2 pl-9 pr-9
              text-[14px] text-[--text-primary] placeholder:text-[--text-disabled]
              focus:border-[--accent] focus:ring-1 focus:ring-[--accent]/30 focus:outline-none
              transition-colors">
```

Key change: ring uses accent/30 (30% opacity), not solid. More subtle focus indicator.

### 4.6 Select/Dropdown Filters

**Current:**
```html
<select class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
```

**New:**
```html
<select class="rounded border border-[--border] bg-[--surface-1] pl-3 pr-8 py-1.5
               text-[13px] font-medium text-[--text-secondary]
               focus:border-[--accent] focus:ring-1 focus:ring-[--accent]/30 focus:outline-none
               transition-colors cursor-pointer">
```

Shorter padding (`py-1.5`), smaller text (13px), medium weight for the selected value.

### 4.7 Buttons

**Primary:**
```html
<button class="rounded bg-[--accent] text-white text-[13px] font-medium
               px-3 py-1.5 hover:bg-[--accent-hover] transition-colors">
  Compare Banks
</button>
```

**Secondary/Ghost:**
```html
<button class="rounded border border-[--border] bg-transparent text-[13px] font-medium
               text-[--text-secondary] px-3 py-1.5
               hover:bg-[--surface-2] hover:text-[--text-primary] transition-colors">
  Previous
</button>
```

**Pagination:**
```html
<button class="rounded border border-[--border] bg-[--surface-1] px-2.5 py-1
               text-[13px] font-medium text-[--text-secondary]
               hover:bg-[--surface-2] disabled:opacity-40 disabled:cursor-not-allowed
               transition-colors">
  Next
</button>
```

### 4.8 Badges/Status Indicators

**Active/Inactive:**
```html
<!-- Active -->
<span class="inline-flex items-center rounded-sm px-1.5 py-0.5
             text-[11px] font-medium tracking-wide
             bg-[--positive-muted] text-[--positive]">Active</span>

<!-- Inactive -->
<span class="inline-flex items-center rounded-sm px-1.5 py-0.5
             text-[11px] font-medium tracking-wide
             bg-[--negative-muted] text-[--negative]">Inactive</span>
```

Key change: `rounded-full` to `rounded-sm`. Pill shapes are too playful for financial data. Slight rounding is enough.

### 4.9 Metric Trend Indicators

For showing direction of change next to a metric:

```html
<!-- Positive -->
<span class="inline-flex items-center gap-0.5 text-xs font-medium text-[--positive] tabular-nums">
  <svg class="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
    <path d="M6 2L10 7H2L6 2Z"/>  <!-- Simple up triangle -->
  </svg>
  +0.12%
</span>

<!-- Negative -->
<span class="inline-flex items-center gap-0.5 text-xs font-medium text-[--negative] tabular-nums">
  <svg class="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
    <path d="M6 10L2 5H10L6 10Z"/>  <!-- Down triangle -->
  </svg>
  -0.08%
</span>

<!-- Neutral/Flat -->
<span class="inline-flex items-center gap-0.5 text-xs font-medium text-[--neutral] tabular-nums">
  <svg class="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
    <rect x="2" y="5" width="8" height="2" rx="0.5"/>  <!-- Dash -->
  </svg>
  0.00%
</span>
```

---

## 5. Chart Theming (ECharts)

### Light Mode Theme Object

```javascript
export const lightChartTheme = {
  color: [
    '#0d7d7d', '#c53d2f', '#6b5ce7', '#c48a00', '#1a8a4a',
    '#c44e8a', '#4a82c4', '#7da82e', '#b04e6e', '#3e9a8a'
  ],
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: "'Inter', system-ui, sans-serif",
    color: '#6b6660'
  },
  title: {
    textStyle: {
      color: '#1c1a17',
      fontSize: 15,
      fontWeight: 600
    },
    subtextStyle: {
      color: '#948f88',
      fontSize: 11
    }
  },
  legend: {
    textStyle: {
      color: '#6b6660',
      fontSize: 11
    },
    itemWidth: 12,
    itemHeight: 8,
    itemGap: 16
  },
  tooltip: {
    backgroundColor: '#ffffff',
    borderColor: '#d6d2cb',
    borderWidth: 1,
    textStyle: {
      color: '#1c1a17',
      fontSize: 12,
      fontFamily: "'Inter', system-ui, sans-serif"
    },
    extraCssText: 'border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);'
  },
  xAxis: {
    axisLine: { lineStyle: { color: '#d6d2cb' } },
    axisTick: { lineStyle: { color: '#d6d2cb' } },
    axisLabel: {
      color: '#948f88',
      fontSize: 11,
      fontFamily: "'Inter', system-ui, sans-serif"
    },
    splitLine: { lineStyle: { color: '#e8e5df', type: 'dashed' } }
  },
  yAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: '#948f88',
      fontSize: 11,
      fontFamily: "'Inter', system-ui, sans-serif"
    },
    splitLine: { lineStyle: { color: '#e8e5df', type: 'dashed' } }
  },
  grid: {
    left: 8,
    right: 8,
    top: 40,
    bottom: 8,
    containLabel: true
  },
  line: {
    symbolSize: 4,
    lineStyle: { width: 2 }
  },
  bar: {
    barMaxWidth: 32,
    itemStyle: { borderRadius: [2, 2, 0, 0] }
  }
};
```

### Dark Mode Theme Object

```javascript
export const darkChartTheme = {
  color: [
    '#2db5a8', '#e07060', '#8b7ef0', '#e0a620', '#34c772',
    '#e070a8', '#6aa0e0', '#a0c850', '#d07090', '#5ec0aa'
  ],
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: "'Inter', system-ui, sans-serif",
    color: '#a8a39c'
  },
  title: {
    textStyle: {
      color: '#e8e5e0',
      fontSize: 15,
      fontWeight: 600
    },
    subtextStyle: {
      color: '#7a7e86',
      fontSize: 11
    }
  },
  legend: {
    textStyle: {
      color: '#a8a39c',
      fontSize: 11
    },
    itemWidth: 12,
    itemHeight: 8,
    itemGap: 16
  },
  tooltip: {
    backgroundColor: '#22262f',
    borderColor: '#383c44',
    borderWidth: 1,
    textStyle: {
      color: '#e8e5e0',
      fontSize: 12,
      fontFamily: "'Inter', system-ui, sans-serif"
    },
    extraCssText: 'border-radius: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.3);'
  },
  xAxis: {
    axisLine: { lineStyle: { color: '#383c44' } },
    axisTick: { lineStyle: { color: '#383c44' } },
    axisLabel: {
      color: '#7a7e86',
      fontSize: 11,
      fontFamily: "'Inter', system-ui, sans-serif"
    },
    splitLine: { lineStyle: { color: '#282c33', type: 'dashed' } }
  },
  yAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: '#7a7e86',
      fontSize: 11,
      fontFamily: "'Inter', system-ui, sans-serif"
    },
    splitLine: { lineStyle: { color: '#282c33', type: 'dashed' } }
  },
  grid: {
    left: 8,
    right: 8,
    top: 40,
    bottom: 8,
    containLabel: true
  },
  line: {
    symbolSize: 4,
    lineStyle: { width: 2 }
  },
  bar: {
    barMaxWidth: 32,
    itemStyle: { borderRadius: [2, 2, 0, 0] }
  }
};
```

---

## 6. Tailwind v4 CSS Configuration

This goes in `src/app.css`. Tailwind v4 uses CSS-native configuration with `@theme` and CSS custom properties.

```css
@import "tailwindcss";

/* ============================================================
   FONTS
   ============================================================ */

/* Inter variable (full OpenType features, from official source) */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('https://rsms.me/inter/font-files/InterVariable.woff2') format('woff2');
}

@font-face {
  font-family: 'Inter';
  font-style: italic;
  font-weight: 100 900;
  font-display: swap;
  src: url('https://rsms.me/inter/font-files/InterVariable-Italic.woff2') format('woff2');
}

/* Geist Mono (for code/IDs) - install via npm: npm i geist */
/* Or load from CDN. For now, fallback to system monospace. */

/* ============================================================
   THEME TOKENS
   ============================================================ */

@theme {
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
}

/* ============================================================
   LIGHT MODE (default)
   ============================================================ */

:root {
  /* Surfaces */
  --surface-0: #faf9f7;
  --surface-1: #ffffff;
  --surface-2: #f3f1ee;
  --surface-3: #e8e5df;

  /* Borders */
  --border: #d6d2cb;
  --border-muted: #e2dfda;

  /* Text */
  --text-primary: #1c1a17;
  --text-secondary: #6b6660;
  --text-tertiary: #948f88;
  --text-disabled: #b5b1ab;

  /* Accent (teal) */
  --accent: #0d7d7d;
  --accent-hover: #096a6b;
  --accent-muted: #e0f2f1;
  --accent-text: #0a6565;

  /* Semantic */
  --positive: #1a8a4a;
  --positive-muted: #e4f5ec;
  --negative: #c53d2f;
  --negative-muted: #fce8e5;
  --warning: #c48a00;
  --warning-muted: #fef3d6;
  --neutral: #918c85;

  /* Chart palette */
  --chart-1: #0d7d7d;
  --chart-2: #c53d2f;
  --chart-3: #6b5ce7;
  --chart-4: #c48a00;
  --chart-5: #1a8a4a;
  --chart-6: #c44e8a;
  --chart-7: #4a82c4;
  --chart-8: #7da82e;
  --chart-9: #b04e6e;
  --chart-10: #3e9a8a;
}

/* ============================================================
   DARK MODE (Power Mode)
   ============================================================ */

@custom-variant dark (&:where(.dark, .dark *));

.dark {
  /* Surfaces */
  --surface-0: #111318;
  --surface-1: #191c23;
  --surface-2: #22262f;
  --surface-3: #2d3139;

  /* Borders */
  --border: #383c44;
  --border-muted: #282c33;

  /* Text */
  --text-primary: #e8e5e0;
  --text-secondary: #a8a39c;
  --text-tertiary: #7a7e86;
  --text-disabled: #555961;

  /* Accent (teal, lifted) */
  --accent: #2db5a8;
  --accent-hover: #3fc8ba;
  --accent-muted: #1a3535;
  --accent-text: #2db5a8;

  /* Semantic */
  --positive: #34c772;
  --positive-muted: #142e1f;
  --negative: #e85c4a;
  --negative-muted: #301a17;
  --warning: #e0a620;
  --warning-muted: #302810;
  --neutral: #7a7e86;

  /* Chart palette (lifted lightness) */
  --chart-1: #2db5a8;
  --chart-2: #e07060;
  --chart-3: #8b7ef0;
  --chart-4: #e0a620;
  --chart-5: #34c772;
  --chart-6: #e070a8;
  --chart-7: #6aa0e0;
  --chart-8: #a0c850;
  --chart-9: #d07090;
  --chart-10: #5ec0aa;
}

/* ============================================================
   BASE STYLES
   ============================================================ */

html {
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  font-feature-settings: "cv01" 1, "cv02" 1;  /* Inter alternates for cleaner a, G */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  background-color: var(--surface-0);
  color: var(--text-primary);
}

/* Tabular figures utility - apply to all number-heavy elements */
.tabular-nums {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}

/* All table cells with numbers should be tabular by default */
td[class*="text-right"],
th[class*="text-right"] {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}

/* Focus ring style (consistent across all interactive elements) */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Selection */
::selection {
  background-color: var(--accent-muted);
  color: var(--text-primary);
}

/* Scrollbar styling for dark mode */
.dark ::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.dark ::-webkit-scrollbar-track {
  background: var(--surface-0);
}

.dark ::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}

.dark ::-webkit-scrollbar-thumb:hover {
  background: var(--text-disabled);
}
```

---

## 7. Before/After: Specific Class Changes

### Layout (`+layout.svelte`)

```diff
- <div class="min-h-screen bg-gray-50 flex flex-col">
+ <div class="min-h-screen bg-[--surface-0] flex flex-col">

- <nav class="bg-slate-800 text-white">
-   <div class="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1">
-     <a href="/" class="text-lg font-semibold tracking-tight">Bank Data Explorer</a>
+ <nav class="bg-[--surface-1] border-b border-[--border]">
+   <div class="max-w-[1400px] mx-auto px-4 h-11 flex items-center gap-6">
+     <a href="/" class="text-[15px] font-semibold tracking-tight text-[--text-primary] flex items-center gap-1.5">
+       <span class="text-[--accent] font-bold">BDE</span>
+       <span class="hidden sm:inline text-[13px] font-normal text-[--text-secondary]">Bank Data Explorer</span>
+     </a>

-     <div class="flex items-center gap-x-5 text-sm">
-       <a href="/banks" class="text-slate-200 hover:text-white transition-colors">Banks</a>
-       <a href="/industry" class="text-slate-400 hover:text-slate-300 transition-colors">Industry</a>
+     <div class="flex items-center gap-5 text-[13px] font-medium">
+       <a href="/banks" class="text-[--text-secondary] hover:text-[--text-primary] transition-colors">Banks</a>
+       <a href="/industry" class="text-[--text-disabled] hover:text-[--text-tertiary] transition-colors">Industry</a>

- <main class="max-w-7xl mx-auto w-full px-4 py-6 flex-1">
+ <main class="max-w-[1400px] mx-auto w-full px-4 py-5 flex-1">

- <footer class="border-t border-gray-200 bg-gray-100">
-   <div class="max-w-7xl mx-auto px-4 py-6 text-center text-xs text-gray-400 space-y-1">
+ <footer class="border-t border-[--border] bg-[--surface-2]">
+   <div class="max-w-[1400px] mx-auto px-4 py-4 text-center text-[11px] text-[--text-tertiary] space-y-0.5">
```

### Landing Page (`+page.svelte`)

```diff
- <h1 class="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
+ <h1 class="text-2xl font-semibold tracking-tight text-[--text-primary]">

- <p class="mx-auto mt-4 max-w-xl text-lg text-gray-500">
+ <p class="mx-auto mt-2 max-w-xl text-[15px] text-[--text-secondary]">

- <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
+ <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">

- <p class="mb-2 text-center text-sm font-medium text-gray-600">Find a bank</p>
+ <p class="mb-1.5 text-center text-[13px] font-medium text-[--text-tertiary]">Find a bank</p>

- <a class="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800">
+ <a class="inline-flex items-center gap-1 text-[13px] font-medium text-[--accent] hover:text-[--accent-hover]">
```

### MetricCard

```diff
- <div class="rounded-lg border border-gray-200 bg-white px-4 py-4">
-   <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
-   <p class="mt-1 text-2xl font-bold text-gray-900">{value}</p>
-   <p class="mt-0.5 text-xs text-gray-400">{sublabel}</p>
+ <div class="rounded border border-[--border] bg-[--surface-1] px-3 py-3">
+   <p class="text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">{label}</p>
+   <p class="mt-0.5 text-xl font-semibold text-[--text-primary] tabular-nums">{value}</p>
+   <p class="mt-0.5 text-[11px] text-[--text-tertiary]">{sublabel}</p>
```

### DataTable

```diff
- <div class="overflow-x-auto rounded-lg border border-gray-200">
-   <table class="min-w-full divide-y divide-gray-200">
-     <thead class="bg-gray-50">
-       <th class="px-4 py-3 text-xs font-medium tracking-wider text-gray-500 uppercase
-                  {col.sortable ? 'cursor-pointer select-none hover:bg-gray-100' : ''}">
+ <div class="overflow-x-auto rounded border border-[--border]">
+   <table class="min-w-full text-[13px]">
+     <thead class="bg-[--surface-2] border-b border-[--border]">
+       <th class="px-3 py-2 text-[11px] font-medium tracking-wider text-[--text-tertiary] uppercase
+                  {col.sortable ? 'cursor-pointer select-none hover:text-[--text-secondary] transition-colors' : ''}">

-     <tbody class="divide-y divide-gray-200 bg-white">
-       <tr class="{onrowclick ? 'cursor-pointer hover:bg-gray-50' : ''}">
-         <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-700
+ 	  <tbody class="divide-y divide-[--border-muted] bg-[--surface-1]">
+       <tr class="{onrowclick ? 'cursor-pointer hover:bg-[--surface-2] transition-colors duration-75' : ''}">
+         <td class="whitespace-nowrap px-3 py-1.5 text-[--text-secondary]
+                    {col.align === 'right' ? 'text-right tabular-nums' : 'text-left'}">
```

### SearchBar

```diff
- <input class="block w-full rounded-lg border border-gray-300 bg-white py-2 pr-10 pl-10 text-sm
-               text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500
-               focus:outline-none">
+ <input class="block w-full rounded border border-[--border] bg-[--surface-1] py-2 pr-9 pl-9
+               text-[14px] text-[--text-primary] placeholder:text-[--text-disabled]
+               focus:border-[--accent] focus:ring-1 focus:ring-[--accent]/30 focus:outline-none
+               transition-colors">
```

### Pagination

```diff
- <p class="text-sm text-gray-600">
+ <p class="text-[13px] text-[--text-secondary] tabular-nums">

- <button class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium
-                text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">
+ <button class="rounded border border-[--border] bg-[--surface-1] px-2.5 py-1
+                text-[13px] font-medium text-[--text-secondary]
+                hover:bg-[--surface-2] hover:text-[--text-primary]
+                disabled:cursor-not-allowed disabled:opacity-40 transition-colors">
```

### Bank Detail Status Badges

```diff
- <span class="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium
-              text-green-700 ring-1 ring-inset ring-green-600/20">Active</span>
+ <span class="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium tracking-wide
+              bg-[--positive-muted] text-[--positive]">Active</span>

- <span class="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium
-              text-red-700 ring-1 ring-inset ring-red-600/20">Inactive</span>
+ <span class="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium tracking-wide
+              bg-[--negative-muted] text-[--negative]">Inactive</span>
```

---

## 8. Distinctive Touches

Things that make this feel like a PURPOSE-BUILT financial tool:

### 8.1 Sparklines in Table Rows

When we have time-series data, embed tiny inline sparklines (32x16px) in table rows next to the current value. Use `<canvas>` or inline SVG. This is the #1 thing that separates financial tools from generic dashboards.

```html
<td class="px-3 py-1.5 text-right">
  <div class="inline-flex items-center gap-2">
    <!-- Tiny sparkline: last 8 quarters -->
    <svg class="w-8 h-4 text-[--accent]" viewBox="0 0 32 16">
      <polyline points="0,12 4,10 8,8 12,11 16,6 20,4 24,5 28,2 32,3"
                fill="none" stroke="currentColor" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span class="tabular-nums text-[--text-secondary]">$3.4T</span>
  </div>
</td>
```

### 8.2 Color-Coded Metric Values

Metrics like ROA, NIM, NPL ratio should show semantic color based on their value relative to benchmarks:

```html
<!-- Good ROA (above 1%) -->
<p class="text-xl font-semibold text-[--positive] tabular-nums">1.24%</p>

<!-- Bad NPL ratio (above 3%) -->
<p class="text-xl font-semibold text-[--negative] tabular-nums">4.12%</p>

<!-- Neutral / in-range -->
<p class="text-xl font-semibold text-[--text-primary] tabular-nums">0.85%</p>
```

### 8.3 Hover Data Cards

On hover over a metric card, subtly reveal additional context (peer comparison, quartile position). Use CSS transitions, no JS needed:

```html
<div class="group rounded border border-[--border] bg-[--surface-1] px-3 py-3 transition-colors
            hover:border-[--accent]/30">
  <p class="text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">ROA</p>
  <p class="mt-0.5 text-xl font-semibold text-[--text-primary] tabular-nums">1.24%</p>
  <!-- Reveal on hover -->
  <div class="mt-1 max-h-0 overflow-hidden opacity-0 transition-all duration-200
              group-hover:max-h-8 group-hover:opacity-100">
    <p class="text-[11px] text-[--text-tertiary]">
      <span class="text-[--positive]">78th percentile</span> vs peers
    </p>
  </div>
</div>
```

### 8.4 Section Accent Bars

Left-border accent marks on section headers (Bloomberg does this with colored bars to categorize data sections):

```html
<div class="flex items-center gap-2 mb-3">
  <div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
  <h2 class="text-[15px] font-semibold text-[--text-primary]">Key Metrics</h2>
</div>
```

### 8.5 Keyboard Shortcuts (Power Mode)

Display keyboard shortcut hints in power mode:

```html
<button class="group ...">
  Search
  <kbd class="hidden group-hover:inline ml-1.5 text-[10px] font-mono text-[--text-disabled]
              border border-[--border] rounded px-1 py-0.5">/</kbd>
</button>
```

### 8.6 Dense Grid for Key Metrics

Instead of the typical 4-column grid with generous gaps, use a tighter grid with visual separators:

```html
<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-px bg-[--border-muted] rounded border border-[--border] overflow-hidden">
  <!-- Each metric is a cell separated by 1px "gutters" via gap-px + parent bg color trick -->
  <div class="bg-[--surface-1] px-3 py-3">
    <p class="text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Assets</p>
    <p class="mt-0.5 text-lg font-semibold text-[--text-primary] tabular-nums">$3.4T</p>
  </div>
  <div class="bg-[--surface-1] px-3 py-3">
    <!-- ... next metric ... -->
  </div>
</div>
```

This creates a "grid with divider lines" look (like a Bloomberg data panel) instead of floating cards.

---

## 9. Mode Toggle: Accessible vs Power

### How it works

- **Accessible mode** (default): Light background, more spacing, friendlier text sizes, rounded-sm corners, tooltips explain abbreviations.
- **Power mode**: Dark background, tighter spacing, smaller text allowed, more data density, keyboard shortcuts visible, abbreviations shown without tooltips.

### Implementation

Toggle the `.dark` class on `<html>` (or a wrapping div). The CSS variables handle the color swap. For spacing/density changes:

```css
/* Power mode density adjustments */
.dark .dense-table td {
  padding-top: 0.25rem;    /* 4px instead of 6px */
  padding-bottom: 0.25rem;
  font-size: 0.75rem;      /* 12px instead of 13px */
}

.dark .dense-grid {
  gap: 1px;
}
```

**Should power mode default to dark?** Yes. Strongly yes. Every serious financial tool (Bloomberg, Koyfin, TradingView) defaults dark for power users. Dark backgrounds reduce eye strain during extended data analysis sessions. The association is deeply ingrained: dark = professional tool, light = consumer app. Let users override, but default dark for power mode.

### Toggle UI

A simple segmented control in the nav:

```html
<div class="flex rounded border border-[--border] overflow-hidden text-[11px] font-medium">
  <button class="px-2.5 py-1 bg-[--accent] text-white">Simple</button>
  <button class="px-2.5 py-1 text-[--text-tertiary] hover:text-[--text-primary] transition-colors">Power</button>
</div>
```

---

## 10. Implementation Priority

1. **Phase 1 (do now):** Update `app.css` with the full token system. Update `+layout.svelte` (nav, footer, page background). This touches everything immediately.

2. **Phase 2 (next):** Update MetricCard, DataTable, Pagination, SearchBar components. Add `tabular-nums` everywhere.

3. **Phase 3:** Add dark mode toggle. Wire up `.dark` class toggling with localStorage persistence.

4. **Phase 4:** Enhanced MetricCard with trend indicators, sparklines. Chart theming when ECharts is added.

5. **Phase 5:** Power mode density adjustments. Keyboard shortcuts. Hover reveals.

---

## Appendix: Why Not Blue?

Every banking app, every fintech dashboard, every "trust and security" brand guide says blue. Chase is blue. Capital One is blue. Plaid is blue. Your bank's app is blue. FRED is blue.

That's exactly why we don't use it.

Teal occupies a unique space: it reads as analytical and precise (close to blue's trust connotation) while being visually distinct from every other banking product. It pairs naturally with amber/gold for warnings and warm neutrals for depth. On a dark background, teal glows in a way that blue doesn't... it feels more alive, more technical, like a terminal cursor or a healthy status indicator.

The warm neutral backgrounds (instead of cool grays) add another layer of distinction. Cool gray + blue = generic SaaS. Warm stone + teal = "this was designed by someone who thinks about these things."
