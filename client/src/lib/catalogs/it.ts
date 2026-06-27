// Italian catalog. DRAFT, pending native review (the side-by-side rationale + the transcreation notes live in
// docs/i18n/translations-review.md). Mirrors en.ts key-for-key (the `: Catalog` type enforces that); translate()
// falls back to en per missing key, so a partial catalog is always safe. Idioms are TRANSCREATED, not literal.
// Register is the warm, informal second person (tu).
import { type Catalog } from './en';

export const it: Catalog = {
  common: {
    today: 'Oggi',
    close: 'Chiudi',
    remove: 'Rimuovi',
    backToToday: 'Torna a Oggi',
    tryAgain: 'Riprovi?',
    skip: 'Salta',
    begin: 'Inizia',
    continue: 'Continua',
    gotIt: 'Ho capito',
  },
  today: {
    subtitle: 'Solo oggi. Il resto può aspettare.',
    addToToday: '+  Aggiungi a Oggi',
    closeTheDay: 'Chiudi la giornata',
    alsoDidThat: '+ Ho fatto anche questo',
    lowDay: 'Poca energia? Rendila una giornata leggera',
    focusOne: 'Concentrati su una cosa',
  },
  actions: {
    lightenToday: 'Alleggerisci la giornata', // transcreated + native review: lighten the day ("oggi" alone read odd as the object)
    planMyDay: 'Organizza la giornata',
    breakItDown: 'Dividi in passaggi', // transcreated + native review: divide into steps ("spezzala" read too violent)
    sortForMe: 'Ordina tu per me',
    makeItTiny: 'Rendila minuscola', // transcreated: shrink it to almost nothing
    chartACourse: 'Traccia la rotta', // transcreated: plot the course (nautical, calm)
  },
  capture: {
    placeholder: 'Svuota la testa. Una cosa per riga.',
    speakHint: 'Preferisci parlare? Sul web, tocca Parla e dille ad alta voce.',
    speak: 'Parla',
    scan: 'Scansiona',
  },
};
