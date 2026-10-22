---
name: Agentic Storefront
description: A warm paper, conversation-first storefront starter with a persistent product stage.
colors:
  paper: "#f7f4ee"
  white: "#fff"
  ink: "#292720"
  muted: "#686257"
  accent: "#65523b"
  accent-hover: "#433523"
  line: "#ded8cd"
  tint: "#eee8dd"
typography:
  display:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "32px"
    fontWeight: 780
    lineHeight: 1
    letterSpacing: "-1.5px"
  headline:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "clamp(32px, 3.3vw, 46px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-.04em"
  title:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "20px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-.025em"
  body:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "15px"
    fontWeight: 450
    lineHeight: 1.85
  body-base:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "16px"
    fontWeight: 450
    lineHeight: 1.6
  label:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "13px"
    fontWeight: 650
    lineHeight: 1.6
rounded:
  control-small: "7px"
  chip: "8px"
  button: "9px"
  toolbar: "10px"
  bubble: "12px"
  dialog: "14px"
  composer: "16px"
spacing:
  tight: "8px"
  control: "12px"
  group: "16px"
  section: "24px"
  pane: "36px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "12px 18px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "12px 16px"
  suggestion-chip:
    textColor: "{colors.accent-hover}"
    rounded: "{rounded.chip}"
    padding: "7px 11px"
  composer:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.composer}"
    padding: "12px"
  user-message:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.bubble}"
    padding: "13px 17px"
  cart-navigation:
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "10px 15px"
---

# Design System: Agentic Storefront

## Overview

**Creative North Star: "The Warm Paper Storefront"**

Agentic Storefront inherits a warm paper surface, brown controls, and self-hosted Manrope. Large, tightly spaced headings provide the visual emphasis; generous prose leading and restrained dividers keep the shopping conversation readable. The sample merchant Studio, guide Alex, and product Studio Mount are fictional content for this reusable starter.

The visual stage and conversation share one quiet frame. Product inspection, imagery, and cart information occupy the stage while the conversation retains its own space. Material comes from warm tonal surfaces and imagery rather than decorative interface effects.

**Key Characteristics:**
- Warm paper and brown action colors.
- One self-hosted variable type family with weight and scale doing the work.
- A product stage beside the conversation on desktop, stacked above it on mobile.
- Flat working surfaces, gently rounded controls, and explicit focus states.

## Colors

The palette is a warm neutral field with one brown action family. Frontmatter values are normative and mirror the reused root CSS properties.

### Primary
- **Warm Brown** (`accent`): primary actions, emphasized heading words, speaker names, active controls, and focus indicators.
- **Deep Brown** (`accent-hover`): primary hover treatment and stronger action text.

### Neutral
- **Warm Paper** (`paper`): application background, conversation, dialogs, and selected stage tools.
- **Input White** (`white`): composer and small product-image surfaces; primary button text.
- **Charcoal Ink** (`ink`): headings and main text.
- **Quiet Brown-Grey** (`muted`): descriptions, controls at rest, and supporting information.
- **Paper Edge** (`line`): panel separators, input outlines, rules, and section boundaries.
- **Warm Tint** (`tint`): visual stage, user bubbles, and quiet hover fills.

**The Paper and Ink Rule.** Use paper for the conversation and tint for working stages; reserve white for inputs and small product-image surfaces. Brown carries actionable emphasis.

Error notices have a localized pale warm fill and dark rust text in the implementation. They are feedback styling rather than a second brand accent. The sidecar’s tonal ramps are synthesized previews for inspection; they are not additional application color tokens.

## Typography

**Display Font:** Manrope Variable, sans-serif fallback.  
**Body Font:** Manrope Variable, sans-serif fallback. The app bundles the font through its local font package.

**Character:** Rounded, readable sans-serif shapes with compact headline tracking. A single family connects the wordmark, conversational prose, and compact controls.

### Hierarchy
- **Display:** the wordmark uses the display token; its mobile size is (26px). It is an identity treatment, not a general heading style.
- **Headline:** the intro uses the headline token. At the middle breakpoint it resolves to (36px); on mobile it uses (32px). Product headings use a related (28–44px) clamp, and cart headings use a (30–45px) clamp, both at weight (600).
- **Title:** the intro’s supporting section uses the title token; panel headings use a related (23px), weight (650) treatment.
- **Body:** assistant messages use the body token with a (72ch) maximum width. Intro prose uses (15px) with leading (1.8) and a (49ch) measure. User bubbles use (14px) with leading (1.7).
- **Body base:** root copy and form text use the body-base token. The composer remains (16px) on mobile.
- **Label:** primary controls use the label token. Supporting controls and metadata use (10–12px); speaker names are (11px), weight (750). These compact roles are not heading styles.

**The Single Family Rule.** Use Manrope throughout the storefront. Build hierarchy through the observed weight, size, and tracking relationships.

## Layout

The desktop shell fills (100dvh) with a minimum height of (560px). An (84px) header sits over a two-column grid: the stage takes (1.1fr), the conversation (.9fr) with a (400px) minimum. The conversation owns an independently scrolling message region and a composer dock below it. The stage has its own overflow for product and cart content; it does not cover the conversation.

At widths of at least (1500px), the grid becomes (1.2fr / .8fr) and the conversation minimum is (460px). At (1100px) and below, the columns become equal with a (380px) conversation minimum, and pane padding reduces. At (760px) and below, the shell becomes a vertical document: the (65px) header is sticky, the visual stage precedes the conversation, messages use normal page overflow, and the composer stays in document flow with bottom safe-area padding. Product and cart states retain their content rather than becoming modal overlays. An explicit return-to-conversation control appears in the mobile cart.

Shared spacing values in the frontmatter describe observed repetitions, not a rigid multiplication scale. Desktop messages use (30px 36px 14px), the product stage uses (24px 32px 26px), and the cart uses (28px 36px). On mobile these settle around (24px) horizontal content gutters and (16px) composer gutters. Narrow adjustments at (380px) and (360px) reduce product and header spacing.

The inspiration view is an intentional full-bleed exception: its stage has no padding or corner rounding, and imagery fills the available pane with a bottom tonal overlay. Mobile introduction imagery is (210px) tall; subsequent inspiration imagery uses a responsive height clamp. Product imagery is contained to preserve the object, and the interactive model has its own compact control strip.

## Elevation & Depth

Main surfaces are flat and differentiated by paper/tint values and fine borders. Imagery and product geometry provide most of the depth. Temporary floating surfaces use soft ambient shadows; the photographic caption uses a dark transparent gradient for legibility.

### Shadow Vocabulary
- **Rendering notice:** `0 8px 30px #29272020` for the temporary rendering overlay.
- **Settings panel:** `0 14px 40px #29272026` for the floating settings panel.
- **Walkthrough dialog:** `0 24px 80px #211a1266` for the large centered demonstration dialog.

**The Quiet Surface Rule.** Keep the main panels flat. Reserve the existing ambient shadows for temporary floating surfaces.

## Shapes

Controls use gentle rectangular rounding, with the frontmatter recording the observed steps. Small tools and chips occupy the smaller steps; buttons share the button step; message bubbles and settings panels share the bubble step; the composer has the largest routine corner. Dialogs use the dialog step. The inspiration photograph remains square to the outer frame.

Fine solid borders separate controls and sections. Quantity controls clip their grouped buttons inside one rounded outline. Cart counts and voice-status indicators are circular. These circles are functional counters and status marks, not the default silhouette for buttons.

## Components

### Buttons

Compact and confident, with sentence-case labels and inline SVG icons. Primary buttons use the frontmatter assignment, a minimum height of (48px), and deep brown on hover. Intro primary actions are (52px) tall. Secondary buttons use a fine line-colored border and a minimum height of (44px); their hover fill is tint where implemented. Icon buttons are typically (44px) square with muted text at rest and tint on hover. The send control is a filled brown square, (42px) on desktop and (38px) on mobile.

The shared keyboard focus indicator is a (3px) brown outline offset by (4px). Disabled controls reduce opacity; the disabled send control instead uses tint and muted icon color. Preserve semantic disabled or pressed attributes alongside the visual states.

### Chips

Suggestion chips have a fine line border, compact (11px) type, the chip corner token, and a (36px) minimum height. Hover adds tint. Product angle controls are a separate tab-like pattern: a (44px) minimum height, a brown bottom border and stronger weight when pressed, with a paper hover fill.

### Cards / Containers

User messages are tinted bubbles, right aligned, sized to content up to (90%) of the message area. Assistant messages remain on the paper surface. Product offers use a small contained illustration beside text; larger product and cart content is separated with rules instead of enclosed in independent elevated cards.

### Inputs / Fields

The composer is white with a fine line border and the composer corner token. Its textarea is borderless and transparent, with (16px) text, a brown caret, and muted placeholder text. The container gains a (2px) brown outline offset by (2px) on focus within. Textarea height starts at (55px), with a (150px) maximum; mobile starts at (46px), with smaller container padding.

The action row groups attachment and optional voice controls on the left and the send control on the right. Supporting helper text sits below the input rather than inside the text area.

### Navigation

The quiet header combines the Studio wordmark, optional contextual text, source link, utility controls, and an outlined cart trigger with a circular brown count. The mobile header hides the contextual tagline and cart text while retaining the cart icon, count, and accessible name. It remains sticky during document scrolling.

### Product and Cart Stage

The product stage combines a heading, contained image or interactive model, compact grouped controls, caption, and ruled demonstration action. Selected tools gain paper fill or a bottom border. Quantity steppers use (44px) buttons and tabular numerals. The cart’s subtotal aligns label and amount on a shared baseline; its full-width primary action remains visually distinct from the smaller underlined remove and refresh actions.

### Motion and Dialogs

Controls transition background and text color over (.18s). Loading indicators rotate over (1.2s), and the voice indicator pulses over (.8s). The sample walkthrough rotates its illustration with a (.6s) transition. Reduced-motion preferences disable these animations and transitions. Dialog backdrops use transparent ink; the demonstration backdrop is stronger than the standard dialog backdrop.

## Do's and Don'ts

### Do:
- **Do** preserve the warm paper, brown accent, and Manrope relationship when adapting merchant content.
- **Do** keep the visual stage and conversation independently readable at desktop widths and stack them at the mobile breakpoint.
- **Do** keep icons as inline SVG controls, with accessible labels and visible keyboard focus.
- **Do** use tabular numerals for quantity, price, and totals.
- **Do** retain reduced-motion behavior and the mobile composer’s readable text size.

### Don't:
- **Don't** replace the working panels with a grid of elevated cards.
- **Don't** use brown text alone to communicate selected controls; preserve the existing fill, underline, or pressed-state treatment.
- **Don't** introduce a second display family or all-caps heading system.
- **Don't** add decorative eyebrow labels above headings; progress counts and speaker names are functional labels, not heading decoration.
