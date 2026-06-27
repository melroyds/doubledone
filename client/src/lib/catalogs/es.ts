// Spanish catalog. DRAFT, pending native review (see docs/i18n/translations-review.md). Mirrors en.ts
// key-for-key (the `: Catalog` type enforces that); translate() falls back to en per missing key. Idioms are
// TRANSCREATED, not literal. Register is the warm, informal second person (tú).
import { type Catalog } from './en';

export const es: Catalog = {
  common: {
    today: 'Hoy',
    close: 'Cerrar',
    remove: 'Quitar',
    backToToday: 'Volver a Hoy',
    tryAgain: '¿Probamos otra vez?',
    skip: 'Omitir',
    begin: 'Empezar',
    continue: 'Continuar',
    gotIt: 'Entendido',
  },
  today: {
    subtitle: 'Solo hoy. Lo demás puede esperar.',
    addToToday: '+  Añadir a Hoy',
    closeTheDay: 'Cerrar el día',
    alsoDidThat: '+ Esto también lo hice',
    lowDay: '¿Sin energía? Que sea un día tranquilo',
    focusOne: 'Concéntrate en una sola cosa',
  },
  actions: {
    lightenToday: 'Aligera el día', // transcreated: lift the weight off the day
    planMyDay: 'Planea mi día',
    breakItDown: 'Divídela en pasos', // transcreated: split it into steps (literal "break" reads violent)
    sortForMe: 'Ordénalas por mí',
    makeItTiny: 'Hazla mínima', // transcreated: make it minimal, the two-minute starter
    chartACourse: 'Traza un plan', // transcreated: draw up a plan (nautical "rumbo" reads too dramatic)
  },
  capture: {
    placeholder: 'Vacía la cabeza. Una cosa por línea.',
    speakHint: '¿Prefieres hablar? En la web, toca Hablar y dilas en voz alta.',
    speak: 'Hablar',
    scan: 'Escanear',
  },
};
