# Play store listings, localised (de / es / fr / it)

*Written 2026-08-16 for 1.3.1. Paste-ready. Every count below is measured in characters with
`scripts/check-listings.mjs`, never estimated, and that script is the gate to re-run after any edit.*

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

## English, for reference

**Short description** (76 / 80)

```
A calm to-do app for ADHD and overwhelm. Just today. Nothing is ever overdue.
```

The full English description is in
[play-store-submission-pack.md](play-store-submission-pack.md).

---

## German (`de-DE`)

**Short description** (78 / 80)

```
Ruhige To-dos für ADHS und Überforderung. Nur heute. Nichts ist je überfällig.
```

**Full description** (3909 / 4000)

```
Heute ist überschaubar und machbar.

DoubleDone zeigt dir nur, was heute dran ist, in machbarer Größe, und bewahrt still alles auf, was du schaffst. Nichts ist je überfällig. Es wartet einfach. Nichts hier wird dich je dafür beschämen, dass eine Aufgabe einfach da ist.

Gemacht für
ADHS, Autismus, Zwangsstörungen, Menschen, bei denen mehreres davon zusammenkommt, und alle, deren Liste sich je nach zu viel angefühlt hat. Die meisten To-do-Apps legen dir die ganze Liste hin und nennen das Motivation. Hier ist es andersherum: keine Streaks, keine Schuldgefühle, kein Rot.

Der ruhige Kern, kostenlos für immer
- Schreib dir den Kopf leer. Eine Zeile pro Sache, die Reihenfolge ist unser Job.
- Nur heute. Der Rest kann warten.
- Mach Schritte draus: eine zu große Aufgabe wird zu kleinen Schritten.
- Mach es winzig: eine Zwei-Minuten-Version, nur zum Anfangen.
- Mach heute leichter: Aufgaben wandern auf spätere Tage.
- Zusammenlegen: aus mehreren Aufgaben wird eine.
- Wiederkehrend, Routinen und Rhythmen, für alles, was wiederkommt.
- Erinnerungen, nur die, um die du bittest, nie eine Deadline.
- Settle: ein ruhiger Raum mit Atembegleitung, wenn heute laut ist.
- Feierabend machen. Er würdigt, was du getan hast, nie, was du nicht getan hast.
- Dein Kalender: alles, was du wirklich geschafft hast, auch die Aufgabe, vor der du wochenlang Bammel hattest. Dein Gehirn kann dir nicht erzählen, du hättest nichts getan.
- Ein kostenloses Erinnerungsalbum im Monat, ein Bild von dem, was du geschafft hast.

Unsere Liste: eine gemeinsame Liste mit einem anderen Menschen
Kostenlos. Nichts darauf sagt, wer was getan hat, und nichts zählt oder vergleicht. Ein Wettbewerb kann daraus nicht werden.

Was einen eigenen Tag hat, die Mülltonne am Dienstag, erscheint an dem Tag in euren beiden Heute. Was keinen hat, Milch und Batterien, bleibt auf der Liste und erreicht niemandes Tag. Wer abhakt, hakt für beide ab.

Sie fängt damit an, dass du deinem Menschen einen Code aus sechs Zeichen vorliest. Es gibt keinen Feed, erreichen kann dich nur, wem du ihn gegeben hast. Verlassen kann sie jeder von euch, wann er mag, ohne Grund. Nötig ist nur die Anmeldung per E-Mail.

KI, die hilft, ganz freiwillig
Die KI ist von Haus aus an und macht echte Arbeit: sie sortiert deinen leergeräumten Kopf in einen machbaren Tag und macht aus einer zu großen Aufgabe kleine Schritte. Freiwillig ist sie trotzdem. Ein Fingertipp in den Einstellungen schaltet sie aus, dann verlässt kein Text mehr dein Gerät. Die App funktioniert auch ohne sie.

Privat von Haus aus
- Deine Aufgaben liegen auf deinem Gerät. Kein Konto nötig.
- Synchronisieren auf allen Geräten: optional, eine E-Mail-Adresse, ein einmaliger Code, kein Passwort.
- Ist die KI an, geht nur der Text, den du wählst, an Claude von Anthropic, nie zum Trainieren von KI-Modellen.
- Keine Werbung, nie. Keine Tracker von Dritten. Nichts wird verkauft.
- Deine Daten exportieren oder dein Konto löschen, wann du magst.

Premium, wenn du mal mehr magst
Alles oben ist kostenlos, für immer. Premium ergänzt ein paar Extras, nie etwas, das du brauchst:
- Ein wöchentliches KI-Erinnerungsalbum, das wächst, je länger du bleibst
- Scanne ein Foto deiner Liste direkt in Aufgaben
- Pinn dir die eine Sache des Tages an
- Plan meinen Tag: eine sanfte Reihenfolge für heute
- Kurs setzen: ein Ziel wird zu ruhigen nächsten Schritten
- Deine Muster: sanfte Statistiken und ein warmer Wochenrückblick
- Energie-Abgleich ohne Limit: frag jederzeit, was gerade passt
- Stille: ein randloser Look, in dem nichts schreit
- Sieben ruhige Farbthemen, damit es ganz deins wird

Teste Premium einen Monat gratis, ganz ohne Karte. A$5 im Monat oder A$50 im Jahr, jederzeit kündbar.

Abgerechnet wird sicher über Stripe im Web, nicht über Google Play. Deine Kartendaten sehen wir nie.

du darfst langsam machen

Die Datenschutzerklärung, in klarem Englisch: doubledone.app/privacy
```

<details><summary>What was trimmed, and why those lines were the safest to lose</summary>

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

## Spanish (`es-ES`)

**Short description** (75 / 80)

```
Tu lista para el TDAH y el agobio. Solo hoy. Aquí nada está nunca atrasado.
```

**Full description** (3933 / 4000)

```
Hoy es finito y alcanzable.

DoubleDone te muestra solo lo que hoy necesita, en su justa medida, y guarda en silencio todo lo que terminas. Aquí nada está nunca atrasado. Solo espera.

Casi todas las apps de tareas te ponen la lista entera delante y lo llaman motivación. Para muchos, eso es justo el agobio. DoubleDone hace lo contrario: un día pequeño y una lista que nunca te hará sentir mal por una tarea que simplemente existe.

HECHA PARA
El TDAH, el autismo, el TOC, por separado o a la vez, y cualquiera que alguna vez haya sentido que su lista era demasiado. Sin rachas que mantener, sin culpa, sin castigar una tarea por existir ni por esperar.

EL NÚCLEO TRANQUILO, GRATIS PARA SIEMPRE
- Sácalo todo de la cabeza. Una cosa por línea.
- Solo hoy, en una medida que parece posible.
- Divídela en pasos: lo que te da pavor, en pasos pequeños.
- Hazla mínima: una versión de dos minutos, solo para empezar.
- Aligera el día: mueve tareas a otros días cuando viene lleno.
- Repetidas, para las cosas que vuelven.
- Recordatorios suaves, solo los que pidas.
- Settle: una sala tranquila con guía de respiración, cuando hoy suena fuerte.
- Cierra el día con suavidad. Honra lo que hiciste, nunca lo que no.
- Calendario: todo lo que terminaste, incluso esa tarea que te dio pavor durante semanas. Tu cerebro no podrá decirte que no hiciste nada.
- Un álbum gratis al mes, una imagen de recuerdo de lo que terminaste.

NUESTRA LISTA: UNA SOLA LISTA COMPARTIDA CON OTRA PERSONA
Gratis, y de dos personas exactamente. Nada dice quién hizo qué, y nada cuenta ni compara, así que no puede volverse un marcador.

Lo que tiene día propio, la basura el martes, llega a vuestros dos Hoy ese día. Lo que no tiene día, la leche y las pilas, se queda en la lista y no llega al Hoy de nadie, así que tu persona no te carga la mañana. La marca cualquiera de los dos y queda hecha para ambos.

Los dos iniciáis sesión con el correo, y el código de seis caracteres que le lees a tu persona solo sirve para la dirección que pusiste. Nadie llega a ti si no le diste ese código. Cualquiera de los dos sale cuando quiera, sin explicaciones, y todo se puede seguir leyendo.

UNA IA QUE AYUDA, Y OPCIONAL DEL TODO
La IA viene activada y hace trabajo real: ordena lo que te sacas de la cabeza en un día posible y divide una tarea difícil en pasos. Pero es opcional de verdad. Un toque en Ajustes la apaga, y entonces el texto que escribes ya no sale de tu dispositivo. La app entera sigue funcionando sin IA. Está hecho así a propósito.

PRIVADO POR DEFECTO
- Tus tareas viven en tu dispositivo. No hace falta cuenta para usarla.
- Sincronizar entre dispositivos es opcional, y solo pide un correo y un código de un solo uso.
- Con la IA activada, a Claude, de Anthropic, va solo el texto que tú eliges, y nunca se usa para entrenar modelos. Guardamos una copia sin nombre ni cuenta para mejorar los pasos.
- Con la IA apagada, ese texto ya no sale de tu dispositivo.
- Sin anuncios. Sin rastreadores de terceros. Nada se vende.
- Exporta tus datos o borra tu cuenta cuando quieras.

PREMIUM, PARA CUANDO QUIERAS UN POCO MÁS
Todo lo de arriba es gratis, para siempre. Premium añade algunos extras, nunca nada que necesites:
- Un álbum semanal hecho con IA, y crece cuanto más tiempo te quedes
- Escanea la foto de una lista y conviértela en tareas
- Fija la única cosa del día
- Planea mi día, un orden tranquilo para hoy
- Traza un plan, convierte una meta en pasos tranquilos
- Tus patrones, estadísticas amables y una reflexión semanal cálida
- Silenciosa, un aspecto sin bordes donde nada grita
- Siete temas de color serenos

Prueba Premium gratis un mes, sin tarjeta. A$5 al mes o A$50 al año, cancela cuando quieras.

Premium se cobra en la web a través de Stripe, no por Google Play. Nunca vemos ni guardamos los datos de tu tarjeta.

tienes permiso para ir despacio

Lee la política de privacidad, en lenguaje claro, en doubledone.app/privacy.
```

<details><summary>What was trimmed, and why those lines were the safest to lose</summary>

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

**Short description** (77 / 80)

```
Pour le TDAH et la surcharge. Juste aujourd'hui. Rien n'est jamais en retard.
```

**Full description** (3853 / 4000)

```
Aujourd'hui a une fin, et tu peux y arriver.

DoubleDone ne te montre que ce dont aujourd'hui a besoin, et garde en silence tout ce que tu termines. Rien n'est jamais en retard. Ça attend, c'est tout.

La plupart des applis te tendent la liste entière et appellent ça de la motivation. DoubleDone fait l'inverse. Rien ici ne te fera jamais honte parce qu'une tâche existe.

CONÇUE POUR
Le TDAH, l'autisme, les TOC, et toutes les personnes pour qui la liste, un jour, c'était trop. Pas de séries, pas de culpabilité, aucune punition pour une tâche qui a attendu.

LE CŒUR CALME, GRATUIT POUR TOUJOURS
- Vide ta tête. Une ligne par chose.
- Voici aujourd'hui, taillé pour être faisable.
- Décompose-la : une tâche redoutée en petites étapes.
- Juste un petit bout : une version de deux minutes.
- Allège ta journée : des tâches partent vers les jours suivants.
- Regrouper : fusionne les tâches semblables.
- Les tâches qui reviennent, à leur jour.
- Rappel quotidien : un seul, tout doux, jamais une échéance.
- Settle : une pièce calme, un guide de respiration, quand aujourd'hui fait du bruit.
- Clore en douceur. On y honore ce que tu as fait, jamais ce que tu n'as pas fait.
- Ton Calendrier : tout ce que tu as vraiment terminé, même une tâche redoutée depuis des semaines. Ton cerveau ne pourra plus te dire que tu n'as rien fait.
- Un album souvenir gratuit par mois, une image de ce que tu termines.

NOTRE LISTE : PARTAGÉE AVEC UNE SEULE AUTRE PERSONNE
Gratuite. Rien n'y dit qui a fait quoi, et rien ne compte ni ne compare, cela ne peut donc pas devenir un tableau de scores.

Ce qui a son propre jour, les poubelles le mardi, arrive dans vos deux Aujourd'hui ce jour-là. Le reste attend sur la liste, ta journée reste la tienne. L'un ou l'autre la coche, elle est faite pour les deux.

Ça commence par un code de six caractères, que tu lis à ta personne. Pas de fil d'actualité, personne ne peut te joindre ici sans ce code. Vous partez quand vous voulez, sans raison à donner. Notre liste demande seulement la connexion par e-mail.

UNE IA QUI AIDE, ENTIÈREMENT OPTIONNELLE
L'IA est active par défaut : elle trie ce que tu déposes, décompose une tâche difficile, et, avec Premium, lit la photo d'une liste et en fait des tâches. Un geste dans les Réglages la désactive, et plus rien de ce que tu écris ne part. Tout continue de fonctionner sur ton appareil.

PRIVÉ PAR DÉFAUT
- Tes tâches restent sur ton appareil. Aucun compte n'est nécessaire.
- La synchro entre appareils est optionnelle : un e-mail, un code à 6 chiffres, aucun mot de passe à retenir.
- Quand l'IA est active, seul le texte que tu choisis part vers Claude d'Anthropic, et il ne sert jamais à entraîner de modèles. Sinon, rien de ce que tu écris ne sort de ton appareil.
- Aucune pub, jamais. Aucun traqueur tiers. Rien n'est vendu.
- Exporte tes données ou supprime ton compte quand tu veux.

PREMIUM, QUAND TU VEUX UN PEU PLUS
Tout ce qui précède est gratuit, pour toujours. Premium, ce sont les extras, jamais rien d'indispensable :
- Un album souvenir IA chaque semaine, avec tout ce que tu as terminé
- Scanner la photo d'une liste et en faire des tâches
- Épingle ta chose du jour
- Organiser ma journée, un ordre tranquille pour aujourd'hui
- Trace ta route, transforme un objectif en étapes tranquilles
- Tes tendances, des stats douces et un regard chaleureux sur ta semaine
- Choix illimité selon ton énergie, demande ce qui colle quand tu veux
- Silencieuse, un style sans bordures où rien ne crie
- Sept thèmes de couleur apaisants

Essaie Premium gratuitement un mois, sans carte bancaire. 5 $A / mois ou 50 $A / an, résiliable à tout moment.

Le paiement passe par Stripe sur le web, pas par Google Play. On ne voit ni ne garde tes coordonnées bancaires.

tu as le droit d'aller doucement

La politique de confidentialité, en clair : doubledone.app/privacy.
```

<details><summary>What was trimmed, and why those lines were the safest to lose</summary>

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

**Short description** (74 / 80)

```
Cose da fare per ADHD e per il troppo. Solo oggi. Niente è mai in ritardo.
```

**Full description** (3841 / 4000)

```
Oggi ha una fine, ed è fattibile.

DoubleDone ti mostra solo ciò che serve oggi, e conserva in silenzio tutto quello che finisci. Niente è mai in ritardo. Semplicemente aspetta.

Quasi tutte le app di cose da fare ti danno la lista intera e la chiamano motivazione. Per tanti di noi, è proprio lì che arriva il troppo. DoubleDone fa il contrario. Una schermata calma, una giornata piccola, e niente ti farà mai sentire in colpa perché un'attività esiste.

FATTA PER
Persone con ADHD, autismo, la sovrapposizione fra i due, DOC, e chiunque abbia mai sentito che la lista era troppa. Poco attrito, nessuna serie da mantenere, e nessuna punizione per un'attività che ha aspettato.

IL CUORE CALMO, GRATIS PER SEMPRE
- Svuota la testa, una cosa per riga.
- Solo oggi. Il resto può aspettare.
- Dividi in passaggi, un'attività che temi diventa passaggi da pochi minuti.
- Falla minuscola, una versione da due minuti per iniziare.
- Alleggerisci la giornata, qualche attività passa ai giorni successivi.
- Ricorrenti, le attività che ritornano.
- Promemoria gentili, solo quelli che chiedi tu, mai una scadenza.
- Settle, una stanza tranquilla con una guida al respiro, quando oggi fa rumore.
- Chiudi la giornata. Onora quello che hai fatto, mai quello che non hai fatto.
- Calendario, tutto quello che hai portato a termine, anche un'attività che temevi da settimane. Il tuo cervello non potrà dirti che non hai fatto niente.
- Un album dei ricordi gratis ogni mese.

NOSTRO: LA LISTA CHE TENETE IN DUE
Gratis, e in due soltanto. Nulla dice chi ha fatto cosa, e nulla conta o confronta, quindi non può diventare una classifica. Nell'app si chiama La nostra lista.

Ciò che ha un giorno suo, i rifiuti il martedì, arriva su entrambi i vostri Oggi quel giorno. Quello che non ce l'ha, il latte e le pile, resta sulla lista. La spunta uno dei due, e vale per entrambi.

Si comincia leggendo un codice di sei caratteri alla tua persona. Niente feed, e nessuno può raggiungerti senza quel codice. Potete uscirne quando volete, senza spiegare niente. Come la sincronizzazione, Nostro chiede solo il semplice accesso via email.

L'AI CHE AIUTA, DEL TUTTO FACOLTATIVA
L'AI è attiva di default e fa un lavoro vero: ordina in una giornata quello che hai buttato giù, divide in passaggi un'attività difficile, e, con Premium, legge la foto di una lista e ne fa attività. Un tocco nelle Impostazioni la spegne, e niente di quello che scrivi esce da qui. DoubleDone funziona benissimo anche senza.

PRIVATA DI DEFAULT
- Le tue attività restano sul tuo dispositivo. Non serve un account.
- Sincronizzare tra dispositivi è facoltativo: un'email e un codice usa e getta, nessuna password.
- Con l'AI attiva, a Claude di Anthropic va solo il testo che scegli tu, mai usato per addestrare modelli. Con l'AI spenta, niente di quello che scrivi esce dal tuo dispositivo.
- Niente pubblicità, mai. Nessun tracciamento di terze parti. Non vendiamo i tuoi dati.
- Esporta i tuoi dati, o elimina account e dati, quando vuoi.

PREMIUM, QUANDO VUOI QUALCOSA IN PIÙ
Tutto questo è gratis, per sempre. Premium aggiunge qualche extra, mai qualcosa di necessario:
- Un album settimanale, fatto con l'AI, di quello che hai portato a termine
- Scansiona la foto di una lista e trasformala in attività
- Fissa la cosa del giorno
- Organizza la giornata, un ordine tranquillo per oggi
- Traccia la rotta, un obiettivo in passaggi tranquilli
- I tuoi ritmi, statistiche gentili e una riflessione settimanale
- Silenziosa, un aspetto senza bordi dove niente urla
- Sette temi di colore rilassanti

Prova Premium gratis per un mese, senza carta. A$5 al mese o A$50 all'anno. Disdici quando vuoi.

Premium si paga sul web tramite Stripe, non su Google Play. La tua carta non la vediamo mai.

hai il permesso di andare piano

La privacy, in parole semplici, su doubledone.app/privacy.
```

<details><summary>What was trimmed, and why those lines were the safest to lose</summary>

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

1. **Run the gate.** `node scripts/check-listings.mjs` measures every field, checks the diacritics
   survived, and checks the protected claims are all still present. It exits non-zero on any failure.
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
- **Ours is not in any short description.** Three ideas in 80 characters means none of them lands.
  It gets the full description and the third screenshot.
- **The AI-optional caveat is not in any short description** either, for the same reason. It has a
  whole section in the body, and the eighth screenshot is the off switch.
