// French catalog. DRAFT, pending native review (see docs/i18n/translations-review.md). Mirrors en.ts key-for-key
// (the `: Catalog` type enforces that); translate() falls back to en per missing key. Idioms are TRANSCREATED,
// not literal. Register is the warm, informal second person (tu). Accents are deliberate and required.
import { type Catalog } from './en';

export const fr: Catalog = {
  common: {
    today: "Aujourd'hui",
    close: 'Fermer',
    remove: 'Retirer',
    backToToday: "Retour à aujourd'hui",
    tryAgain: 'Réessayer ?',
    skip: 'Passer',
    begin: 'Commencer',
    continue: 'Continuer',
    gotIt: 'Compris',
  },
  today: {
    subtitle: "Juste aujourd'hui. Le reste peut attendre.",
    addToToday: "+  Ajouter à aujourd'hui",
    closeTheDay: 'Clore la journée',
    alsoDidThat: "+ Ça aussi, je l'ai fait",
    lowDay: "Peu d'énergie ? Passe en journée tranquille",
    focusOne: 'Te concentrer sur une seule chose',
  },
  actions: {
    lightenToday: 'Allège ta journée', // transcreated: lighten the load of the day
    planMyDay: 'Organiser ma journée',
    breakItDown: 'Décompose-la', // transcreated: the standard warm verb for splitting a task into steps
    sortForMe: 'Trie pour moi',
    makeItTiny: 'Juste un petit bout', // transcreated: "just a small piece", carries the "just to begin" feel
    chartACourse: 'Trace ta route', // transcreated: "tracer sa route", plot your path forward
  },
  capture: {
    placeholder: 'Vide ta tête. Une ligne par chose.',
    speakHint: 'Tu préfères parler ? Sur le web, touche Dicter et dis-les à voix haute.',
    speak: 'Dicter',
    scan: 'Scanner',
  },
};
