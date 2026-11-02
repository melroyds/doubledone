// The add panel's floor (bug sweep #26, 2026-11-02): the least height the panel may take, so the box, which is the
// part that gives, never squeezes the heading, the hint seat, the tools, When or Add out of view. The floor binds
// with the keyboard up on a short screen, and above all on the web, where the window itself shrinks to the
// keyboard's top and 55% of what is left is less than the rows need.
//
// The rows were budgeted at their design heights (the heading 48, the hint seat 36, the tools 44, When and Add 48),
// scaled with the text, and that budget stays the floor wherever the rows fit it, so nothing moves for them. They do
// not always fit. At 360 pt the AI note runs to three lines in German, French and Spanish, the German tools wrap to a
// second row at Large text, and a repeat's days take the Add label to three lines in German and French, four in
// French at Large text. A floor that assumed the design heights then pushed When and Add past the panel's foot. Now
// the floor follows the rows' real height, as the panel measured it, whenever that is taller.

/** The panel's padding above its heading. */
const PANEL_TOP = 8;
/** The box's least height. It gives up its room first, and never goes below this. */
const FIELD_MIN = 56;
/** The four 6 pt gaps between the panel's five rows. */
const GAPS = 6 * 4;
/** The heading, the hint seat, the tools, When and Add, at their design heights. */
const ROWS_DESIGN = 48 + 36 + 44 + 48;

/**
 * The add panel's least height.
 * - `padBottom`: the padding under When and Add (the home bar's, or the keyboard's 8 and Safari's address label).
 * - `textScale`: the app's text size and the phone's together, never under 1.
 * - `rowsH`: the four fixed rows added up, as BrainDump measured them, or 0 before it has.
 */
export function panelFloor(padBottom: number, textScale: number, rowsH: number): number {
  return PANEL_TOP + FIELD_MIN + GAPS + padBottom + Math.max(ROWS_DESIGN * textScale, rowsH);
}
