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
  intro-copy: "#514a3f"
  image-caption: "#fffaf2"
  collection-rule: "#cec4b4"
  detail-rule: "#d4cbbc"
  comparison-rule: "#cfc5b6"
  option-border: "#bbae98"
  quantity-border: "#bbad97"
  scrollbar: "#b9ad99"
typography:
  display:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "32px"
    fontWeight: 780
    lineHeight: 1
    letterSpacing: "-.04em"
  headline:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "clamp(32px, 3.3vw, 46px)"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-.04em"
  title:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.35
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
    lineHeight: 1.4
rounded:
  control-small: "7px"
  chip: "8px"
  button: "9px"
  toolbar: "10px"
  thumbnail: "12px"
  bubble: "14px"
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
    padding: "12px 18px"
  suggestion-chip:
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
    padding: "8px 10px"
  composer:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.composer}"
    padding: "14px"
  user-message:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.bubble}"
    padding: "14px 18px"
  cart-navigation:
    textColor: "{colors.ink}"
    rounded: "{rounded.toolbar}"
    padding: "10px 14px"
  variant-option:
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "10px 14px"
  variant-option-selected:
    backgroundColor: "{colors.paper}"
  collection-row:
    textColor: "{colors.ink}"
    padding: "24px 0"
  quantity-button:
    textColor: "{colors.ink}"
    rounded: "{rounded.control-small}"
    width: "34px"
    height: "34px"
---

# Design System: Agentic Storefront

## Overview

**Creative North Star: "The Warm Paper Storefront"**

Agentic Storefront inherits a warm paper surface, brown controls, and self-hosted Manrope. Large, tightly spaced headings provide the visual emphasis; generous prose leading and restrained dividers keep the shopping conversation readable. Fieldwork (outdoor goods, guided by Alex) and Daybreak (coffee, guided by Sam) are fictional merchant examples of the same reusable interface.

The visual stage and conversation share one quiet frame. Collections, product options, comparisons, and multi-item carts occupy the stage while the conversation retains its own space. Merchant imagery and content can change across categories; material comes from warm tonal surfaces and imagery rather than decorative interface effects. The default experience is a labeled scripted demo; optional voice, photo tools, video, and live commerce appear only when configured.

**Key Characteristics:**
- Warm paper and brown action colors.
- One self-hosted variable type family with weight and scale doing the work.
- A product stage beside the conversation on desktop, stacked above it on mobile.
- Flat working surfaces, gently rounded controls, and explicit focus states.

## Colors

The palette is a warm neutral field with one brown action family. Frontmatter values are normative; the eight inherited anchors mirror root CSS properties, while supplemental tones record repeated or semantically distinct source values.

### Primary
- **Warm Brown** (`accent`): primary actions, wordmark punctuation, speaker names, selected outlines, and keyboard focus.
- **Deep Brown** (`accent-hover`): primary hover treatment and text-action hover.

### Neutral
- **Warm Paper** (`paper`): conversation, header, dialogs, model toolbar, and selected product options.
- **Input White** (`white`): composer, settings select, and primary button text.
- **Charcoal Ink** (`ink`): headings, main text, and outlined controls.
- **Quiet Brown-Grey** (`muted`): descriptions, metadata, and supporting information.
- **Paper Edge** (`line`): panel separators, input outlines, and quiet control borders.
- **Warm Tint** (`tint`): visual stage, user bubbles, and quiet hover fills.
- **Intro Copy** (`intro-copy`): introductory and welcome prose.
- **Image Caption** (`image-caption`): light text over hero photography.
- **Collection Rule**, **Detail Rule**, and **Comparison Rule**: slightly stronger warm separators for collection rows, product facts/cart lines, and comparison tables respectively.
- **Option Border** and **Quantity Border**: outlined product choices and quantity buttons.
- **Scrollbar**: the quiet thumb shared by conversation history and comparison overflow.

**The Paper and Ink Rule.** Use paper for the conversation and tint for working stages; reserve white for inputs. Brown carries actionable emphasis.

Error notices use the ordinary line border and text treatment. Transparent overlays belong to depth styling rather than additional brand accents. The sidecar’s tonal ramps are synthesized previews for inspection; they are not additional application color tokens.

## Typography

**Display Font:** Manrope Variable, sans-serif fallback.  
**Body Font:** Manrope Variable, sans-serif fallback. The app bundles the font through its local font package.

**Character:** Rounded, readable sans-serif shapes with compact headline tracking. A single family connects merchant wordmarks, conversational prose, and compact controls.

### Hierarchy
- **Display:** the merchant wordmark uses the display token; its mobile size is (26px). It is an identity treatment, not a general heading style.
- **Headline:** the intro uses the headline token. At the middle breakpoint it resolves to (36px); on mobile it uses (32px). Stage headings use (40px), weight (650), leading (1.2), reducing to (29px) on mobile. Welcome headings use (36px), reducing to (29px).
- **Title:** the introduction’s supporting section uses the title token, reducing to (19px) on mobile. Collection titles use (21px), then (19px) at the middle breakpoint and (18px) on mobile. Cart line titles use (18px), then (17px) on mobile.
- **Body:** messages use the body token with a (68ch) maximum width. Intro prose uses the same size and leading with a (60ch) measure. Mobile messages and intro prose use (14px), leading (1.8).
- **Body base:** root copy uses the body-base token. Composer text uses (15px) on desktop and (16px) on mobile, both with leading (1.6).
- **Label:** primary controls use the label token. Supporting controls and metadata use (10–13px); speaker names are (11px), weight (750). These compact roles are not heading styles.

**The Single Family Rule.** Use Manrope throughout the storefront. Build hierarchy through the observed weight, size, and tracking relationships.

## Layout

The desktop shell fills (100dvh). An (84px) header sits over a two-column grid: the stage takes (1.1fr), the conversation (.9fr) with a (400px) minimum. The conversation owns an independently scrolling message region and a composer dock below it. The stage has its own overflow for collections, products, comparisons, and carts.

At widths of at least (1500px), the grid becomes (1.2fr / .8fr) and the conversation minimum is (460px). At (1100px) and below, the columns become equal with a (380px) conversation minimum. At (760px) and below, the shell becomes a vertical document: the (65px) header is sticky, the visual stage precedes the conversation, messages use normal page overflow, and the composer stays in document flow with bottom safe-area padding. Product and cart content extend the page. Explicit Cart and message presentation controls such as “View this” or “View cart” scroll the stage into view below the sticky header. Closing the cart switches the stage to the collection; the conversation remains below, reached by normal document scrolling or the keyboard skip link.

Shared spacing values describe observed repetitions, not a rigid multiplication scale. Desktop messages use (32px 36px 18px), introductory messages use (44px), the visual stage uses (30px 36px), and the composer dock uses (10px 30px 22px). The middle breakpoint reduces stage padding to (26px). On mobile, the stage uses (22px 24px), messages (28px 24px 18px), and the composer dock (16px) horizontal gutters. The (360px) breakpoint tightens the header and hides its mode label.

The introduction photograph is full bleed and square to the outer frame, with a bottom gradient for its caption. On mobile it is (230px) tall. Collection thumbnails are (132px) square on desktop, (100px) at the middle breakpoint, and (86px) on mobile. Product imagery is contained within a (400px) maximum width and (43vh) maximum height; mobile gives it a (230px × 210px) box. Comparison tables scroll horizontally when needed, preserving readable cell widths. Cart lines retain separate thumbnails, option information, and quantity controls.

## Elevation & Depth

Main surfaces are flat and differentiated by paper/tint values and fine borders. Imagery and product geometry provide most of the depth. Selected options use an inset bottom stroke rather than floating elevation. Temporary settings and dialogs use soft ambient shadows; the photographic caption uses a transparent dark gradient for legibility.

### Shadow Vocabulary
- **Settings panel:** `0 15px 45px #29272026` for floating voice settings.
- **Video and reset dialogs:** `0 20px 70px #29272040` for centered temporary dialogs.
- **Selected product option:** `inset 0 -2px var(--accent)` reinforces the pressed state.

**The Quiet Surface Rule.** Keep the main panels flat. Reserve the existing ambient shadows for temporary floating surfaces.

## Shapes

Controls use gentle rectangular rounding. Quantity buttons use the smallest corner step; suggestions and settings selects use the chip step; buttons and product options share the button step; the cart trigger, send control, model toolbar, and error notice use the toolbar step. Collection thumbnails use (12px) corners. User bubbles, settings, and dialogs use (14px), while the composer uses (16px). The inspiration photograph remains square to the outer frame.

Fine solid borders separate controls and sections. Quantity buttons are individually outlined, with an unboxed numeral between them. Cart counts and voice-status marks are circular functional indicators.

## Components

### Buttons

Compact and confident, with sentence-case labels and inline SVG icons. Primary and secondary actions share (12px 18px) padding, a (48px) minimum height, and (9px) corners; mobile lowers the minimum to (46px) and type to (12px). Primary hover uses deep brown, secondary hover uses tint. Icon buttons are (40px) square with tint on hover. Header utility widths reduce to (34px) on mobile and (30px) at the narrowest breakpoint. The send control is a filled brown square, (44px) on desktop and (40px) on mobile.

The shared keyboard focus indicator is a (3px) brown outline offset by (4px), including the composer textarea. The focusable conversation history moves that outline inward with a (-3px) offset. Disabled controls use opacity (.45) and a noninteractive cursor; preserve semantic disabled or pressed attributes alongside visual states.

### Chips and Product Options

Suggestion chips have a fine line border, (11px) type, (8px 10px) padding, the chip corner token, and a (36px) minimum height. Hover adds tint. Product option buttons use (10px 14px) padding, a (100px) minimum width, and wrap as space requires. They show an option title and a smaller price/availability line. A pressed option gains paper fill, a brown border, and an inset brown bottom stroke. Product view navigation is a separate compact pattern with a (34px) minimum height and (1px) brown underline for the pressed view.

### Cards / Containers

User messages are tinted bubbles, right aligned, sized to content up to (85%) of the message area, with (14px 18px) padding. Assistant messages remain on paper. Collection rows pair a thumbnail with title, description, starting price, and an arrow; rules separate them rather than elevated card shells. Product facts are ruled definition rows with a (100px) label column and (18px) gap.

### Inputs / Fields

The composer is white with a fine line border, the composer corner token, and (14px) padding, reduced to (10px) on mobile. Its textarea is borderless and transparent, with a brown caret and muted placeholder. The textarea itself receives the shared keyboard focus outline. It is (55px) tall on desktop and (48px) on mobile. The action row aligns controls to the right; upload and voice controls appear only when their features are configured. Underlined help sits below the composer.

### Navigation

The quiet header combines the configured merchant wordmark, an honest demo/status label, a source link, utility controls, and an outlined cart trigger with a circular brown count. The cart trigger uses (10px 14px) padding, (10px) corners, and a (22px) count. The mobile header hides the extended status text, source label, and cart text while retaining icons, count, and accessible names. It remains sticky during document scrolling.

### Comparison and Cart Stage

Comparison tables use horizontal rules, (12px) copy, (16px 12px) cells, and (17px) column titles; mobile reduces cell padding to (12px 9px) and titles to (15px). Product facts supply the comparison rows so merchant categories can use their own labels. Text actions allow a shopper to explore an option.

Each cart line pairs a (120px) contained image, title, option, unit price, and independent quantity buttons; images reduce to (88px) on mobile. Quantity buttons are (34px) squares with (7px) corners, separated by a (30px) minimum-width tabular quantity. Remove stays an underlined text action on the same row. A ruled status row carries refresh and an honest commerce/demo label. Subtotal aligns label and amount; the amount is (30px), or (27px) on mobile. The full-width checkout action is accompanied by a demo/payment explanation when appropriate. Cart closure returns the stage to the collection.

### Motion and Dialogs

The working indicator rotates over (1s). Explicit mobile stage navigation requests smooth scrolling; reduced-motion CSS disables animations and transitions and requests automatic scrolling. No general animated hover transition or voice pulse is defined in the current stylesheet. Video and reset dialogs use paper surfaces, (14px) corners, bounded viewport sizing, and a transparent ink backdrop.

## Do's and Don'ts

### Do:
- **Do** preserve the warm paper, brown accent, and Manrope relationship when adapting merchant content.
- **Do** keep the visual stage and conversation independently readable at desktop widths and stack them at the mobile breakpoint.
- **Do** keep icons as inline SVG controls, with accessible labels and visible keyboard focus.
- **Do** use tabular numerals for quantities and totals where implemented.
- **Do** retain reduced-motion behavior and the mobile composer’s readable text size.
- **Do** keep fictional product, scripted-guide, availability, and demo-checkout labels visible where the corresponding state requires them.

### Don't:
- **Don't** replace the working panels with a grid of elevated cards.
- **Don't** use brown text alone to communicate selected controls; preserve the existing fill, underline, or pressed-state treatment.
- **Don't** introduce a second display family or all-caps heading system.
- **Don't** add decorative eyebrow labels above headings; progress counts and speaker names are functional labels, not heading decoration.
