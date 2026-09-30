# Handoff: the Menu's missing doors (Settings and Premium)

**Recommendation: 1c, the sign and the shelf.** Settings keeps its corner and becomes a sign: a gear and the word, in `ink`. After the last room, a quiet shelf lists Settings again in words with a hint, then Premium, whose hint is visible for the first time. Nothing people have learned moves. Only weight changes, plus one optional change to the lead line.

## Files
- `DoubleDone Menu Doors.html`: the board. Directions 1a to 1d side by side, then 1c in every state the brief asks for, in light and dark Dusk, plus the corner diagram, the press and focus sheet and the ✦ decision.
- The room pictures on the board are cut from the live screenshot so the frames match the app. The build keeps its own assets.

## What changes
- The top-right Settings control becomes the sign.
- A shelf after the rooms holds Settings, then Premium.
- The Premium hint is visible, and its AI-on line is rewritten.
- The lead line (optional), the welcome's handoff line and the Menu pill's spoken label change.
- A 300 ms press guard on the Menu page.

Unchanged: the rooms, pictures, title, Calendar card, paper, Today, the Menu pill's look, the Settings screen and its own Premium card.

## Layout, on the live tokens
### Top row
- Height and position as today: `minHeight: 44`, top padding safe area + `spacing.five`.
- `flexDirection: 'row'`, `flexWrap: 'wrap'`, `alignItems: 'center'`, `columnGap: spacing.four`, `rowGap: spacing.one`.
- Left: "‹ Today", unchanged (the app-wide back link).
- Right: the sign, with `marginLeft: 'auto'`.
- **Wrap rule:** when the back link and the sign don't fit on one line, the sign drops to its own line and stays right-aligned, because `marginLeft: 'auto'` holds it in its corner. Neither label truncates or shrinks. This happens at the stress size in German. At default and Large sizes, in all five languages, on 320 and wider, the row stays on one line.

### The sign
- `Pressable`, `accessibilityRole="button"`, label = the Settings title. `minHeight: 44`, `paddingHorizontal: spacing.one`, `flexDirection: 'row'`, `alignItems: 'center'`, `gap: spacing.two`, `hitSlop: 8` (as today).
- Gear: `react-native-svg`, 1.2 × the label's font size (18 at default, so it grows with text), stroke 2 on a 24 grid, `ink`, no fill, round joins. Decorative: hidden from screen readers.
- Label: Atkinson Hyperlegible 15/20 regular, `ink`.
- Never an outline, fill or pill shape, in any appearance. That's what keeps it apart from the Menu pill.

### The shelf
- Directly after the last room card, `marginTop: spacing.six`. Its neighbours never change: the last room above it, the page's bottom padding below. It moves with the grid's height (AI, Ours), never in order.
- Standard: `backgroundColor: surface`, radius = the room cards' radius, no border, no shadow.
- Two rows, Settings then Premium. Between them, a `spacing.five` (24) `View` that isn't pressable. No hairline.
- Each row: `Pressable`, `accessibilityRole="button"`, `minHeight: 56`, `paddingVertical: spacing.three`, `paddingHorizontal: 13`. The 13 lines the row text up with the room cards' text (1 border + `spacing.two` + a 4 text inset). No `hitSlop`, so the rows never reach into each other.
  - Label: Atkinson 15/20 bold, `ink`.
  - Hint: Atkinson 14/18, `inkSoft`, `marginTop: 2`. Wraps and hyphenates, never truncates.
  - Chevron "›": 20, `inkSoft`, decorative.
- Page bottom padding after the shelf: `spacing.six` + the bottom safe-area inset.

### Quiet
- The sign: unchanged. It has no chrome to strip.
- The shelf: no surface. The rows sit on paper, `spacing.six` below the grid and `spacing.five` apart.
- The room cards keep their borders, as today (out of scope).

### Large text and narrow screens
- **Long words break at a syllable, never overflow.** German runs to single words wider than a 320 column at 2.36× ("Einstellungen", "Erinnerungsalbum", "Wiederkehrend"). Don't rely on a platform hyphenation dictionary (web has none for German in most browsers; Android's `android_hyphenationFrequency="normal"` needs API 23+). **Ship soft hyphens (U+00AD) in the long German catalogue strings** at compound or syllable boundaries: `Ein\u00ADstel\u00ADlungen`, `Erinnerungs\u00ADalbum`, `Wieder\u00ADkehrend`. They are invisible until a line breaks there. The board shows the result: "Einstel-" / "lungen", "Erinnerungs-" / "album", "Wieder-" / "kehrend". `overflow-wrap: anywhere` stays only as the last resort.
- **At large text the chevron top-aligns** (`alignSelf: 'flex-start'`) beside the label's first line, so a wrapped hint never runs under it.
- The grid drops to one column at Large text or under 330 wide, as today. The shelf is always one column.
- `minHeight` values are floors. Rows grow with the text.

### Above the fold at 390 × 844 (free, AI on)
- **Web:** the sign, title, lead, Calendar and both grid rows. The shelf is below.
- **iOS (47 top, 34 bottom):** the same, with the fold through Ours' and Chart's hints.
- **Android (24 status + 48 navigation):** the same, with the fold at Ours' and Chart's titles.
- The sign is above the fold on all three. The shelf is below on all three, on purpose: Premium is findable for someone looking, never pushed.

## Strings
Key names are placeholders; map them to the catalogue. German follows the glossary (du) and is a draft pending native review. French uses tu.

**menu.settings** (existing, reused by the sign and the shelf row)
- en: Settings · de: Einstellungen · es: Ajustes · fr: Paramètres · it: Impostazioni

**menu.settingsHint** (new)
- en: For text size, motion and how it looks
- de: Für Textgröße, Bewegung und das Aussehen
- es: Para el tamaño del texto, las animaciones y el aspecto
- fr: Pour la taille du texte, les animations et l’apparence
- it: Per la dimensione del testo, le animazioni e l’aspetto

**menu.premiumHintAi** (changed; "Keepsakes" is stale)
- en: Scrapbook, more AI, your colour
- de: Erinnerungsalbum, mehr KI, deine Farbe
- es: Álbum de recuerdos, más IA, tu color
- fr: Album souvenir, plus d’IA, ta couleur
- it: Album dei ricordi, più IA, il tuo colore

**menu.premiumHintNoAi** (unchanged; now shown to everyone with AI off)
- en: Your colour theme, and more

**menu.premiumActiveAndroid** (unchanged)
- en: Active. Every extra is yours.

**menu.lead** (changed, optional)
- en: Today is the kitchen. Everything else is here.
- de: Heute ist die Küche. Alles andere ist hier.
- es: Hoy es la cocina. Todo lo demás está aquí.
- fr: Aujourd’hui, c’est la cuisine. Tout le reste est ici.
- it: Oggi è la cucina. Tutto il resto è qui.

**welcome.menuHandoff** (changed: now names Settings, so the welcome's other "in Settings" lines have an answer)
- en: Your Calendar, routines, repeating tasks and Settings live in the Menu, top right.
- de: Dein Kalender, deine Routinen, deine wiederkehrenden Aufgaben und die Einstellungen sind im Menü, oben rechts.
- es: Tu Calendario, tus rutinas, tus tareas que se repiten y los Ajustes están en el Menú, arriba a la derecha.
- fr: Ton Calendrier, tes routines, tes tâches récurrentes et les Paramètres sont dans le Menu, en haut à droite.
- it: Il tuo Calendario, le routine, le attività ricorrenti e le Impostazioni sono nel Menu, in alto a destra.

**menu.pillA11y** (changed; Today and Ours)
Rule: the word Menu, then the title of every destination on the Menu page, in page order, each once. Settings comes first because it is second on the page, straight after the way back. Chart a course only with AI on; Ours only when its card shows. Build it by joining the catalogue titles, never as a hand-written list per language. Resolved below; room titles other than English are drafts.
- en, AI on: Menu: Settings, Calendar, Routines, Repeating, Ours, Chart a course, Premium
- en, AI off: Menu: Settings, Calendar, Routines, Repeating, Ours, Premium
- de: Menü: Einstellungen, Kalender, Routinen, Wiederkehrend, Ours, Kurs setzen, Premium
- es: Menú: Ajustes, Calendario, Rutinas, Se repiten, Ours, Trazar un rumbo, Premium
- fr: Menu : Paramètres, Calendrier, Routines, Récurrentes, Ours, Tracer un cap, Premium
- it: Menu: Impostazioni, Calendario, Routine, Ricorrenti, Ours, Tracciare una rotta, Premium
- AI off in de/es/fr/it: the same, without Chart a course.

## Premium, per state
The hint depends on the AI setting, which is known before the first frame. Membership changes it in one case only: members on Android.

| State | Visible and spoken |
|---|---|
| Free, AI on | Scrapbook, more AI, your colour |
| Free, AI off | Your colour theme, and more |
| Paying, web or iOS | the AI line |
| Paying, set to end | the AI line |
| Card-free month | the AI line |
| Complimentary | the AI line |
| Apple billing retry | the AI line |
| Web card failing (access paused) | the AI line |
| Lapsed | the AI line |
| Any member on Android | Active. Every extra is yours. |
| Still loading | the AI line |

"The AI line" is whichever of the first two rows matches the AI setting. The line names what Premium holds, so it is true for everyone in every state: it can't pitch Premium to someone who pays, can't say "expired" to someone who left, and can't flash free copy at a member while loading. Billing news, dates and management live on the Premium page, never here. On Android the row still opens the Premium page, which sells nothing, and members there get no manage path. Nothing on this page says a price, trial, try, upgrade, unlock, subscribe or buy, including spoken labels.

## Motion
- The sign and the shelf arrive with the page's own entry: a 220 ms fade with a 10 px rise. With reduced motion, a 90 ms fade and nothing moves. Neither ever animates on its own.
- Press: the sign and both shelf rows dim to 0.7 while pressed, as text controls do. Cards stay at 0.6.
- **Press guard:** the Menu page ignores presses for its first 300 ms after it mounts (`pointerEvents="none"` on the page root until a 300 ms timer fires). That covers the 220 ms fade and the phone's double-tap window, so a double-tap on the Menu pill can't land on Settings. The guard is the same with reduced motion. Nothing dims or looks disabled while it runs.

## Accessibility
### Focus order (screen reader)
1. ‹ Today
2. Settings (the sign)
3. Title (header)
4. Lead
5. Calendar
6. Routines
7. Repeating
8. Ours (when shown)
9. Chart a course (AI on)
10. Settings (the shelf)
11. Premium

The keyboard's Tab order is the same, without the title and lead.

### Spoken labels
- The sign: "Settings", button. The gear is hidden.
- The shelf's Settings: "Settings", button, hint "For text size, motion and how it looks". Same name as the sign, on purpose: it is the same door.
- Premium: "Premium", button, hint = the visible line for the state. What's spoken and what's shown never differ.

### Keyboard focus (web)
A 2 px `ink` outline: offset 2 on the sign (radius 10), inset 2 on the shelf rows (radius 14). Keyboard focus only (focus-visible), never on tap.

### Contrast
Every new string uses `ink` or `inkSoft`, never `accent`. The sign is ink on paper. The shelf labels are ink on surface (on paper in Quiet). The hints and the Android member line are inkSoft on surface (on paper in Quiet). The new lead is inkSoft on paper, as today. The gear, chevrons and focus ring use the same colours, so they clear 3:1.

WCAG ratios, computed from `design_handoff_themes/themes.json`. Every figure clears 4.5:1. The lowest is 4.50 (Dusk light).

| Palette | ink on paper | ink on surface | inkSoft on paper | inkSoft on surface | Brief's inkSoft on paper |
|---|---|---|---|---|---|
| Dusk light | 13.78 | 14.83 | 4.50 | 4.84 | 4.50 |
| Dusk dark | 14.80 | 13.54 | 6.66 | 6.09 | n/a |
| Sage light | 13.31 | 14.62 | 4.65 | 5.10 | 4.65 |
| Sage dark | 14.75 | 13.18 | 7.36 | 6.58 | n/a |
| Slate light | 13.44 | 14.81 | 4.56 | 5.03 | 4.56 |
| Slate dark | 14.87 | 13.36 | 7.33 | 6.58 | n/a |
| Heather light | 13.37 | 14.87 | 4.71 | 5.24 | 4.71 |
| Heather dark | 14.69 | 13.44 | 7.01 | 6.42 | n/a |
| Fog light | 13.52 | 14.97 | 4.62 | 5.11 | 4.62 |
| Fog dark | 14.96 | 13.50 | 7.22 | 6.52 | n/a |
| Honey light | 13.76 | 14.85 | 4.89 | 5.28 | 4.89 |
| Honey dark | 14.79 | 13.57 | 6.70 | 6.15 | n/a |
| Rose light | 13.75 | 15.04 | 4.83 | 5.28 | 4.83 |
| Rose dark | 14.67 | 13.64 | 6.78 | 6.31 | n/a |

The inkSoft-on-paper figures match the brief's table to two decimals, so these tokens agree with the live ones for the colours this page uses. Re-run the check against `theme.ts` before shipping (script below).

## The ✦
No ✦ on the Premium row.
- Next to the word Premium it says nothing the word doesn't, so all it can do is decorate. Decoration on the one commercial row is what makes it a sticker.
- Shown to free users only, it says "you don't have this". Shown to everyone, it means nothing to a member.
- In light it measures 2.36 to 2.62, under the 3:1 a mark needs to carry meaning, and in Honey it sits beside an accent of nearly the same colour.
- Chart's ✦ is explained where it is met, on the Chart page. A legend at the floor would be a pointer.

## Left out, on purpose
- **Moving Settings out of its corner (1b).** It frees the shared corner, but hides the accommodations below every fold and takes away the route people learned.
- **A Settings card among the rooms (1d).** A card without a picture reads as a room whose picture failed to load. Its shape would also change with AI.
- **A pill, outline or filled button for Settings.** In that corner it reads as the Menu pill changing its word.
- **A gear on the shelf row.** The sign carries the symbol; the listing carries words. It also keeps the shelf lighter and its labels aligned.
- **A hairline between the shelf rows.** Not a break. 24 of dead space is.
- **State-specific Premium copy.** Billing belongs on the Premium page.
- **Premium above the rooms**, a Premium card, or any honey on the row.
- **Any pointer, tooltip, "new" dot or coach mark.**

## Noticed, out of scope
- Chart's ✦ has the same contrast gap in light and the same loading flash. Render it only once the state is known, and give marks on light paper a darker honey, in a separate pass.
- The room cards keep their borders in Quiet while Settings' own cards lose theirs.
- "‹ Today" uses accent text, which passes 4.5:1 in one light theme of seven (known; being fixed separately).

## Assumptions to check
1. The live Menu matches the brief and the attached screenshots. The DoubleDone folder wasn't reachable this round, so nothing here was read from the code.
2. Palette values come from `design_handoff_themes/themes.json`. Light Dusk's accent is #946475, as the brief says (the board uses it for "‹ Today" only).
3. `spacing.one` to `spacing.six` are 4, 8, 12, 16, 24 and 32.
4. The room cards' radius is 18 and their pictures' 12, measured from the screenshots.
5. An odd room card across the full row uses a 2:1 crop.
6. The Android fold is drawn for a 24 status bar and a 48 three-button navigation bar, the tallest common case.
7. Premium holds the scrapbook, more AI and colour themes, as today's hint says.
8. Room titles and hints in German and French on the board, and "Ours" in every language, are drafts. The build uses the catalogue.
9. Spanish Settings is "Ajustes". French uses tu.

## Contrast check
```js
const lum = h => { const c = h.replace('#',''); const v = [0,2,4].map(i => parseInt(c.substr(i,2),16)/255).map(x => x <= 0.03928 ? x/12.92 : ((x+0.055)/1.055) ** 2.4); return 0.2126*v[0] + 0.7152*v[1] + 0.0722*v[2]; };
const ratio = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A,B)+0.05) / (Math.min(A,B)+0.05); };
// for each palette and mode: ratio(ink, bg), ratio(ink, surface), ratio(inkSoft, bg), ratio(inkSoft, surface), all >= 4.5
```
