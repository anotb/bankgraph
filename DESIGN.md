---
name: Bankgraph
description: A public analytical instrument for U.S. banks. One board, four shared anchors, one time ruler, the same state for a person and an agent.
colors:
  bench-bg: "#eef1f5"
  plate: "#ffffff"
  plate-recessed: "#f5f7fa"
  plate-deep: "#e9edf2"
  ink: "#111827"
  ink-2: "#4b5565"
  ink-3: "#6c7787"
  rule: "#dce1e8"
  rule-2: "#ebeef3"
  accent: "#2456e6"
  favorable: "#157a4a"
  adverse: "#c7381f"
  caution: "#b7791f"
  night-bg: "#0e1218"
  night-plate: "#161b23"
  night-ink: "#e8ecf2"
  night-accent: "#6c8cff"
typography:
  question:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  control:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "normal"
  label:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.04em"
  figure:
    fontFamily: "Geist Mono Variable, Geist Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  statement:
    fontFamily: "Geist Mono Variable, Geist Mono, ui-monospace, monospace"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.02em"
rounded:
  plate: "4px"
  control: "4px"
  overlay: "6px"
  dot: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "20px"
components:
  plate:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "12px 14px"
  chip:
    backgroundColor: "{colors.plate-recessed}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 9px"
    height: "26px"
  chip-active:
    backgroundColor: "rgb(36 86 230 / 0.10)"
    textColor: "{colors.accent}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 9px"
    height: "26px"
  button:
    backgroundColor: "{colors.plate-recessed}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "28px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "28px"
  statement:
    backgroundColor: "{colors.plate-recessed}"
    textColor: "{colors.ink}"
    typography: "{typography.statement}"
    rounded: "{rounded.control}"
    padding: "8px 10px 6px"
  table-cell:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
    rounded: "0px"
    padding: "0 8px"
    height: "32px"
---

# Design System: Bankgraph

## Overview

**Creative North Star: "The Bench"**

Bankgraph is an instrument, not a publication. A cool neutral work surface carries analytical plates: tonal regions, each holding one chart or table, its title, and the controls that appear when you work on it. Plates sit in rows on a twelve-column field, and rows differ in shape according to the analytical job: one investigation spanning the row, a primary chart beside a supporting distribution, two contrasts side by side, a wide table on its own row. Above the field, a single line holds the question and the board's actions; a control deck holds the four shared anchors (Banks, Cohort, Measures, Time); a time ruler with two carets sits at the bottom whenever a view has history.

Color carries data and interaction state. Containers stay neutral. One accent marks selection, focus, the as-of caret, and the primary action. Favorable and adverse colors appear only beside a sign. Series inks are assigned in selection order; cohorts are a filled band and a dotted median.

**Key characteristics:**

- Plates on a work surface, not cards on a page and not hairlines on paper
- One type family with hierarchy from weight and size; mono reserved for numerals
- Controls that look like controls: filled, bordered, 4 px radius, visible active states
- Charts and tables own their plates; method and source live behind Focus
- Day and night as two versions of the same instrument

## Colors

Day: background `#EEF1F5`, plate `#FFFFFF`, recessed `#F5F7FA`; ink `#111827`, `#4B5565`, `#6C7787`; rules `#DCE1E8`, `#EBEEF3`. Night: background `#0E1218`, plate `#161B23`, recessed `#1D232D`; ink `#E8ECF2`, `#AAB3C0`, `#7C8797`; rules `#2A323E`, `#222935`.

**The One Accent Rule.** `#2456E6` (night `#6C8CFF`) is the only interaction color: selection, focus rings, the as-of caret, active chips, and the primary action.

**The Signed Color Rule.** Favorable `#157A4A` and adverse `#C7381F` appear only beside a sign or a direction word. Neutral change is ink.

**The Neutral Container Rule.** No plate, row, or control is colored by category. Series inks belong to banks; the cohort is a band.

## Typography

Inter Variable for everything except numerals; Geist Mono for figures, axis ticks, table cells, and readouts.

- **Question** 20/650: the board's editable title.
- **Page and plate titles** 13–15/600.
- **Body** 13/400. **Control labels** 12/500. **Group labels** 11/600 uppercase, secondary ink.
- **Figures** 12 mono; **statements** 20 mono/500; **axis ticks** 11 mono.

Nothing is set below 11 px. Density is a preference (`data-density`), not a depth mode.

## Layout

Page padding 20 px (12 px on phones). Plates on a 12-column grid with 12 px gaps; rows 12 px apart. Rows collapse to single plates below 1024 px, and everything is one column below 640 px. The deck is four groups across, two by two on tablets, stacked on phones. On a board the field scrolls in its own area and the ruler sits in flow beneath it, so it never covers a plate.

**The Row Rule.** A row is the unit of composition. Its shape follows the analytical job: investigation 12; primary 8 with a support or exact reference 4; contrasts 6/6; a wide exact table takes its own row. Dragging the gutter between two plates trades columns between them, so a pair always sums to twelve.

**Two plate heights.** A plate is standard (300 px of content) or tall (560 px), chosen from its size menu; a row takes the taller of its plates, so every row reads as one line. Content scrolls inside the plate. Phones use natural height.

## Elevation

Plates are flat; tone separates them from the surface. Popovers and the focus view are the only elevated surfaces, with one shadow and a 6–8 px radius.

## Controls

Buttons 28 px, recessed fill, 1 px rule, 4 px radius; primary is accent-filled. Segmented controls are a recessed track with a raised active segment and wrap when narrow. Chips are recessed; an active measure chip is accent-washed. Plate controls (grip, size menu, Keep, Focus, More) appear on hover, focus, selection, or coarse pointers. A selected plate carries a 1 px accent outline and a 3 px accent bar at its left edge.

**The Natural Control Rule.** Controls use research language: Make primary, Place beside, Own row, Keep, Use the board selection, Focus, Move, Remove. Internal role and binding names never appear at rest.

## Charts and tables

**The Chart Rule.** A chart must show change, distribution, relationship, or contribution; exact comparison is a matrix or table. A sparkline needs a stated period, a scale, a comparison, and hover, or it is a printed number instead. One primary chart per plate by default; small multiples are an explicit mode for aligned shapes.

Focused series 2–2.25 px; others 1.25–1.5 px and muted. Cohort band filled; median dotted. Three y ticks on dotted rules; direct labels at line ends when there is room, otherwise the readout is the legend; hover values in one mono readout line inside the plate. Waterfalls only when the components reconcile to the total. Tables: 32 px rows, sticky header over a 2 px rule, mono numerals, recessed hover, accent bar and wash on the selected row, first column sticky when the table scrolls inside its plate, percentile bars 56 px.

## Motion

State changes 140 ms ease-out; plate insertion 220 ms (frame, then content); focus grows in place 180 ms; the caret moves live. Reduced motion collapses everything to opacity.

## Do's and Don'ts

- **Do** let the chart or table dominate its plate.
- **Do** say each fact once; method and source belong in Focus.
- **Do** keep day and night as designed variants, not inversions.
- **Don't** border or color containers by category.
- **Don't** use type below 11 px or gray text to solve layout problems.
- **Don't** introduce gradients, glows, glass, decorative icons, or KPI tiles.
