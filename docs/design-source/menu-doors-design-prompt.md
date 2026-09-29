# Claude Design prompt: DoubleDone, the Menu's missing doors (Settings and Premium)

*For Claude Design. Written 2026-09-30. The Menu page, "The rest of the house", shipped on 2026-09-26. Its rooms, pictures and visual language stay. This round is about the two doors that are not rooms: how visible and how heavy Settings and Premium should be.*

**Attached:** `menu-light.png` and `menu-dark.png` (the page today), `today-light.jpeg` (the Menu pill that opens it), `settings-light.jpeg` (where Settings leads) and `german-glossary.md`. No Quiet or German shot of the Menu exists yet, so both are described below.

## The product

DoubleDone is a calm to-do app that never shames. It is for adults with ADHD, autism, the AuDHD overlap and OCD, and it is live on web, iOS and Android. The spine: **today is finite and achievable**. The rule: **remove friction, never add a setting**. The brand is "Dusk": Newsreader serif headings, Atkinson Hyperlegible body, warm paper, a full dark mode and one mauve accent used sparingly. Honey means Premium. On this page that is one small ✦. The mauve-to-honey gradient used elsewhere never appears here. There are seven colour themes, each light and dark. A free **Quiet** appearance strips the chrome. Five languages (en, de, es, fr, it), and German and French run long. The whole daily loop is free. Premium is optional extras.

## Why now

A real user, a friend of the founder, on the current page:

> "I still don't like how hard it is to navigate to settings. If you see the pictures, your gaze goes top down, and unless you're told that the settings are at the very top right, most people would assume that the things with pictures are the entirety of the menu content."

The founder agrees, and he flagged "the premium button at the bottom" too. In the attached shots (390x844, no safe-area insets) the screen ends exactly under the Ours and Chart row. The page looks finished there, and Premium sits unseen below. On a real 390x844 iPhone the page starts 47 lower, so the fold cuts through those cards' hints instead.

## The page today, top to bottom

The Menu is a full page. It opens from the "··· Menu" pill at the top right of Today, and from the same pill on the Ours tab. Those two screens sit on a living sky. The Menu paints paper, and the paper stays. Gutter 24 (`spacing.five`), column capped at 560, top padding the safe area plus 24.

1. **Top row.** Left, "‹ Today" in 15pt bold `accent`. Right, "Settings" in 14pt regular `inkSoft`, styled exactly like the lead. Both are 44 tall, with the hit area extended by 8.
2. **Title**, "The rest of the house", serif 32/36.
3. **Lead**, "Today is the kitchen. These are the other rooms.", 14/21 `inkSoft`.
4. **Calendar**, a wide card with 2:1 art.
5. **A grid of 4:3 picture cards**: Routines, Repeating, Ours, and Chart a course (AI on only, with a honey ✦ for free users). The grid holds two to four cards, depending on AI and the Ours state. An odd card takes the full row. It drops to one column at Large text or under 330 wide.
6. **"Premium ›"**, 14pt `inkSoft` on a hairline, hit area extended by 6. Its hint is spoken only.

Motion is a 220ms fade with a 10px rise. With reduced motion it is a 90ms fade and nothing moves. Cards dim to 0.6 when pressed, text links to 0.7. The standing rule: no "new" dots or badges, no ordering by use, no coach marks, the same rooms in the same place, always.

## What we know

- **This page holds the only permanent door to Settings.** The other is a first-run line on the welcome, and Today has no tab bar on purpose. Settings holds the accommodations (text size, reduced motion, Quiet, AI off), so a hidden Settings is hidden accessibility.
- **Onboarding never says where Settings is.** The welcome's handoff says "Your Calendar, routines and repeating tasks live in the Menu, top right" and stops there. Other lines say "in Settings" and never say how to get there. The welcome's Premium fine print sends people to Settings too. That handoff line joins the copy pass whichever direction wins.
- **Premium has about a dozen doors across the app. Settings has this one.** Fix Settings first. Make Premium legible here, not louder.
- **Why they get missed.** Settings is the lightest thing on the page. The top row reads as a nav bar, so the eye leaves it and never comes back. The lead and a matching set of pictures read as a closed set, and it ends at a fold that looks like the end of the page.
- **The focus order is already right** (‹ Today, Settings, title). The problem is visual weight.
- **An assumption, not data:** people rarely open Settings. It is not measured yet.

## Premium's states

The row must say something true, as a noun, in every state. Fewer distinct lines is better. One line true for every member would be ideal.

| State | Spoken today | Problem |
|---|---|---|
| Free, AI on | "Keepsakes, more AI, your colour" | keepsakes are now the scrapbook |
| Free, AI off | "Your colour theme, and more" | none |
| Paying, web or iOS | "Manage your subscription" | a verb |
| Paying, set to end | same | a verb, to someone leaving |
| Card-free month | same | false, nothing to manage |
| Complimentary | same | false, nothing to manage |
| Apple billing retry | same | never warn here |
| Web card failing (access paused) | the free hint | pitches Premium to a payer |
| Lapsed | the free hint | never "expired" or "welcome back" |
| Any member on Android | "Active. Every extra is yours." | keep it |
| Still loading | the free hint | flashes free copy at members |

Billing trouble belongs on the Premium page, never here. Until the state is known, show no state-specific copy, or one line that is true for everyone. Chart's ✦ has the same flash today.

## The tensions

1. **Findable versus calm.** Someone who never looks back at the corner must still see Settings. It must also stay lighter than Calendar and never compete with the rooms.
2. **Premium findable, never salesy.** The posture is "findable for someone actively looking, never pushed". Our lean is that Premium's problem is that it is bare, not that it sits low. Challenge that if you disagree, but a commercial door never sits above the rooms.
3. **Rooms versus utilities.** Settings and Premium are not rooms, and a card would join a set people trust. Weigh that honestly against visibility.
4. **"The same place" means the same order and the same neighbours**, not the same coordinates. The grid's height changes with AI and Ours, so anything below it moves, card or not. Judge every direction by that rule: AI on or off, signed in or out, free or Premium.
5. **Stability.** Onboarding teaches where the Menu is. Change weight freely. Move things only when it clearly earns it.
6. **One corner, two controls.** On Today, the Menu pill sits top right at the safe area plus 48. On the Menu, Settings sits top right at plus 24, so their tap areas overlap. A pill-shaped Settings there can read as the same control changing its word. A double-tap during the 220ms fade can also land on it. Solve both.
7. **The ✦.** A ✦ on the Premium row would explain Chart's ✦, or it would read as a sticker. The facts:
   - The honey mark (`accents[2]`) is 2.36 to 2.62 against every light paper and card. A meaningful mark needs 3:1. In dark it is 8.6 or more.
   - In the Honey theme it sits beside an accent of almost the same colour.
   - Everyone sees it or nobody does. A ✦ shown only to free users says "you don't have this".

   Decide, and say why.

## Principles

Never shame: no urgency, no counts, no red. Predictable beats clever. Calm over dense, whitespace is the material. Propose, never impose. No new settings. One-handed and thumb-reachable. Screen-reader and shaky-hand navigable. One more for this page: if the fix needs a pointer, a tooltip or a "new" dot to explain it, it failed.

## Hard constraints

1. **Five languages.** "‹ Heute" has to fit beside "Einstellungen" (13 characters) at the stress size. The same goes for "Impostazioni" (12) and "Aujourd'hui" (11). Give the top row a wrap rule. Nothing ever truncates. "Keepsakes" is stale in all five languages (Andenken, Recuerdos, Souvenirs, Ricordi), so the Premium hints will be rewritten. Today's 39-character French hint is not the length to design for. Leave headroom. German follows the glossary and is a draft pending native review.
2. **The stress case** is the app's Large text (1.18) times the phone's own 200% text, in German, 320 wide. Nothing caps the phone's scale. Show one column, top row included.
3. **Contrast.** Text on this page is 13 to 15pt, which counts as normal text under WCAG, so it needs 4.5:1. On light paper:

   | Light theme | `accent` | `inkSoft` |
   |---|---|---|
   | Dusk | 4.498 | 4.500 |
   | Sage | 4.12 | 4.65 |
   | Slate | 4.24 | 4.56 |
   | Heather | 4.46 | 4.71 |
   | Fog | 4.53 | 4.62 |
   | Honey | 3.04 | 4.89 |
   | Rose | 4.4998 | 4.83 |

   Every dark palette clears 6.3 for both. Accent text at this size passes in one light theme of seven. So a promoted Settings label and any visible hint use `ink` or `inkSoft`, or they prove 4.5:1 in all 14 palettes. "‹ Today" has the same problem, but it uses the app-wide back-link style, so leave it. We are fixing it separately.
4. **Quiet** is borderless. The Menu pill keeps its word and drops its dots and outline. A control that needs an outline to read as a button fails here. The room cards keep their borders in Quiet today, while Settings' own cards lose theirs. The cards stay out of scope. Design every new control fully for Quiet, and put any view on the cards in a note.
5. **Screen readers and keyboards.** Settings stays early in the focus order. Every control is a named button, and a second Settings gets the same name. The Menu pill's spoken label is already wrong in all five languages. "Menu: Calendar, Routines, Repeating, Ours, Chart a course, Premium, Settings" puts Settings last, but on the page it is second. Give your direction's final label in all five languages, with AI on and off. Show a visible keyboard focus state for the web.
6. **Shaky thumbs.** Settings comes before Premium. Stacked doors do not extend their hit areas into each other, and each is at least 44 tall. Between them sits at least 24 (`spacing.five`) of space that does nothing when tapped, or a visible break. A hairline alone is not a break.
7. **Android sells nothing** (Play policy). No price, currency, discount, Subscribe, Upgrade, Go Premium, Unlock or "buy on the website", and that includes spoken labels.
   - A free Android user who taps Premium lands on a page with no price and no purchase. It may offer the card-free month.
   - A member on Android keeps "Active. Every extra is yours." and gets no manage path.
   - On this page, on every platform, "Try" and "trial" are out too. That is house posture, not policy.
   - The entry must still work when Play Billing arrives, so it reads as information, never as a banner.
8. **Motion and press.** New elements arrive with the page's own fade and never animate on their own. Name each new control's press state (0.7 for text, 0.6 for cards).
9. **The door only.** No text-size, motion, Quiet or AI controls on this page.

## Directions to explore

Explore at least three genuinely different directions, then recommend one. None of these is the answer.

- **A sign at the door.** The top-right Settings becomes a control people recognise: a gear plus the word, never the gear alone. Show it in Quiet, and show how nobody mistakes it for the Menu pill.
- **A shelf at the floor.** After the grid, one quiet surface with two text rows and no pictures. First Settings, with a for-when hint in the rooms' voice. Then Premium, with its hint visible for the first time. It meets the top-down reader where the pictures end, but it sits below the fold.
- **Both together.** Show that the second Settings reads as a backup route, not duplication.
- **Settings amongst the rooms**, the founder's own instinct. A quiet card with no art, sitting last, so it always sits after the rooms. Show it honestly, and weigh visibility against joining the set.
- **Anything better.** You may tune the lead line if it is part of the problem. Keep the house voice.

For each direction, cover:

- where Settings and Premium sit
- what shows above the fold on web, on iOS (47 top, 34 bottom) and on Android (status bar plus navigation bar)
- **whether it fixes the friend's exact scan path**: reading top-down, where the pictures ending means the page ended
- Quiet, the stress case, an Android member, the focus order and the Menu pill's label

## Screens to produce (390x844 unless noted)

- **Every direction:** two frames in light Dusk. The default page (free, AI on, signed out) with the fold drawn for web, iOS and Android. Then the page scrolled to the end.
- **The recommended direction only**, in light and dark Dusk:
  1. The default page with the three folds.
  2. Scrolled to the end.
  3. AI off (three cards, Ours across the full row).
  4. A paying member on web or iOS, a card-free month, and a member on Android.
  5. The stress case, top row included.
  6. Quiet, light and dark.
  7. A 320-wide phone.
  8. French at the default size.
  9. Press and keyboard focus states on every new control.

## Deliver

A zip whose README is the contract:

- layout and spacing on the live tokens, by name (`spacing.*`, `ink`, `inkSoft`, `inkFaint`, `accent`, `surface`, `line`)
- every string, with new and changed ones in all five languages, including the Premium line per state, the welcome's handoff line and the Menu pill's label
- motion, with the reduced-motion variant
- accessibility: the focus order and spoken labels per state, and the contrast figure for every visible string in all 14 palettes
- what was left out on purpose, and why

## What this is NOT

- Not a restyle of the rooms, the pictures, the title, the Calendar card or the paper.
- Not a change to Today or its Menu pill. Only the pill's spoken label changes.
- Not Settings on Today. Not a tab bar, a hamburger menu or a floating button.
- Not Premium pulled up above the rooms. Not an illustrated Premium card, which would look like a locked door in your own house.
- No gradient, accent fill, glow, shimmer or lock. No countdown, trial meter or "days left".
- No dots, badges, "New" or "Settings is here now". Nothing that appears, grows or moves with usage or time.
- Not a Settings treatment heavy enough to compete with the rooms, such as a filled button or a big gear tile.
- Not a redesign of the Settings screen or its own Premium card.
