# Play store listings, localised (de / es / fr / it)

*Written 2026-08-16 for 1.3.1. Paste-ready. Every count below is measured in characters with
`scripts/check-listings.mjs`, never estimated, and that script is the gate to re-run after any edit.*

*Cut 2026-09-27 for Path C: the Android app sells nothing (see
[play-store-release.md](play-store-release.md) 5d). Every Premium block, price and Stripe line is gone
from all four listings, and so is the one paid-only feature the French and Italian named in their AI
paragraph (the photo scan, "avec Premium" / "con Premium"). The counts below are re-measured. The trim
notes under each listing record the 2026-08-16 trim and are kept as history. Where they call the Stripe
line and the prices protected, that rule is now reversed: the gate fails on them.*

*Fixed 2026-10-19 for 1.9.0 (store 1.9, slice 8), and each listing's notes say exactly what changed. Every
line the code proved false went, replaced from the landing strings, which already had a native review and a
truth check: the "private by default" heading (`privTitle`), the AI-off "no text leaves your device" lines
(`priv2`: sync, Ours, a feedback note and the usage counts still run with AI off), "no third-party trackers"
(`priv3`: RevenueCat gets an install id on every Android phone, which the Data Safety form declares) and
"export your data" (`priv4`). Lighten today is now a suggestion that moves nothing until you say yes
(`m2Body`), the monthly scrapbook is named as AI (it is hidden with AI off), and each listing gains a title,
the founder line (`founder`), a Premium paragraph from `faqFreeA` (Android sells Premium through Google Play
since Path A, and the free-month sentence stays out under Play's trial ban) and a second medical sentence
(Melroy's call 9). Spanish is neutral now, one text for es-ES and es-419. These changes join the batch's one
native read.*

## Why these are not machine-translated

Google Play Console offers "Import translations with AI". It was considered and rejected, for three
reasons that are specific to this app rather than general suspicion of the tool.

**1. The one rule cannot survive it.** [The German glossary](design-source/german-glossary.md) bans
four particles outright: `endlich`, `schon wieder`, `erst jetzt`, `immer noch`. The English
listing contains "including the old task you dreaded for weeks", and the natural German for that
line uses **endlich**. That single word converts *never shame the backlog*, the one rule the product
says can never break, into the exact reproach the app exists to refuse. No translation engine can
know that rule exists.

**2. The app speaks five languages; the tool speaks fifty.** A well-translated listing in a language
the app does not ship sends a shopper to an English app. For an audience defined by low tolerance
for friction, that is worse than not being listed there.

**3. The vocabulary is already settled and is not the translator's to choose.** Every feature named
here has a name in `client/src/lib/catalogs/<locale>.ts`, chosen by a translation panel. A shopper
reads the listing and then opens the app. Break-it-down is **„Mach Schritte draus"**, not
*„Zerlegen"*, and the glossary records *why* the obvious alternative was rejected.

So these were transcreated from the shipped catalogs instead: one terminology lead per language
mapping each listing concept to the exact string the app already shows, one writer bound to that
map, then two hostile reviewers per language, one hunting shame and register, one checking every
claim against the app a speaker of that language actually gets.

**That review raised 37 serious defects across four languages.** Every one is applied here. The kind
of thing it caught:

- The German claimed *"dann wird nichts mehr irgendwohin geschickt"* (then nothing is sent anywhere
  any more). False: the Settle usage beacon in `client/src/lib/telemetry.ts` fires regardless of the
  AI setting, and the Play Data Safety form declares it. The English was never wrong, because it says
  "nothing **you type**"; the German had dropped the qualifier. Now narrowed in every language.
- The German closing line promised the privacy policy *"in klarem Deutsch"*. The policy at that URL
  is English. Now says so.
- The Spanish put **Scan** in the free list. It is Premium.
- The Italian said *"nessuna colpa per un'attività"*, which attaches the guilt to the task rather
  than protecting the reader, and used a definite article that points a finger at a specific task.
- The German inverted `welcome.lead2`: the app says your brain *cannot tell you that you did
  nothing*, the draft said your brain *cannot tell you otherwise*, which makes the record overrule
  the reader instead of defending them.

None of those is a translation error. They are product errors that only show up in translation, and
no engine would have caught any of them.

## The English listing

It lives only in [play-store-submission-pack.md](play-store-submission-pack.md): the title, the short and
the full description. Until 2026-10-19 this doc held a second English short description that never shipped,
and the gate passed both, so the copy here is gone and the gate now fails on any English block in this file.

---

## German (`de-DE`)

**Title** (28 / 30)

```
DoubleDone: ADHS-To-do-Liste
```

**Short description** (78 / 80)

```
Ruhige To-dos für ADHS und Überforderung. Nur heute. Nichts ist je überfällig.
```

**Full description** (3970 / 4000)

```
Heute ist überschaubar und machbar.

DoubleDone zeigt dir nur, was heute dran ist, in machbarer Größe, und bewahrt still alles auf, was du schaffst. Nichts ist je überfällig. Es wartet einfach. Nichts hier wird dich je dafür beschämen, dass eine Aufgabe einfach da ist.

Gemacht für
ADHS, Autismus, Zwangsstörungen, Menschen, bei denen mehreres davon zusammenkommt, und alle, deren Liste sich jemals nach zu viel angefühlt hat. Die meisten To-do-Apps legen dir die ganze Liste hin und nennen das Motivation. Hier ist es andersherum: keine Streaks, keine Schuldgefühle, kein Rot. DoubleDone wird in Melbourne von Melroy gemacht. Er hat es für Freundinnen und Freunde mit ADHS und Zwangsstörungen gebaut.

Der ruhige Kern, kostenlos für immer
- Schreib dir den Kopf leer. Eine Zeile pro Sache, die Reihenfolge ist unser Job.
- Nur heute. Der Rest kann warten.
- Mach Schritte draus: eine zu große Aufgabe wird zu kleinen Schritten.
- Mach es winzig: eine Zwei-Minuten-Version, nur zum Anfangen.
- Mach heute leichter: schlägt an einem vollgepackten Tag vor, ein paar Dinge auf spätere Tage zu verschieben. Verschoben wird erst, wenn du Ja sagst.
- Wiederkehrend, Routinen und Rhythmen, für alles, was wiederkommt.
- Erinnerungen, nur die, um die du bittest, nie eine Deadline.
- Settle: ein ruhiger Raum mit Atembegleitung, wenn heute laut ist.
- Feierabend machen. Er würdigt, was du getan hast, nie, was du nicht getan hast.
- Dein Kalender: alles, was du wirklich geschafft hast, auch die Aufgabe, vor der du wochenlang Bammel hattest. Dein Gehirn kann dir nicht erzählen, du hättest nichts getan.
- Ein kostenloses KI-Erinnerungsalbum im Monat, ein Bild von dem, was du geschafft hast.

Unsere Liste: eine gemeinsame Liste mit einem anderen Menschen
Kostenlos. Nichts darauf sagt, wer was getan hat, und nichts zählt oder vergleicht. Ein Wettbewerb kann daraus nicht werden.

Was einen eigenen Tag hat, die Mülltonne am Dienstag, erscheint an dem Tag in euren beiden Heute. Was keinen hat, Milch und Batterien, bleibt auf der Liste und erreicht niemandes Tag. Wer abhakt, hakt für beide ab.

Sie fängt damit an, dass du deinem Menschen einen Code aus sechs Zeichen vorliest. Es gibt keinen Feed, erreichen kann dich nur, wem du ihn gegeben hast. Verlassen kann sie jeder von euch, wann er mag, ohne Grund. Nötig ist nur die Anmeldung per E-Mail.

KI, die hilft, ganz freiwillig
Die KI ist von Haus aus an und macht echte Arbeit. Freiwillig ist sie trotzdem, und sie schickt nur das, wofür du sie nutzt. Ein Fingertipp in den Einstellungen schaltet sie aus, und die App funktioniert weiter.

Premium, wenn du mehr möchtest
Premium ergänzt optionale Extras über Google Play: „Liste scannen“, „Deine eine Sache anpinnen“, „Plan meinen Tag“, „Kurs setzen“, sechs weitere Farbthemen, ein wöchentliches Erinnerungsalbum, „Deine Muster“ und Vorschläge ohne Limit bei „Was passt gerade“.

Von Haus aus auf deinem Gerät
- Deine Aufgaben liegen auf deinem Gerät. Kein Konto nötig.
- Synchronisieren auf allen Geräten: optional, eine E-Mail-Adresse, ein einmaliger Code, kein Passwort.
- Was du für eine KI-Funktion auswählst, geht an Claude von Anthropic, und Anthropic trainiert damit keine KI-Modelle. Die Bilder im Erinnerungsalbum entstehen mit KI-Modellen von Cloudflare. Wir behalten eine Kopie ohne deinen Namen und ohne Bezug zu deinem Konto, damit aus Aufgaben bessere Schritte werden.
- Keine Werbung. Keine Werbe-IDs und kein Tracking über Apps hinweg. Nichts wird verkauft.
- Exportiere jederzeit deine Aufgaben und alles, was du geschafft hast. Falls du dich angemeldet hast, löschst du dein Konto und deine synchronisierten Daten in den Einstellungen.

du darfst langsam machen

DoubleDone ist kein Medizinprodukt. Die App diagnostiziert, behandelt, heilt oder verhindert keine Erkrankungen und ersetzt keine professionelle Hilfe. Für medizinischen Rat wende dich an medizinisches Fachpersonal.

Die Datenschutzerklärung, in klarem Englisch: doubledone.app/privacy
```

<details><summary>What was trimmed, and why those lines were the safest to lose</summary>

**2026-09-27, Path C:** the whole Premium block went (the heading, nine bullets, the trial and A$ price line, the Stripe line). Full description now 3063 characters. Everything below is the 2026-08-16 record.

**2026-10-16:** the not-a-medical-device line went in just before the privacy line, matching the English listing (a5d3031). Full description now 3216 characters.

**2026-10-19 (store 1.9, slice 8):** a title, the App Store's German name, so one name serves each language on both stores. The AI-off "dann verlässt kein Text mehr dein Gerät" went (false: sync, Ours, a feedback note and the usage counts still run), and the AI paragraph now ends with `priv2`'s words. "Privat von Haus aus" became `privTitle`, "Keine Tracker von Dritten" became `priv3`, "Deine Daten exportieren" became `priv4`. "Mach heute leichter: Aufgaben wandern auf spätere Tage" became a suggestion that moves nothing until you say yes (`m2Body`). The monthly album is a KI-Erinnerungsalbum, because it is hidden with AI off. The Claude bullet says what you choose rather than only text (Scan sends a photo) and names Cloudflare, from `faqAiA`. "je nach zu viel" became "jemals nach zu viel", here and in the five landing and welcome lines that share it (the Backlog's rule: all together). Added: `founder`, a Premium paragraph from `faqFreeA` with "über Google Play", and "Für medizinischen Rat wende dich an medizinisches Fachpersonal." Cut for room: Zusammenlegen. Full description now 3969 characters.

**2026-10-19, later (Melroy's call):** the Claude bullet ends with `faqAiA`'s kept-copy sentence, "Wir behalten eine Kopie ohne deinen Namen und ohne Bezug zu deinem Konto, damit aus Aufgaben bessere Schritte werden.", as the privacy policy and the Spanish listing already said. Room, the same cut as the App Store's German: the AI paragraph's two examples went ("sie sortiert deinen leergeräumten Kopf ... kleine Schritte"), which the free list above names in the app's own words. Full description now 3970 characters.

**2026-10-19 (the native German read):** the title is "DoubleDone: ADHS-To-do-Liste". A German compound that
starts with an abbreviation takes the hyphen (ADHS-Ratgeber, Kfz-Steuer), and without it a careful reader sees the
missing hyphen right beside the hyphenated To-do-Liste. The App Store's German name takes the same fix, so one name
still serves both stores, and search is unaffected because both stores break words at a hyphen. Title still
28 characters, full description unchanged at 3970.

Full description: 4005 to 3909 characters (96 cut, 41 under the 3950 target). Short description: 78 characters.

Four edits, no bullet and no heading removed, so every feature a shopper chooses on is still listed.

1. Deleted "Ist sie aus, verlässt nichts dein Gerät." from the privacy bullet (40 chars). This was the biggest single win and it was also the only real liability in the text: it is exactly the over-broad "nothing is sent at all" claim, which the anonymous feature-usage beacon declared in the Data Safety form contradicts. The narrow qualifier survives untouched one paragraph above, in the AI section: "dann verlässt kein Text mehr dein Gerät", text only. The bullet itself still carries the full "an ist" claim, Claude von Anthropic, never for model training.

2. Replaced "Die App läuft komplett auf deinem Gerät weiter." with "Die App funktioniert auch ohne sie." (12 chars). Same reassurance, that switching AI off does not break the app, without the "komplett auf deinem Gerät" phrasing that a careful reader could take as a second, broader no-network claim.

3. Deleted ", niemand macht dir den Morgen schwerer" from the Ours paragraph (39 chars). Pure subordinate restatement: "erreicht niemandes Tag" has already made that exact point in the same sentence, in the app's own concrete terms.

4. Rewrote "Unser braucht nur die Anmeldung per E-Mail." as "Nötig ist nur die Anmeldung per E-Mail." (4 chars). "Unser" was a dangling adjective with no noun and did not match the feature's German name in the app, which is "Unsere Liste". Fixes a small grammar bug while saving characters.

Nothing protected was touched: the privacy URL, the Stripe-not-Google-Play line, A$5 / A$50 / one free month / no card, free forever in both places, the never-shame sentence, and all six Ours facts (two people, free, no record of who did what, six-character code, either can leave) are verbatim.

Short description, 78 characters: "Ruhige To-dos für ADHS und Überforderung. Nur heute. Nichts ist je überfällig." Beats two and three are lifted verbatim from the catalog: "Nur heute." opens today.subtitle and "Nichts ist je überfällig." opens welcome.lead2, so the store and the app now say the same words. "je" carries "ever" as a permanent property, not a status report. Kept the "To-do" search token by using "To-dos" rather than "To-do-App", which is what bought the room for "Ruhige" and "Überforderung" to both survive under 80. Chose "für" over "bei", since German "bei" plus a condition is how medicines advertise and reads as a treatment claim. No shared list, no AI caveat.

</details>

---

## Spanish, neutral, one text for es-ES and es-419 (`es-ES`)

**Paste this one text under both es-ES and es-419.** Neutral tú, never vosotros or ustedes,
so it reads as home in Spain and Latin America alike.

**Title** (28 / 30)

```
DoubleDone: tareas para TDAH
```

**Short description** (75 / 80)

```
Tu lista para el TDAH y el agobio. Solo hoy. Aquí nada está nunca atrasado.
```

**Full description** (3888 / 4000)

```
Hoy es finito y alcanzable.

DoubleDone te muestra solo lo que hoy necesita, en su justa medida, y guarda en silencio todo lo que terminas. Aquí nada está nunca atrasado. Solo espera.

Casi todas las apps de tareas te ponen la lista entera delante y lo llaman motivación. Para muchos, eso es justo el agobio. DoubleDone hace lo contrario: un día pequeño y una lista que nunca te hará sentir mal por una tarea que simplemente existe.

HECHA PARA
El TDAH, el autismo, el TOC, por separado o a la vez, y cualquiera que alguna vez haya sentido que su lista era demasiado. Sin rachas que mantener, sin culpa, sin castigar una tarea por existir ni por esperar. DoubleDone está hecha en Melbourne por Melroy. La creó para amigos con TDAH y TOC.

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
- Calendario: todo lo que terminaste, incluso esa tarea que te dio pavor durante semanas. Tu cerebro no podrá decirte que no hiciste nada.
- Un álbum gratis al mes, hecho con IA: una imagen de recuerdo de lo que terminaste.

NUESTRA LISTA: UNA SOLA LISTA COMPARTIDA CON OTRA PERSONA
Gratis, y de dos personas exactamente. Nada dice quién hizo qué, y nada cuenta ni compara, así que no puede volverse un marcador.

Lo que tiene día propio, la basura el martes, llega al Hoy de los dos ese día. Lo que no tiene día, la leche y las pilas, se queda en la lista, por larga que sea, para que tu día siga siendo tuyo. Cualquiera de los dos marca una tarea, y queda hecha para ambos.

Cada uno inicia sesión con su correo, y el código de seis caracteres que le lees a tu persona solo sirve para la dirección que pusiste. Nadie llega a ti si no le diste ese código. Cualquiera de los dos sale cuando quiera, sin explicaciones, y todo se puede seguir leyendo.

UNA IA QUE AYUDA, Y OPCIONAL DEL TODO
La IA viene activada y hace trabajo real: ordena lo que te sacas de la cabeza en un día posible y divide una tarea difícil en pasos. Pero es opcional de verdad, y solo envía aquello en lo que la usas. Un toque en Ajustes la apaga, y la app sigue funcionando.

PREMIUM, SI ALGUNA VEZ QUIERES MÁS
Premium añade extras opcionales a través de Google Play: Escanea una lista, Fija lo más importante de hoy, Planea mi día, Traza un plan, seis temas de color más, un álbum semanal, Tus patrones y sugerencias sin límite en Qué encaja ahora mismo.

EN TU DISPOSITIVO POR DEFECTO
- Tus tareas viven en tu dispositivo. No hace falta cuenta para usarla.
- Sincronizar entre dispositivos es opcional, y solo pide un correo y un código de un solo uso.
- Lo que eliges para una función de IA va a Claude, de Anthropic, y Anthropic no lo usa para entrenar sus modelos. Las imágenes del álbum se crean con modelos de IA de Cloudflare. Guardamos una copia sin nombre ni cuenta para mejorar los pasos.
- Sin anuncios. Sin identificadores publicitarios ni seguimiento entre apps. No se vende nada.
- Exporta tus tareas y lo que has terminado cuando quieras. Si has iniciado sesión, puedes borrar tu cuenta y los datos sincronizados en Ajustes.

tienes permiso para ir despacio

DoubleDone no es un producto sanitario. No diagnostica, trata, cura ni previene ninguna afección, y no sustituye la atención de un profesional. Si necesitas consejo médico, consulta con un profesional de la salud.

Lee la política de privacidad, en lenguaje claro, en doubledone.app/privacy.
```

<details><summary>What was trimmed, and why those lines were the safest to lose</summary>

**2026-09-27, Path C:** the whole Premium block went (the heading, eight bullets, the trial and A$ price line, the Stripe line). Full description now 3174 characters. Everything below is the 2026-08-16 record.

**2026-10-16:** the not-a-medical-device line went in just before the privacy line, matching the English listing (a5d3031). Full description now 3319 characters.

**2026-10-19 (store 1.9, slice 8):** neutral now, one text pasted under es-ES and es-419 (the live es-419 text had no source in this repo). The two vosotros lines went: "llega a vuestros dos Hoy" is "llega al Hoy de los dos" and "Los dos iniciáis sesión" is "Cada uno inicia sesión" (`m4Body`). "así que tu persona no te carga la mañana" went (false: your person can give a shared row today's date) for "por larga que sea, para que tu día siga siendo tuyo". The AI-off "el texto que escribes ya no sale de tu dispositivo" lines went (the AI paragraph now carries `priv2`'s "solo envía aquello en lo que la usas"), "PRIVADO POR DEFECTO" became `privTitle`, "rastreadores de terceros" became `priv3`, "Exporta tus datos" became `priv4`, and Aligera el día is a suggestion (`m2Body`). The monthly album is "hecho con IA", and the Claude bullet names Cloudflare. Added: a title, `founder`, a Premium paragraph from `faqFreeA`, and "Si necesitas consejo médico, consulta con un profesional de la salud." Then, from the native read, "La marca cualquiera de los dos" became "Cualquiera de los dos marca una tarea": after "se queda en la lista" the "la" read as the list, and the catalogue's own `sharedLead2` puts the subject first too. Full description now 3888 characters.

4372 to 3933 characters (cap 4000, target 3950). Short description is 75 characters.

First, the file had three corruptions that were costing characters and credibility, so those went before any real trimming: an unexecuted editor's note sitting in the Ours paragraph ("(delete the later sentence ... it is now covered)") plus the duplicate sentence it referred to; a doubled clause in the AI paragraph ("ordena lo que te sacas de la cabeza en un día posible" written twice); and a doubled fragment plus stray double full stop in the privacy bullet ("Con la IA activada, a Claude, de Anthropic," written twice, "los pasos.."). That alone recovered roughly 300 characters with nothing of substance lost.

Then, by the stated order:
1. Intensifiers and repeated ideas: "Poca fricción" in HECHA PARA (the whole list below it already says that); "todo en tu dispositivo" trailing the AI paragraph (the privacy section states it properly); "No hay muro ni nada que curiosear" in Ours (the next clause, nobody reaches you without the code, makes the same point and is the concrete one).
2. Weakest bullets, one per list. Free list: "Combinar: une tareas parecidas" went, it is the item a shopper is least likely to choose on and it half-overlaps Divídela en pasos. Premium list: "Elección según tu energía sin límites" went, it needs the most explaining and lands the least cold. I kept the scan-a-photo, pin-one-thing, plan-my-day and themes items, which are what people actually buy.
3. Subordinate clauses restating the main clause: "se cierra para los dos" after "Cualquiera de los dos sale cuando quiera" (leaving is mutual by definition, and "todo se puede seguir leyendo" is the part that reassures).

One safety fix that was not a cut. The privacy bullet read "Apagada, nada sale de tu dispositivo", which is broader than the truth and broader than the Data Safety declaration, since the anonymous feature-usage beacon still fires. It now reads "Con la IA apagada, ese texto ya no sale de tu dispositivo", scoped to the typed text only, and the AI paragraph was narrowed the same way. Everything on the never-cut list survives verbatim in effect: the privacy URL, the Stripe-not-Google-Play line, A$5 / A$50 / one free month / no card needed, free forever stated twice, the never-shame-the-backlog sentence now carrying both halves ("sin castigar una tarea por existir ni por esperar"), and all six Ours facts.

Short description: lifts the app's own Spanish. "Solo hoy" is the today subtitle ("Solo hoy. Lo demás puede esperar.") and "Aquí nada está nunca atrasado" is the welcome lead2 verbatim. Keeping "Aquí" is what makes beat 3 read as a property of the app rather than a status report about your list. "Tu lista para el TDAH y el agobio" opens informally and lets the reader self-identify in four words. Shared lists and the AI caveat stay out.

</details>

---

## French (`fr-FR`)

**Title** (28 / 30)

```
DoubleDone : liste de tâches
```

**Short description** (77 / 80)

```
Pour le TDAH et la surcharge. Juste aujourd'hui. Rien n'est jamais en retard.
```

**Full description** (3950 / 4000)

```
Aujourd'hui a une fin, et tu peux y arriver.

DoubleDone ne te montre que ce dont aujourd'hui a besoin, et garde en silence tout ce que tu termines. Rien n'est jamais en retard. Ça attend, c'est tout.

La plupart des applis te tendent la liste entière et appellent ça de la motivation. DoubleDone fait l'inverse. Rien ici ne te fera jamais honte parce qu'une tâche existe.

CONÇUE POUR
Le TDAH, l'autisme, les TOC, et toutes les personnes pour qui la liste, un jour, c'était trop. Pas de séries, pas de culpabilité, aucune punition pour une tâche qui a attendu. DoubleDone est fait à Melbourne par Melroy. Il l'a créé pour des amis concernés par le TDAH ou les TOC.

LE CŒUR CALME, GRATUIT POUR TOUJOURS
- Vide ta tête. Une ligne par chose.
- Voici aujourd'hui, taillé pour être faisable.
- Décompose-la : une tâche redoutée en petites étapes.
- Juste un petit bout : une version de deux minutes.
- Allège ta journée : les jours bien remplis, elle propose de déplacer quelques tâches vers les jours suivants. Rien ne bouge tant que tu n'as pas dit oui.
- Regrouper : fusionne les tâches semblables.
- Les tâches qui reviennent, à leur jour.
- Des rappels tout doux, seulement ceux que tu demandes, jamais une échéance.
- Settle : une pièce calme, un guide de respiration, quand aujourd'hui fait du bruit.
- Clore en douceur. On y honore ce que tu as fait, jamais ce que tu n'as pas fait.
- Ton Calendrier : tout ce que tu as vraiment terminé, même une tâche redoutée depuis des semaines. Ton cerveau ne pourra plus te dire que tu n'as rien fait.
- Un album souvenir IA gratuit par mois, une image de ce que tu termines.

NOTRE LISTE : PARTAGÉE AVEC UNE SEULE AUTRE PERSONNE
Gratuite. Rien n'y dit qui a fait quoi, et rien ne compte ni ne compare, cela ne peut donc pas devenir un tableau de scores.

Ce qui a son propre jour, les poubelles le mardi, arrive dans vos deux Aujourd'hui ce jour-là. Le reste attend sur la liste, ta journée reste la tienne. La coche de l'un ou de l'autre vaut pour les deux.

Ça commence par un code de six caractères, que tu lis à ta personne. Pas de fil d'actualité, personne ne peut te joindre ici sans ce code. Vous partez quand vous voulez, sans raison à donner. Notre liste demande seulement la connexion par e-mail.

UNE IA QUI AIDE, ENTIÈREMENT OPTIONNELLE
L'IA est active par défaut : elle trie ce que tu déposes et décompose une tâche difficile. Elle n'envoie que ce sur quoi tu l'utilises. Un seul geste dans les Réglages la désactive, et l'appli continue de fonctionner.

PREMIUM, SI UN JOUR TU EN VEUX PLUS
Premium ajoute des extras facultatifs, via Google Play : Scanner une liste, Épingler la chose du jour, Organiser ma journée, Trace ta route, six autres thèmes de couleur, un album souvenir chaque semaine, Tes tendances, et des choix illimités dans « Qu'est-ce qui colle en ce moment ».

SUR TON APPAREIL PAR DÉFAUT
- Tes tâches restent sur ton appareil. Aucun compte n'est nécessaire.
- La synchro entre appareils est optionnelle : un e-mail, un code à 6 chiffres, aucun mot de passe à retenir.
- Ce que tu choisis pour une fonction IA est envoyé à Claude, d'Anthropic, et Anthropic ne s'en sert pas pour entraîner ses modèles. Les images des albums souvenirs sont créées avec les modèles d'IA de Cloudflare. On garde une copie, sans ton nom ni ton compte, pour améliorer la façon dont les tâches sont décomposées.
- Pas de pub. Aucun identifiant publicitaire, aucun suivi entre applis. Rien n'est vendu.
- Exporte tes tâches et ce que tu as terminé quand tu veux. Si tu as un compte, supprime-le dans les Réglages, avec tes données synchronisées.

tu as le droit d'aller doucement

DoubleDone n'est pas un dispositif médical. L'appli ne diagnostique, ne traite, ne guérit ni ne prévient aucun problème de santé, et ne remplace pas le suivi d'un professionnel de santé. Pour un avis médical, adresse-toi à un professionnel de santé.

La politique de confidentialité, en clair : doubledone.app/privacy.
```

<details><summary>What was trimmed, and why those lines were the safest to lose</summary>

**2026-09-27, Path C:** the whole Premium block went (the heading, nine bullets, the trial and $A price line, the Stripe line), and so did ", et, avec Premium, lit la photo d'une liste et en fait des tâches" from the AI paragraph, which now reads "elle trie ce que tu déposes et décompose une tâche difficile." Full description now 2913 characters. Everything below is the 2026-08-16 record.

**2026-10-16:** the not-a-medical-device line went in just before the privacy line, matching the English listing (a5d3031). Full description now 3101 characters.

**2026-10-19 (store 1.9, slice 8):** a title, the App Store's French name. "plus rien de ce que tu écris ne part" and "Sinon, rien de ce que tu écris ne sort de ton appareil" went (false with AI off: sync, Ours, a feedback note and the usage counts still run), and the AI paragraph now carries `priv2`'s words. "PRIVÉ PAR DÉFAUT" became `privTitle`, "Aucun traqueur tiers" became `priv3`, "Exporte tes données" became `priv4`, and Allège ta journée is a suggestion (`m2Body`). The monthly album is an "album souvenir IA", and the Claude bullet names Cloudflare. Added: `founder`, a Premium paragraph from `faqFreeA`, and "Pour un avis médical, adresse-toi à un professionnel de santé." The Ours lines were already true and are untouched. Every colon, question mark and guillemet now takes U+00A0, which the gate enforces. Full description now 3830 characters.

**2026-10-19 (the store 1.9 build review):** "Rappel quotidien : un seul, tout doux, jamais une échéance." said there is one reminder, a daily one, and both phone apps also have per-task reminders, « Tiens-moi à ça » and the Rythmes (the catalogue's own `faqWhereA`). It is now "Des rappels tout doux, seulement ceux que tu demandes, jamais une échéance.", the idea the other four languages carry, the same on the App Store. Full description now 3846 characters.

**2026-10-19, later (Melroy's call):** the Claude bullet ends with `faqAiA`'s kept-copy sentence, "On garde une copie, sans ton nom ni ton compte, pour améliorer la façon dont les tâches sont décomposées.", as the privacy policy and the Spanish listing already said. It fits without a cut here. The App Store's French made room with two deletions: the breakdown example in its AI paragraph, and "quand aujourd'hui fait du bruit" after Settle. Full description now 3952 characters.

**2026-10-19 (the native French read):** the Premium heading is "PREMIUM, SI UN JOUR TU EN VEUX PLUS". Without the "en", a French ear hears the spoken "tu (ne) veux plus", you no longer want it, and "en vouloir plus" is the idiom for wanting more. The App Store's French takes the same fix. Full description now 3955 characters.

**2026-10-19 (the colour and copy review, after the native read):** "L'un ou l'autre la coche, elle est faite pour les deux." is "La coche de l'un ou de l'autre vaut pour les deux." The nearest feminine nouns before "la coche" are "la tienne" (ta journée) and "la liste", so it read as one of you ticking your day, or the list: the slip the Spanish and Italian readers fixed in their own Ours lines. The new line is the Italian fix's shape ("La spunta di uno dei due vale per entrambi"). The App Store's French takes the same fix. It goes back to the French reader before paste day, since they passed the old one. Full description now 3950 characters.

4029 to 3853 characters, verified in Python (UTF-8, trailing newline excluded), so 97 under the 3950 target and 147 under Google's cap. Every cut was a repeat, never a fact, and no bullet was lost: the adjective and clause layer alone freed enough room, so both bullets I first removed (Regrouper, Silencieuse) went back in.

Six removals, all duplication:
1. Opening paragraph, "une journée taillée pour être faisable" (37 chars). The free-features list says the same thing a few lines later in "Voici aujourd'hui, taillé pour être faisable", so the lead now runs straight into "Rien n'est jamais en retard", which is the stronger line anyway.
2. CONÇUE POUR, "Peu de friction" (17). "Pas de séries, pas de culpabilité" is the concrete version of the same claim, immediately after it.
3. Ours, "il n'arrive sur la journée de personne" (39). The clause that follows it, "ta journée reste la tienne", says it warmer and in fewer words.
4. Ours, "pas de navigation" (19). Sat between "pas de fil d'actualité" and "personne ne peut te joindre ici sans ce code", both of which carry the no-social-surface point better.
5. AI paragraph, "et fait un vrai travail" (23). The three examples that follow it demonstrate the work instead of asserting it.
6. AI paragraph, "Mais elle est vraiment optionnelle" (34). The section heading directly above already reads ENTIÈREMENT OPTIONNELLE, and the next sentence gives the actual off switch.

Untouched, in full: the privacy section and the privacy URL, the Stripe-not-Google-Play line, A$5 / A$50 / one free month / no card, "gratuit, pour toujours", "Rien ici ne te fera jamais honte parce qu'une tâche existe" plus "aucune punition pour une tâche qui a attendu", and all six Ours facts. The AI qualifier stays narrow in both places: "plus rien de ce que tu écris ne part" and "seul le texte que tu choisis part vers Claude d'Anthropic", never a claim that nothing at all is sent, so the Data Safety declaration for the usage beacon still holds. The closing "tu as le droit d'aller doucement" is untouched, lowercase and all.

Diacritics: the accent inventory of the trimmed text is byte-identical to the original's (é è ê à â î ù ç É È Ç Œ), checked by codepoint, so nothing was flattened. No ô or û because no word in this copy takes one. No em-dashes, no exclamation marks, tutoiement throughout.

Short description, 77 characters. It lifts the app's own French: "Juste aujourd'hui" is the today screen's subtitle (lead: "Juste aujourd'hui. Le reste peut attendre."), and "Rien n'est jamais en retard" is welcome.lead2 verbatim. "Jamais" sits inside a present-tense statement about the app, so it reads as a property, not a status. Audience first for instant self-recognition, and the shared list and the AI caveat are deliberately absent. A 79-character variant leading with "Appli calme" was dropped: naming the category cost more than it bought, since the title carries it and beat 3 is what sells.

</details>

---

## Italian (`it-IT`)

**Title** (30 / 30)

```
DoubleDone: lista cose da fare
```

**Short description** (74 / 80)

```
Cose da fare per ADHD e per il troppo. Solo oggi. Niente è mai in ritardo.
```

**Full description** (3992 / 4000)

```
Oggi ha una fine, ed è fattibile.

DoubleDone ti mostra solo ciò che serve oggi, e conserva in silenzio tutto quello che finisci. Niente è mai in ritardo. Semplicemente aspetta.

Quasi tutte le app di cose da fare ti danno la lista intera e la chiamano motivazione. Per tanti di noi, è proprio lì che arriva il troppo. DoubleDone fa il contrario. Una schermata calma, una giornata piccola, e niente ti farà mai sentire in colpa perché un'attività esiste.

FATTA PER
Persone con ADHD, autismo, la sovrapposizione fra i due, DOC, e chiunque abbia mai sentito che la lista era troppa. Poco attrito, nessuna serie da mantenere, e nessuna punizione per un'attività che ha aspettato. DoubleDone è fatta a Melbourne da Melroy. L'ha creata per amici con ADHD e DOC.

IL CUORE CALMO, GRATIS PER SEMPRE
- Svuota la testa, una cosa per riga.
- Solo oggi. Il resto può aspettare.
- Dividi in passaggi, un'attività che temi diventa passaggi da pochi minuti.
- Falla minuscola, una versione da due minuti per iniziare.
- Alleggerisci la giornata, nei giorni pieni propone di spostare qualche attività ai giorni successivi. Non si sposta niente finché non dici di sì.
- Ricorrenti, le attività che ritornano.
- Promemoria gentili, solo quelli che chiedi tu, mai una scadenza.
- Settle, una stanza tranquilla con una guida al respiro, quando oggi fa rumore.
- Chiudi la giornata. Onora quello che hai fatto, mai quello che non hai fatto.
- Calendario, tutto quello che hai portato a termine, anche un'attività che temevi da settimane. Il tuo cervello non potrà dirti che non hai fatto niente.
- Un album dei ricordi gratis ogni mese, fatto con l'AI.

LA NOSTRA LISTA: UNA LISTA PER DUE PERSONE
Gratis, e in due soltanto. Nulla dice chi ha fatto cosa, e nulla conta o confronta, quindi non può diventare una classifica.

Ciò che ha un giorno suo, i rifiuti il martedì, arriva su entrambi i vostri Oggi quel giorno. Quello che non ce l'ha, il latte e le pile, resta sulla lista. La spunta di uno dei due vale per entrambi.

Si comincia leggendo un codice di sei caratteri alla tua persona. Niente feed, e nessuno può raggiungerti senza quel codice. Potete uscirne quando volete, senza spiegare niente. Come la sincronizzazione, La nostra lista chiede solo il semplice accesso via email.

L'AI CHE AIUTA, DEL TUTTO FACOLTATIVA
L'AI è attiva di default e fa un lavoro vero: ordina in una giornata quello che hai buttato giù e divide in passaggi un'attività difficile. Invia solo quello su cui la usi. Un tocco nelle Impostazioni la spegne, e l'app continua a funzionare.

PREMIUM, SE UN GIORNO VUOI DI PIÙ
Premium aggiunge extra facoltativi, tramite Google Play: Scansiona una lista, Fissa la cosa di oggi, Organizza la giornata, Traccia la rotta, sei temi di colore in più, un album della settimana, Le tue tendenze e le scelte senza limiti in Cosa ci sta adesso.

SUL TUO DISPOSITIVO, DI DEFAULT
- Le tue attività restano sul tuo dispositivo. Non serve un account.
- Sincronizzare tra dispositivi è facoltativo: un'email e un codice usa e getta, nessuna password.
- Quello che scegli per una funzione AI lo riceve Claude di Anthropic, e Anthropic non lo usa per addestrare i suoi modelli. Le immagini dell'album dei ricordi sono create con i modelli AI di Cloudflare. Di quello che invii conserviamo una copia senza il tuo nome né il tuo account, per migliorare il modo in cui le attività vengono divise in passaggi.
- Niente pubblicità. Nessun identificativo pubblicitario né tracciamento tra app. Niente viene venduto.
- Esporta le tue attività e quello che hai finito, quando vuoi. Se hai fatto l'accesso, nelle Impostazioni puoi eliminare l'account e i dati sincronizzati.

hai il permesso di andare piano

DoubleDone non è un dispositivo medico. Non diagnostica, non tratta, non cura né previene alcuna condizione di salute, e non sostituisce il supporto di un professionista. Per un consiglio medico, rivolgiti a un professionista della salute.

La privacy, in parole semplici, su doubledone.app/privacy.
```

<details><summary>What was trimmed, and why those lines were the safest to lose</summary>

**2026-09-27, Path C:** the whole Premium block went (the heading, eight bullets, the trial and A$ price line, the Stripe line), and so did ", e, con Premium, legge la foto di una lista e ne fa attività" from the AI paragraph, which now reads "ordina in una giornata quello che hai buttato giù e divide in passaggi un'attività difficile." Full description now 3029 characters. Everything below is the 2026-08-16 record.

**2026-10-16:** the not-a-medical-device line went in just before the privacy line, matching the English listing (a5d3031). Full description now 3201 characters.

**2026-10-19 (store 1.9, slice 8):** a title, the App Store's Italian name. The shared list is "La nostra lista" everywhere (the 2026-10-18 rule: always its default name), so the heading "NOSTRO: LA LISTA CHE TENETE IN DUE" is `m4Title`, "Nell'app si chiama La nostra lista" went, and "Nostro chiede" is "La nostra lista chiede". "niente di quello che scrivi esce" went twice (false with AI off), and the AI paragraph now carries `priv2`'s words. "PRIVATA DI DEFAULT" became `privTitle`, the trackers line became `priv3`, "Esporta i tuoi dati" became `priv4`, and Alleggerisci la giornata is a suggestion (`m2Body`). The monthly album is "fatto con l'AI", and the Claude bullet names Cloudflare. Added: `founder`, a Premium paragraph from `faqFreeA`, and "Per un consiglio medico, rivolgiti a un professionista della salute." Full description now 3843 characters.

**2026-10-19, later (Melroy's call):** the Claude bullet ends with `faqAiA`'s kept-copy sentence, "Di quello che invii conserviamo una copia senza il tuo nome né il tuo account, per migliorare il modo in cui le attività vengono divise in passaggi.", as the privacy policy and the Spanish listing already said. It fits without a cut here. The App Store's Italian made room with two deletions: the breakdown example in its AI paragraph, and "quando oggi fa rumore" after Settle. Full description now 3992 characters.

**2026-10-19 (the native Italian read):** "La spunta uno dei due, e vale per entrambi." is "La spunta di uno dei
due vale per entrambi." The feminine "La" could only point back to "lista", so it read as one of you ticking the
list, and the noun says one person's tick counts for both. The App Store's Italian takes the same fix. "Per tanti
di noi" stays here for now, unlike the App Store's "Per molti": it translates the English Play listing's own
"For a lot of us", so it changes with the English or not at all (Melroy's call). Full description unchanged at
3992 characters.

4247 to 3841 characters, 406 removed, 109 of headroom left under the 3950 target. What went, in order of how little it cost:

1. A duplicated sentence pair in paragraph three. The text said "DoubleDone fa il contrario. Una schermata calma, una giornata piccola, e niente ti farà mai sentire in colpa perché un'attività esiste." and then immediately said it again in shorter form ("DoubleDone fa il contrario. Una giornata piccola, e nessuna colpa..."). Kept the fuller first version, which is the one carrying never-shame-the-backlog. Roughly 120 characters for zero meaning.

2. Two weak free bullets: "Unisci, attività simili diventano una sola." and, from FATTA PER, the intensifier "niente sensi di colpa," which restates the punishment clause sitting right next to it and the guilt clause one paragraph above. Merge is the item nobody downloads for. Never-shame survives in two places.

3. Two weak Premium bullets: "Scelta in base all'energia senza limiti" (opaque without the app in front of you) and, from the AI paragraph, the closing "tutta sul tuo dispositivo. È fatta così apposta." which restates the sentence before it. Kept Traccia la rotta and Organizza la giornata, which are things a shopper actually chooses on.

4. Subordinate clauses restating their main clause: "quella sul frigo" (the fridge aside in the AI paragraph), "così nessuno può appesantirti la mattina" (the point is already made by "resta sulla lista"), "Niente da sfogliare" (redundant beside "Niente feed"), and the Ours tag "E diversa da ogni lista condivisa che hai usato", which is a claim the next three sentences prove anyway.

Two mechanical fixes taken along the way, both inside kept text: a comma splice with a stray capital ("alla tua persona, Niente feed") is now a full stop, and "Gratis." became "Gratis, e in due soltanto." so the exactly-two fact is stated in the body, not only in the heading.

Nothing protected moved. Still present and verified by string search: the privacy URL, the Stripe-not-Google-Play line, A$5 / A$50, the free month, "senza carta", "gratis, per sempre", the never-shame sentence, the narrow AI qualifier in both places it appears (only the text you type, never "nothing is sent"), and all six Ours facts. No em-dashes, no exclamation marks, informal address throughout, and à è é ì ò ù all present.

Short description: 74 characters. "Cose da fare" names the category, "per ADHD e per il troppo" is the self-identify beat and reuses the listing's own idiom for overwhelm, "Solo oggi." is lifted from the today subtitle, and "Niente è mai in ritardo." is lifted verbatim from welcome lead2, where "mai" makes it a property of the app rather than a status report. Shared lists and the AI caveat deliberately left out.

</details>

---

## Before pasting any of these

1. **Run the gate.** `node scripts/check-listings.mjs --play` measures every field, checks the diacritics
   and the French no-break spaces survived, checks the protected claims (the privacy URL, the
   six-character code, free forever, both medical sentences) are still present, and fails on anything
   that sells anywhere but Google Play (a price, "Stripe", trial wording, a buy-on-the-website line) and
   on every claim the code proved false. Naming Premium is allowed since Path A. CI runs it too.
2. **Confirm the locale exists on Play** before pasting. Play keeps a separate listing per language,
   and a language with no listing has nowhere to receive this.
3. **Never edit these through a shell heredoc.** Every non-English release note in this repo was
   silently ascii-fied that way (`Muelltonne`, `manana`, `partagee`, `puo`) and came one paste from
   shipping. Use an editor that writes UTF-8, then re-run the gate.
4. **The screenshots stay English.** There are no localised store slides, and the localised raw shots
   in `docs/screenshots/i18n/` still have English task text seeded into them. Leave each localised
   listing's existing screenshots alone rather than uploading English-content slides to it.

## What is deliberately not here

- **No other languages.** The app ships en, de, es, fr, it. A listing in a sixth language would be a
  promise the app cannot keep on first launch.
- **No separate es-419 text.** Since 2026-10-19 the Spanish listing is neutral, so the same checked text
  goes under es-ES and es-419. The live es-419 text it replaces had no source in this repo (it carried a
  "dispositivo médico" line no file holds), which is exactly the drift the gate exists to stop.
- **Ours is not in any short description.** Three ideas in 80 characters means none of them lands.
  It gets the full description and the third screenshot.
- **The AI-optional caveat is not in any short description** either, for the same reason. It has a
  whole section in the body, and the eighth screenshot is the off switch.
