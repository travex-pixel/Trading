# EdgeLab design system

Documented from the built product (November 2026). Tokens live in `src/app/globals.css` and components in `src/components/ui`.

## World

An engineering drawing set for traders: a dark sheet, warm ink, hairline rules, measured annotations. Every result carries a provenance plate (dataset · version · market · period · costs · fills) like a drawing's title block, and charts use dimension lines for drawdowns and in-sample/out-of-sample walls. The world lends type, palette, density and that one signature move. Navigation and controls are standard web components.

Scene: a trader at a desk in the evening on a phone and a laptop. Dark by default, with no light theme shipped.

## Colour

| Token | Value | Role |
|---|---|---|
| `--ground` | `#0c0d10` | page |
| `--panel` | `#121317` | panels, tables, rail |
| `--raised` | `#17181d` | inputs, active rows |
| `--hover` | `#1c1d23` | hover |
| `--hairline` | `#1f2026` | rules between rows and panels |
| `--border` | `#2a2b32` / `--border-strong` `#3a3b44` | control borders |
| `--ink` | `#ece9e2` | primary text (warm off-white) |
| `--ink-2` | `#a9a69f` | secondary text |
| `--ink-3` | `#74726c` | labels, meta |
| `--ink-4` | `#4e4d49` | placeholders, tick marks |
| `--annot` | `#7aa2d6` | selection, focus ring, dimension lines, callouts, primary tint |
| `--up` | `#3ecf8e` | positive signed performance only |
| `--down` | `#f0716a` | negative signed performance only |
| `--warn` | `#e0a84a` | caution, demo-data label, simulated badge |
| `--series-1..5` | `#3987e5 #d95926 #199e70 #c98500 #d55181` | categorical series (validated for the dark surface, fixed order) |
| `--series-muted` | `#6b6a66` | benchmarks |

Rules: emerald and red never mean anything but signed performance, and colour never carries meaning alone (a sign and a label accompany it). Text never wears a series colour. Identity comes from a swatch or line key beside it.

## Type

- UI and headings: **Schibsted Grotesk** (400–700), tight tracking (`-0.01em` headings).
- Figures, tickers, timestamps, table cells with numbers: **Sometype Mono** via `.num` (tabular) or `.num-hero` (proportional, for the one hero figure per view).
- Ramp (px): 11 (`text-2xs`, meta and plates), 12, 13 (tables), 15 (body), 18, 22 (page titles), 28, 38 and 56 (hero figures only).
- Body measure ≤ 62ch, with `text-wrap: pretty` on paragraphs and `balance` on headings.

## Space and shape

- 4px base and 8px rhythm. Panel padding 16px (`px-4 py-3.5`), page gutter 16px on mobile and 32px on desktop, content max 1320px.
- Radii: 6px small (badges, chips), 10px medium (panels, buttons, inputs), 14px large (dialogs and sheets). Nothing larger.
- Depth: flat panels with hairline borders, with shadows only on dialogs and the floating mobile action (offset + soft blur, neutral).
- Tables are ruled (hairlines), numeric columns right-aligned mono, secondary columns hidden under `sm:`/`md:` on phones.

## Components

- **Panel / PanelHeader / PanelBody**: the only container. Never nested.
- **Stat**: label over mono value. `size="lg"` is the hero figure (one per view).
- **ProvenancePlate**: the signature move, under every chart and result.
- **Badge** (neutral, up, down, warn, annot, muted) and **SimulatedBadge**; **VerdictBadge** for edge verdicts.
- **Button** (primary = ink on ground with a hairline top highlight, secondary = raised with border, ghost, annot, danger). Heights 36, 40 and 48px, with 48px (`size="lg"`) for anything a thumb hits. Buttons press in by 2% on tap.
- **Field / Select / Input / NumberField (slider + exact input) / Segmented**: native controls in the house material, 40px tall. Segmented is a recessed track with a raised selected segment, in the iOS manner.
- **Icons**: Phosphor, regular weight at 16 to 18px in text and controls, filled weight for the active navigation item. Phone tab bar icons are 26px with 10px labels.
- **InstrumentPicker + MarketSelector**: market segmented control over a searchable listbox showing ticker · name · exchange · currency.
- **EquityChart** (SVG, with hover crosshair, dimension-line drawdown, walls and shaded test windows), **PriceChart** (lightweight-charts, with indicators, markers, price lines and progressive reveal), **Sparkline**.

## Motion

One authored moment: `quiz-in` (360ms, `--ease-out-quart`) when a question or result settles. Everything else is colour transition at 150ms. Content is visible by default, and `prefers-reduced-motion` disables all motion.

## Copy

Plain English first ("the biggest fall from a previous high"), then the term. Controls name their action. Every simulated figure says simulated, and every demo figure says demo. No marketing adjectives, no kickers above headings, no em-dash cadence.

## Navigation

Phone: bottom bar with Home, Markets, Strategies, Arena, Portfolio (64px tall, safe-area aware, filled icon and tinted label on the active tab); Replay, Journal and Today's Five are reached from Home and the Lab. Desktop: 220px left rail with all eight destinations. Primary action on Home is a fixed button above the tab bar on phones and a header button on desktop.
