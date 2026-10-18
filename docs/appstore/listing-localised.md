# App Store listings, localised (de / es / fr / it)

*Written 2026-10-19 for 1.9.0 (store 1.9, slice 8). Until now App Store Connect held one English listing, so a
German, Spanish, French or Italian iPhone user read English and then the app opened in their own language. These
are DRAFTS until the batch's one native read is back (Melroy's call 7): if it is back by submit day they ship with
1.9.0, and if not the store stays English-only this version and they ship at the next one. That fallback is decided
now, so nobody makes it at the console. The native read of all four came back on 2026-10-19, one reader per
language, and its fixes are in (the last paragraph of How these were made).*

*Every count is measured by `node scripts/check-listings.mjs --appstore`, never estimated, and CI runs it.*

## How these were made

Each one is adapted from that language's Google Play listing in
[../play-store-listings-localised.md](../play-store-listings-localised.md), which had a native review and two
hostile reviewers per language, rather than translated from the English App Store page. The feature names are the
catalogue's own (`client/src/lib/catalogs/<locale>.ts`), so the listing and the app say the same words. Against
the Play text, each one:
- **drops** what an iPhone does not have or that names another store (the widget, Google Play), and the
  export bullet, for room;
- **adds** the Premium extras (the landing FAQ's `faqFreeA`, minus its free-month sentence), the Apple billing
  paragraph (built from the paywall's own `appleRenewalTerms` and `trialNoCard`), the founder line (`founder`), the
  Terms URL that doubles as the EULA link, and both medical sentences;
- **keeps** the Play fixes of 2026-10-19 (the privacy heading and lines from the landing strings `privTitle`,
  `priv2` and `priv3`; Lighten today as a suggestion; the scrapbook named as AI);
- **says the policy and the Terms are in English**, because they are (the German Play listing once promised "in
  klarem Deutsch" and was wrong);
- **names the copy we keep** without your name or account (added later on 2026-10-19, Melroy's call), in each
  language's landing `faqAiA` sentence, at the end of the Claude line where the Spanish already carried it. The
  room came from deletions only, so the one new wording for the native read is that sentence, the landing's own.
  German dropped the AI paragraph's two examples, which its free list already says ("die Reihenfolge ist unser
  Job", „Mach Schritte draus“). French and Italian kept the sorting example, the only place their text says the
  AI sorts a brain-dump, and dropped the breakdown one (the list has Décompose-la and Dividi in passaggi) and the
  "when today is loud" clause after Settle.

**The native read (2026-10-19)** changed five lines of copy here. German: the name is `ADHS-To-do-Liste`,
because a compound that starts with an abbreviation takes the hyphen, and Play's title changed with it so one
name still serves both stores (both stores break search words at a hyphen). Spanish: "Cualquiera de los dos
marca una tarea, y queda hecha para ambos", subject first like the catalogue's `sharedLead2`, because "La marca"
read as the list, or as a brand. French: "PREMIUM, SI UN JOUR TU EN VEUX PLUS", because without "en" a French
ear hears "tu (ne) veux plus", you no longer want it. Italian: "Per molti" for "Per tanti di noi", which told
a reader the writer has ADHD two paragraphs before the founder line says he built it for friends who do, and "La
spunta di uno dei due vale per entrambi", because the feminine "La" could only point back to the list.

**After the native read (2026-10-19, the colour and copy review):** the French Ours line "L'un ou l'autre la coche,
elle est faite pour les deux." had the slip the Spanish and Italian readers fixed. The nearest feminine nouns
before "la coche" are "la tienne" (ta journée) and "la liste", so it read as one of you ticking your day, or the
list. It is now "La coche de l'un ou de l'autre vaut pour les deux.", the Italian fix's shape and 5 characters
shorter, which this page needed at 3999 / 4000. The Play listing takes the same line. The French reader passed the
old sentence, so this one goes back to them before paste day. If they confirm it, the app's own `sharedLead2` in
`client/src/lib/catalogs/fr.ts` has the same construction ("L'un ou l'autre la coche, et elle est faite pour les
deux.") and takes the same fix, so the app and its store pages say it the same way.

The keywords follow the English rules: no word repeats the name or subtitle, no spaces, no competitor names, no
clinical words. Apple searches the name, subtitle and keyword field only, never the description.

| Locale | Why these words |
|---|---|
| German | Germans search both `ADHS` and the English `ADHD` (Tiimo's German page uses ADHD), so the name takes ADHS and the keywords take ADHD. `Aufgabenliste`, `To-do-Liste` and `Tagesplaner` are the category words. |
| Spanish | `TDAH` in the name; `pendientes` is the Latin American word for to-dos and `lista` the Spanish one. One neutral text serves es-MX (which the US store also searches) and es-ES. Never English words stuffed into es-MX to rank in the US. |
| French | `TDAH` in the subtitle; `to-do` and `todo` because French users type the English word. The name carries the French typography: U+00A0 before the colon. |
| Italian | `ADHD`, not the clinical `DDAI`. `lista cose da fare` is how Italians say to-do list, and `attività` is the app's own word for a task. |

## Before pasting any of these

1. **The native read is back**, or none of this ships (call 7).
2. **Run the gate:** `node scripts/check-listings.mjs --appstore`.
3. **Add the localisation in App Store Connect** (App Store tab, the 1.9.0 version, the language menu). Spanish
   goes in twice, the same text under **Spanish (Mexico)** and **Spanish (Spain)**.
4. **Each localisation has its own fields:** name, subtitle, keywords, promotional text, description, What's New
   (from `docs/release-notes/1.9.0.md`, nothing inherits it) and the Privacy Policy URL
   (`https://doubledone.app/privacy`).
5. **Print each field from this file and diff what was sent.** Never retype, and never edit these through a shell
   heredoc: that is how every non-English release note in this repo was once ascii-fied.
6. **Screenshots stay English** this version. ASC falls back to the English set, so nothing is needed there.

---

## German (`de-DE`)

**Name** (28 / 30)

```
DoubleDone: ADHS-To-do-Liste
```

**Subtitle** (30 / 30)

```
Ruhiger Tagesplaner, nur heute
```

**Keywords** (96 / 100)

```
adhd,aufgaben,aufgabenliste,todo,autismus,zwangsstörung,neurodivergent,routine,erinnerung,planer
```

**Promotional text** (170 / 170)

```
Eine ruhige To-do-Liste für ADHS, Autismus und Zwangsstörungen. Nur heute, in machbarer Größe, und nichts ist je überfällig. Der tägliche Ablauf ist kostenlos, für immer.
```

**Description** (3935 / 4000)

```
DoubleDone ist eine ruhige To-do-Liste für Erwachsene mit ADHS, Autismus, Zwangsstörungen und Überforderung.

Sie zeigt dir nur, was heute dran ist, in machbarer Größe, und bewahrt still alles auf, was du schaffst. Nichts ist je überfällig. Es wartet einfach. Nichts hier wird dich je dafür beschämen, dass eine Aufgabe einfach da ist.

Keine Streaks, keine Schuldgefühle, kein Rot. DoubleDone wird in Melbourne von Melroy gemacht. Er hat es für Freundinnen und Freunde mit ADHS und Zwangsstörungen gebaut, und für alle, deren Liste sich jemals nach zu viel angefühlt hat.

Der ruhige Kern, kostenlos für immer
- Schreib dir den Kopf leer. Eine Zeile pro Sache, die Reihenfolge ist unser Job.
- Mach Schritte draus: eine zu große Aufgabe wird zu kleinen Schritten.
- Mach es winzig: eine Zwei-Minuten-Version, nur zum Anfangen.
- Mach heute leichter: schlägt an einem vollgepackten Tag vor, ein paar Dinge auf spätere Tage zu verschieben. Verschoben wird erst, wenn du Ja sagst.
- Wiederkehrend, Routinen und Rhythmen, für alles, was wiederkommt.
- Erinnerungen, nur die, um die du bittest, nie eine Deadline.
- Settle: ein ruhiger Raum mit Atembegleitung, wenn heute laut ist.
- Feierabend machen. Er würdigt, was du getan hast, nie, was du nicht getan hast.
- Dein Kalender: alles, was du wirklich geschafft hast, auch die Aufgabe, vor der du wochenlang Bammel hattest.
- Ein kostenloses KI-Erinnerungsalbum im Monat, ein Bild von dem, was du geschafft hast.

Unsere Liste: eine gemeinsame Liste mit einem anderen Menschen
Kostenlos. Nichts darauf sagt, wer was getan hat, und nichts zählt oder vergleicht. Was einen eigenen Tag hat, die Mülltonne am Dienstag, erscheint an dem Tag in euren beiden Heute. Was keinen hat, bleibt auf der Liste und erreicht niemandes Tag. Wer abhakt, hakt für beide ab. Sie fängt mit einem Code aus sechs Zeichen an, den du deinem Menschen vorliest, und nötig ist nur die Anmeldung per E-Mail.

KI, die hilft, ganz freiwillig
Die KI ist von Haus aus an und macht echte Arbeit. Freiwillig ist sie trotzdem, und sie schickt nur das, wofür du sie nutzt. Ein Fingertipp in den Einstellungen schaltet sie aus, und die App funktioniert weiter.

Premium, wenn du mehr möchtest
Premium ergänzt optionale Extras: „Liste scannen“, „Deine eine Sache anpinnen“, „Plan meinen Tag“, „Kurs setzen“, sechs weitere Farbthemen, ein wöchentliches Erinnerungsalbum, „Deine Muster“ und Vorschläge ohne Limit bei „Was passt gerade“.

DoubleDone Premium ist ein optionales, sich automatisch verlängerndes Abo, monatlich oder jährlich, zu dem Preis, den dir der App Store vor dem Kauf zeigt. Abgerechnet wird über deine Apple-ID, sobald du den Kauf bestätigst. Das Abo verlängert sich von selbst, bis du kündigst. Kündigen kannst du jederzeit in deinen Apple-ID-Einstellungen, bis einen Tag vor der Verlängerung. Wenn du angemeldet bist, kannst du Premium auch einen Monat gratis testen: keine Karte, keine Abbuchung, und es wird nie von selbst zum Abo.

Von Haus aus auf deinem Gerät
- Deine Aufgaben liegen auf deinem Gerät. Kein Konto nötig.
- Synchronisieren auf allen Geräten: optional, eine E-Mail-Adresse, ein einmaliger Code, kein Passwort.
- Was du für eine KI-Funktion auswählst, geht an Claude von Anthropic, und Anthropic trainiert damit keine KI-Modelle. Die Bilder im Erinnerungsalbum entstehen mit KI-Modellen von Cloudflare. Wir behalten eine Kopie ohne deinen Namen und ohne Bezug zu deinem Konto, damit aus Aufgaben bessere Schritte werden.
- Keine Werbung. Keine Werbe-IDs und kein Tracking über Apps hinweg. Nichts wird verkauft.

du darfst langsam machen

DoubleDone ist kein Medizinprodukt. Die App diagnostiziert, behandelt, heilt oder verhindert keine Erkrankungen und ersetzt keine professionelle Hilfe. Für medizinischen Rat wende dich an medizinisches Fachpersonal.

Datenschutzerklärung (auf Englisch): https://doubledone.app/privacy
Nutzungsbedingungen (auf Englisch): https://doubledone.app/terms
```

---

## Spanish, neutral, one text for Mexico and Spain (`es-MX, es-ES`)

Paste this one text under **Spanish (Mexico)** and again under **Spanish (Spain)**. Neutral tú,
never vosotros or ustedes, so it reads as home in both.

**Name** (28 / 30)

```
DoubleDone: tareas para TDAH
```

**Subtitle** (29 / 30)

```
Solo hoy. Nada está atrasado.
```

**Keywords** (94 / 100)

```
lista,pendientes,todo,planificador,organizador,autismo,toc,neurodivergente,rutina,recordatorio
```

**Promotional text** (165 / 170)

```
Una lista de tareas serena para el TDAH, el autismo y el TOC. Solo hoy, en su justa medida, y nada está nunca atrasado. Todo el ciclo diario es gratis, para siempre.
```

**Description** (3989 / 4000)

```
DoubleDone es una lista de tareas serena para adultos con TDAH, autismo, TOC y agobio.

Te muestra solo lo que hoy necesita, en su justa medida, y guarda en silencio todo lo que terminas. Aquí nada está nunca atrasado. Solo espera.

Casi todas las apps de tareas te ponen la lista entera delante y lo llaman motivación. Para muchos, eso es justo el agobio. DoubleDone hace lo contrario: un día pequeño y una lista que nunca te hará sentir mal por una tarea que simplemente existe. Sin rachas que mantener, sin culpa, sin castigar una tarea por existir ni por esperar.

DoubleDone está hecha en Melbourne por Melroy. La creó para amigos con TDAH y TOC, y para cualquiera que alguna vez haya sentido que su lista era demasiado.

EL NÚCLEO TRANQUILO, GRATIS PARA SIEMPRE
- Sácalo todo de la cabeza. Una cosa por línea.
- Solo hoy, en una medida que parece posible.
- Divídela en pasos: lo que te da pavor, en pasos pequeños.
- Hazla mínima: una versión de dos minutos, solo para empezar.
- Aligera el día: en un día muy lleno, sugiere pasar algunas cosas a otros días. Nada se mueve hasta que digas que sí.
- Repetidas, para las cosas que vuelven.
- Recordatorios suaves, solo los que pidas.
- Settle: una sala tranquila con guía de respiración, cuando hoy suena fuerte.
- Cierra el día con suavidad. Honra lo que hiciste, nunca lo que no.
- Calendario: todo lo que terminaste, incluso esa tarea que te dio pavor durante semanas.
- Un álbum gratis al mes, hecho con IA: una imagen de recuerdo de lo que terminaste.

NUESTRA LISTA: UNA SOLA LISTA COMPARTIDA CON OTRA PERSONA
Gratis, y de dos personas exactamente. Nada dice quién hizo qué, y nada cuenta ni compara, así que no puede volverse un marcador. Lo que tiene día propio, la basura el martes, llega al Hoy de los dos ese día. Lo demás se queda en la lista, por larga que sea, para que tu día siga siendo tuyo. Cualquiera de los dos marca una tarea, y queda hecha para ambos. Empieza con un código de seis caracteres que le lees a tu persona, y cada uno inicia sesión con su correo.

UNA IA QUE AYUDA, Y OPCIONAL DEL TODO
La IA viene activada y hace trabajo real: ordena lo que te sacas de la cabeza en un día posible y divide una tarea difícil en pasos. Pero es opcional de verdad, y solo envía aquello en lo que la usas. Un toque en Ajustes la apaga, y la app sigue funcionando.

PREMIUM, SI ALGUNA VEZ QUIERES MÁS
Premium añade extras opcionales: Escanea una lista, Fija lo más importante de hoy, Planea mi día, Traza un plan, seis temas de color más, un álbum semanal, Tus patrones y sugerencias sin límite en Qué encaja ahora mismo.

DoubleDone Premium es una suscripción opcional de renovación automática, mensual o anual, al precio que te muestra el App Store antes de comprar. Se cobra a tu ID de Apple cuando confirmas la compra. Se renueva sola hasta que la canceles. Puedes cancelarla cuando quieras en los ajustes de tu ID de Apple, hasta un día antes de que se renueve. Si inicias sesión, también puedes probar Premium gratis un mes: sin tarjeta, sin cargos, y nunca se convierte en suscripción por sí solo.

EN TU DISPOSITIVO POR DEFECTO
- Tus tareas viven en tu dispositivo. No hace falta cuenta para usarla.
- Sincronizar entre dispositivos es opcional, y solo pide un correo y un código de un solo uso.
- Lo que eliges para una función de IA va a Claude, de Anthropic, y Anthropic no lo usa para entrenar sus modelos. Las imágenes del álbum se crean con modelos de IA de Cloudflare. Guardamos una copia sin nombre ni cuenta para mejorar los pasos.
- Sin anuncios. Sin identificadores publicitarios ni seguimiento entre apps. No se vende nada.

tienes permiso para ir despacio

DoubleDone no es un producto sanitario. No diagnostica, trata, cura ni previene ninguna afección, y no sustituye la atención de un profesional. Si necesitas consejo médico, consulta con un profesional de la salud.

Política de privacidad (en inglés): https://doubledone.app/privacy
Condiciones de uso (en inglés): https://doubledone.app/terms
```

---

## French (`fr-FR`)

**Name** (28 / 30)

```
DoubleDone : liste de tâches
```

**Subtitle** (29 / 30)

```
Pour le TDAH. Rien en retard.
```

**Keywords** (95 / 100)

```
todo,to-do,planificateur,agenda,organisation,autisme,toc,neuroatypique,routine,rappel,quotidien
```

**Promotional text** (167 / 170)

```
Une liste de tâches calme pour le TDAH, l'autisme et les TOC. Juste aujourd'hui, et rien n'est jamais en retard. Toute la boucle quotidienne est gratuite, pour de bon.
```

**Description** (3994 / 4000)

```
DoubleDone est une liste de tâches calme pour les adultes concernés par le TDAH, l'autisme, les TOC ou le trop-plein.

Elle ne te montre que ce dont aujourd'hui a besoin, et garde en silence tout ce que tu termines. Rien n'est jamais en retard. Ça attend, c'est tout.

Rien ici ne te fera jamais honte parce qu'une tâche existe. Pas de séries, pas de culpabilité, aucune punition pour une tâche qui a attendu.

DoubleDone est fait à Melbourne par Melroy. Il l'a créé pour des amis concernés par le TDAH ou les TOC, et pour toutes les personnes pour qui la liste, un jour, c'était trop.

LE CŒUR CALME, GRATUIT POUR TOUJOURS
- Vide ta tête. Une ligne par chose.
- Décompose-la : une tâche redoutée en petites étapes.
- Juste un petit bout : une version de deux minutes.
- Allège ta journée : les jours bien remplis, elle propose de déplacer quelques tâches vers les jours suivants. Rien ne bouge tant que tu n'as pas dit oui.
- Les tâches qui reviennent, à leur jour.
- Des rappels tout doux, seulement ceux que tu demandes, jamais une échéance.
- Settle : une pièce calme, un guide de respiration.
- Clore en douceur. On y honore ce que tu as fait, jamais ce que tu n'as pas fait.
- Ton Calendrier : tout ce que tu as vraiment terminé, même une tâche redoutée depuis des semaines.
- Un album souvenir IA gratuit par mois, une image de ce que tu termines.

NOTRE LISTE : PARTAGÉE AVEC UNE SEULE AUTRE PERSONNE
Gratuite. Rien n'y dit qui a fait quoi, et rien ne compte ni ne compare, cela ne peut donc pas devenir un tableau de scores. Ce qui a son propre jour, les poubelles le mardi, arrive dans vos deux Aujourd'hui ce jour-là. Le reste attend sur la liste, ta journée reste la tienne. La coche de l'un ou de l'autre vaut pour les deux. Ça commence par un code de six caractères, que tu lis à ta personne. Notre liste demande seulement la connexion par e-mail.

UNE IA QUI AIDE, ENTIÈREMENT OPTIONNELLE
L'IA est active par défaut : elle trie ce que tu déposes. Elle n'envoie que ce sur quoi tu l'utilises. Un seul geste dans les Réglages la désactive, et l'appli continue de fonctionner.

PREMIUM, SI UN JOUR TU EN VEUX PLUS
Premium ajoute des extras facultatifs : Scanner une liste, Épingler la chose du jour, Organiser ma journée, Trace ta route, six autres thèmes de couleur, un album souvenir chaque semaine, Tes tendances, et des choix illimités dans « Qu'est-ce qui colle en ce moment ».

DoubleDone Premium est un abonnement facultatif à renouvellement automatique, mensuel ou annuel, au prix que l'App Store t'affiche avant l'achat. Il est facturé sur ton identifiant Apple à la confirmation de l'achat. Il se renouvelle tout seul jusqu'à ce que tu l'annules. Tu peux l'annuler à tout moment dans les réglages de ton identifiant Apple, jusqu'à un jour avant le renouvellement. Si tu te connectes, tu peux aussi essayer Premium gratuitement pendant un mois : sans carte, sans prélèvement, et ça ne devient jamais un abonnement tout seul.

SUR TON APPAREIL PAR DÉFAUT
- Tes tâches restent sur ton appareil. Aucun compte n'est nécessaire.
- La synchro entre appareils est optionnelle : un e-mail, un code à 6 chiffres, aucun mot de passe à retenir.
- Ce que tu choisis pour une fonction IA est envoyé à Claude, d'Anthropic, et Anthropic ne s'en sert pas pour entraîner ses modèles. Les images des albums souvenirs sont créées avec les modèles d'IA de Cloudflare. On garde une copie, sans ton nom ni ton compte, pour améliorer la façon dont les tâches sont décomposées.
- Pas de pub. Aucun identifiant publicitaire, aucun suivi entre applis. Rien n'est vendu.

tu as le droit d'aller doucement

DoubleDone n'est pas un dispositif médical. L'appli ne diagnostique, ne traite, ne guérit ni ne prévient aucun problème de santé, et ne remplace pas le suivi d'un professionnel de santé. Pour un avis médical, adresse-toi à un professionnel de santé.

Politique de confidentialité (en anglais) : https://doubledone.app/privacy
Conditions d'utilisation (en anglais) : https://doubledone.app/terms
```

---

## Italian (`it-IT`)

**Name** (30 / 30)

```
DoubleDone: lista cose da fare
```

**Subtitle** (30 / 30)

```
Per l'ADHD. Niente in ritardo.
```

**Keywords** (99 / 100)

```
attività,todo,planner,agenda,promemoria,autismo,doc,neurodivergente,routine,organizzazione,giornata
```

**Promotional text** (166 / 170)

```
Una lista calma di cose da fare per ADHD, autismo e DOC. Solo oggi, una giornata fattibile, e niente è mai in ritardo. Tutto il ciclo quotidiano è gratis, per sempre.
```

**Description** (3991 / 4000)

```
DoubleDone è una lista calma di cose da fare per adulti con ADHD, autismo, DOC e sovraccarico mentale.

Ti mostra solo ciò che serve oggi, e conserva in silenzio tutto quello che finisci. Niente è mai in ritardo. Semplicemente aspetta.

Quasi tutte le app di cose da fare ti danno la lista intera e la chiamano motivazione. Per molti, è proprio lì che arriva il troppo. DoubleDone fa il contrario. Una schermata calma, una giornata piccola, e niente ti farà mai sentire in colpa perché un'attività esiste. Nessuna serie da mantenere, e nessuna punizione per un'attività che ha aspettato.

DoubleDone è fatta a Melbourne da Melroy. L'ha creata per amici con ADHD e DOC, e per chiunque abbia mai sentito che la lista era troppa.

IL CUORE CALMO, GRATIS PER SEMPRE
- Svuota la testa, una cosa per riga.
- Dividi in passaggi, un'attività che temi diventa passaggi da pochi minuti.
- Falla minuscola, una versione da due minuti per iniziare.
- Alleggerisci la giornata, nei giorni pieni propone di spostare qualche attività ai giorni successivi. Non si sposta niente finché non dici di sì.
- Ricorrenti, le attività che ritornano.
- Promemoria gentili, solo quelli che chiedi tu, mai una scadenza.
- Settle, una stanza tranquilla con una guida al respiro.
- Chiudi la giornata. Onora quello che hai fatto, mai quello che non hai fatto.
- Calendario, tutto quello che hai portato a termine, anche un'attività che temevi da settimane.
- Un album dei ricordi gratis ogni mese, fatto con l'AI.

LA NOSTRA LISTA: UNA LISTA PER DUE PERSONE
Gratis, e in due soltanto. Nulla dice chi ha fatto cosa, e nulla conta o confronta, quindi non può diventare una classifica. Ciò che ha un giorno suo, i rifiuti il martedì, arriva su entrambi i vostri Oggi quel giorno. Quello che non ce l'ha resta sulla lista. La spunta di uno dei due vale per entrambi. Si comincia leggendo un codice di sei caratteri alla tua persona, e serve solo l'accesso via email.

L'AI CHE AIUTA, DEL TUTTO FACOLTATIVA
L'AI è attiva di default e fa un lavoro vero: ordina in una giornata quello che hai buttato giù. Invia solo quello su cui la usi. Un tocco nelle Impostazioni la spegne, e l'app continua a funzionare.

PREMIUM, SE UN GIORNO VUOI DI PIÙ
Premium aggiunge extra facoltativi: Scansiona una lista, Fissa la cosa di oggi, Organizza la giornata, Traccia la rotta, sei temi di colore in più, un album della settimana, Le tue tendenze e le scelte senza limiti in Cosa ci sta adesso.

DoubleDone Premium è un abbonamento facoltativo a rinnovo automatico, mensile o annuale, al prezzo che l'App Store ti mostra prima dell'acquisto. L'addebito avviene sul tuo ID Apple alla conferma dell'acquisto. Si rinnova da solo finché non lo annulli. Puoi annullarlo quando vuoi dalle impostazioni del tuo ID Apple, fino a un giorno prima del rinnovo. Dopo aver fatto l'accesso, puoi anche provare Premium gratis per un mese: nessuna carta, nessun addebito, e non diventa mai un abbonamento da solo.

SUL TUO DISPOSITIVO, DI DEFAULT
- Le tue attività restano sul tuo dispositivo. Non serve un account.
- Sincronizzare tra dispositivi è facoltativo: un'email e un codice usa e getta, nessuna password.
- Quello che scegli per una funzione AI lo riceve Claude di Anthropic, e Anthropic non lo usa per addestrare i suoi modelli. Le immagini dell'album dei ricordi sono create con i modelli AI di Cloudflare. Di quello che invii conserviamo una copia senza il tuo nome né il tuo account, per migliorare il modo in cui le attività vengono divise in passaggi.
- Niente pubblicità. Nessun identificativo pubblicitario né tracciamento tra app. Niente viene venduto.

hai il permesso di andare piano

DoubleDone non è un dispositivo medico. Non diagnostica, non tratta, non cura né previene alcuna condizione di salute, e non sostituisce il supporto di un professionista. Per un consiglio medico, rivolgiti a un professionista della salute.

Privacy (in inglese): https://doubledone.app/privacy
Termini d'uso (in inglese): https://doubledone.app/terms
```

