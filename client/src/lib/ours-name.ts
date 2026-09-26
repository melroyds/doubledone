// The live shared list's name, as the app last knew it, held in memory for the length of a session.
//
// Today learns it when it loads your pairs, and it is what Today's heading shows. The Ours room loads the
// pair again for itself, over the network, and until that answer came back it showed the DEFAULT name
// ("Ours", "La nostra lista"), then flipped to the household's own name, which read as the app changing
// language (a real report, 2026-09-26). So Today hands the name over here, and the room starts with it.
//
// Memory only, on purpose: it is somebody's household name, it is re-learned on every load, and a stale
// value is corrected the moment the room's own read lands. An empty string means "a list with no name";
// null means "no live list known".

let known: string | null = null;

export function rememberOursName(name: string | null): void {
  known = name;
}

export function knownOursName(): string | null {
  return known;
}
