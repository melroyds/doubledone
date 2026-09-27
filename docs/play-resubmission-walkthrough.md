# Play resubmission walkthrough

**Android 1.6.0 (versionCode 31), Path C: the Android app sells nothing.** Keep this open beside the Play Console and tick as you go.

**The one rule:** save each change, but **do not send anything for review until step 10.** Google wants every change in one batch.

## Already done
- [x] Path C, Quiet free and the deletion fix: merged (PR #13) and live on the web.
- [x] Server deployed. The reviewer code relay is fixed (version `d7b1363c`).
- [x] Reviewer account comped (`COMP_EMAILS`).
- [x] Android 1.6.0 built and checked: no Google Play Billing code, no billing permission.
- [x] iOS 1.6.0 (build 33) uploaded to App Store Connect. See the iPhone section at the end.

---

## Phase 1: no build needed

### 1. Check the reviewer sign-in
- [ ] In the app (doubledone.app is fine), open **Sync and sharing**, enter `appreview@doubledone.app` and tap **Email me a code**. If you're already on the code screen, tap **Resend code**. The earlier `010601` was never a real code.
- [ ] After about 30 seconds, refresh **https://api.doubledone.app/review-code**. It should show a code "sent 0 minutes ago".
- [ ] Type it in. You should be signed in with Premium already on.
- If no code ever arrives: in Cloudflare, go to **doubledone.app > Email > Email Routing > Routing rules** and make sure `appreview@doubledone.app` goes to **Send to a Worker: doubledone-ai**.

### 2. Store listings
**Grow users > Store presence > Store listings.** Paste each language below over what's there. Afterwards, read it once: no price, no Premium section, no "Stripe", no "not Google Play".

#### English (en-AU), the main listing
- [ ] Short description:

```
A calm to-do app for ADHD and overwhelm. Shows only today. AI optional.
```

- [ ] Full description:

```
Today is finite and achievable.

DoubleDone shows you only what today needs, sized to be doable, and quietly keeps everything you finish. Nothing is ever overdue here. It just waits.

Most to-do apps hand you the whole list and call it motivation. For a lot of us, that is the overwhelm. DoubleDone is the opposite. A calm home screen, a small day, and a list that never shames you for a task simply existing.

MADE FOR
People with ADHD, autism, the AuDHD overlap, OCD, and anyone whose list has ever felt like too much. Built for how those brains actually work: low friction, no streaks to break, no guilt mechanics, no punishment for a task that has waited a while.

THE CALM CORE, FREE FOREVER
- Capture anything in seconds. One thing per line, in any order.
- See only today, sized so it feels possible.
- Break it down: turn a dreaded task into small, doable steps.
- Make it tiny: a two-minute version, just to begin.
- Lighten today: ease a too-full day by moving things to later.
- Combine: fold small tasks into one when the day feels cluttered.
- Repeating tasks, for the things that come back.
- Gentle reminders, only the ones you ask for. Never nagging.
- Settle: a quiet room with a breathing guide, for when the day is loud.
- Close the day kindly. It honours what you did, never what you didn't.
- Calendar: see everything you have actually finished, including the old task you dreaded for weeks. Your brain can't tell you that you did nothing.
- A free monthly scrapbook: a keepsake picture of what you finished.

OURS: ONE SHARED LIST, WITH ONE OTHER PERSON
Free, and unlike every shared list you have used. Nothing on it says who did what, and nothing counts or compares, so it cannot become a scoreboard.

A shared thing with a day on it, bin night on Tuesday, arrives on both your Todays by itself. One without a day, milk and batteries, stays on the shared list and never reaches your Today, so your person cannot make your morning heavier. Tick it from either phone and it closes for both.

You start it by reading somebody a six-character code. There is no feed, no browsing, and nobody can reach you unless you handed them that code. Either of you can leave whenever you like, no reason needed. Like sync, Ours needs only the simple email sign-in.

AI THAT HELPS, FULLY OPTIONAL
AI is on by default and does real work: it sorts a brain-dump into your day and breaks a hard task into steps. But it is genuinely optional. One tap in Settings turns it off, and then nothing you type is sent anywhere. The whole app keeps working, entirely on your device. If you are wary of AI or just like things private, this is built for you.

PRIVATE BY DEFAULT
- Your tasks live on your device. No account needed to use the app.
- Optional sync across devices needs only an email and a one-time code. No password.
- When AI is on, only the text you choose goes to Anthropic's Claude, and it is never used to train models. When AI is off, nothing leaves your device.
- No ads. No third-party trackers. Nothing sold.
- Export your data or delete your account any time.

you're allowed to go slowly

Read the plain-English privacy policy at doubledone.app/privacy.
```

#### German (de-DE)
- [ ] Short description:

```
Ruhige To-dos für ADHS und Überforderung. Nur heute. Nichts ist je überfällig.
```

- [ ] Full description:

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

du darfst langsam machen

Die Datenschutzerklärung, in klarem Englisch: doubledone.app/privacy
```

#### Spanish, Spain (es-ES)
- [ ] Short description:

```
Tu lista para el TDAH y el agobio. Solo hoy. Aquí nada está nunca atrasado.
```

- [ ] Full description:

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

tienes permiso para ir despacio

Lee la política de privacidad, en lenguaje claro, en doubledone.app/privacy.
```

#### French (fr-FR)
- [ ] Short description:

```
Pour le TDAH et la surcharge. Juste aujourd'hui. Rien n'est jamais en retard.
```

- [ ] Full description:

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
L'IA est active par défaut : elle trie ce que tu déposes et décompose une tâche difficile. Un geste dans les Réglages la désactive, et plus rien de ce que tu écris ne part. Tout continue de fonctionner sur ton appareil.

PRIVÉ PAR DÉFAUT
- Tes tâches restent sur ton appareil. Aucun compte n'est nécessaire.
- La synchro entre appareils est optionnelle : un e-mail, un code à 6 chiffres, aucun mot de passe à retenir.
- Quand l'IA est active, seul le texte que tu choisis part vers Claude d'Anthropic, et il ne sert jamais à entraîner de modèles. Sinon, rien de ce que tu écris ne sort de ton appareil.
- Aucune pub, jamais. Aucun traqueur tiers. Rien n'est vendu.
- Exporte tes données ou supprime ton compte quand tu veux.

tu as le droit d'aller doucement

La politique de confidentialité, en clair : doubledone.app/privacy.
```

#### Italian (it-IT)
- [ ] Short description:

```
Cose da fare per ADHD e per il troppo. Solo oggi. Niente è mai in ritardo.
```

- [ ] Full description:

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
L'AI è attiva di default e fa un lavoro vero: ordina in una giornata quello che hai buttato giù e divide in passaggi un'attività difficile. Un tocco nelle Impostazioni la spegne, e niente di quello che scrivi esce da qui. DoubleDone funziona benissimo anche senza.

PRIVATA DI DEFAULT
- Le tue attività restano sul tuo dispositivo. Non serve un account.
- Sincronizzare tra dispositivi è facoltativo: un'email e un codice usa e getta, nessuna password.
- Con l'AI attiva, a Claude di Anthropic va solo il testo che scegli tu, mai usato per addestrare modelli. Con l'AI spenta, niente di quello che scrivi esce dal tuo dispositivo.
- Niente pubblicità, mai. Nessun tracciamento di terze parti. Non vendiamo i tuoi dati.
- Esporta i tuoi dati, o elimina account e dati, quando vuoi.

hai il permesso di andare piano

La privacy, in parole semplici, su doubledone.app/privacy.
```

#### Spanish, Latin America (es-419), if Play has it
- [ ] Paste the **es-ES** texts above. The repo has no es-419 version yet. Never leave the old es-419 text in place, because it still has a price.

### 3. Screenshots
- [ ] In every listing, delete the screenshot showing **"Colour theme PREMIUM"** (the light Settings shot). Check the translated listings' own screenshots too.
- Everything else can stay for now. New Today v3 screenshots can follow in a later update, and no shot may show a Premium surface.

### 4. App access
**Monitor and improve > App content > App access**
- [ ] Choose **All or some functionality in my app is restricted**.
- [ ] Username: `appreview@doubledone.app`. Password: none (passwordless).
- [ ] Paste into the instructions:

```
Sign-in is passwordless: an email address and a one-time code. To sign in as the review account:
1. Open DoubleDone and tap "Sync and sharing" on Today to reach Sign in.
2. Enter appreview@doubledone.app and tap "Email me a code".
3. In any browser, open https://api.doubledone.app/review-code. It shows the latest 6-digit code.
4. Type that code into the app.
Codes expire after an hour. If the page says there is no code yet, or that it has expired, tap send again in the app and refresh the page.
Everything except Premium features and the shared list works with no account at all. This review account has Premium, so every feature is open.
Premium is not sold in the Android app. Existing members sign in. New users can take a free 30-day trial with no payment.
```

### 5. Data safety
**Monitor and improve > App content > Data safety**
- [ ] **Financial info > Payment info** set to **Not collected**. Payments happen on the web or through Apple, outside this app.
- [ ] Leave every other answer as it is.

### 6. Content rating
**Monitor and improve > App content > Content rating**
- [ ] If it answers **Yes** to users buying digital goods in the app, change it to **No**, save, and submit the new rating (it goes out in the same batch).
- [ ] Leave the shared-list (Ours) answers exactly as they are.

### 7. Optional tidy-ups
- [ ] **Grow users > Store presence > Store settings > Website:** `https://doubledone.app/support` instead of the homepage.
- [ ] **Monetize with Play > Products:** confirm there's no subscription and no in-app product, not even a draft.

---

## Phase 2: the new build

### 8. Find the old bundles
- [ ] **Test and release > App bundle explorer:** note every track holding the old 1.5.0 or the rejected 1.5.1 bundle (production, plus any internal, closed or open testing).

### 9. On each of those tracks
- [ ] **Download the build:** https://expo.dev/artifacts/eas/oLyEXvZf2NXOXj0hRH-2hH9BBWGqn2i-EDhkh3hyDfs.aab
- [ ] Open the track (**Test and release > Production**, or **Testing >** Internal / Closed / Open), then **Create new release**. Discard any draft sitting there first.
- [ ] **Upload** the downloaded `.aab` (versionCode 31).
- [ ] Check that **both old bundles are under "Not included"**. If an old one stays active, the whole resubmission fails.
- [ ] Release notes: paste this whole block (all six languages):

```
<en-AU>
A calmer Today. Add anything with the + at the bottom: a panel rises, and the keyboard waits until you tap the box. Finished tasks can tuck away into a quiet Done today line, if you like.

Repeating tasks have their own room, grouped by rhythm. Routines start empty, with one gentle suggestion. The Menu is a page of rooms, each with its picture, and Settings sit in five cards. The whole app fits the phone better, keyboard included.

Try Quiet, the borderless look, in Settings.
</en-AU>
<de-DE>
Ein ruhigeres Heute. Neues fügst du mit dem + unten hinzu: Ein Feld gleitet hoch, und die Tastatur wartet, bis du tippst. Erledigtes kann auf Wunsch in einer ruhigen Zeile „Heute erledigt“ verschwinden.

Wiederkehrende Aufgaben haben ihren eigenen Raum, nach Rhythmus sortiert. Routinen beginnen leer, mit einem sanften Vorschlag. Das Menü ist eine Seite mit Räumen, jeder mit Bild, und die Einstellungen stecken in fünf Karten.

Probier Stille, den randlosen Look, in den Einstellungen aus.
</de-DE>
<es-419>
Un Hoy más tranquilo. Agrega lo que sea con el + de abajo: sube un panel y el teclado espera a que toques. Si quieres, lo terminado puede guardarse en una línea tranquila de Hecho hoy.

Las tareas que se repiten tienen su propia sala, agrupadas por ritmo. Las rutinas empiezan vacías, con una sugerencia suave. El menú es una página de salas, cada una con su imagen, y los ajustes caben en cinco tarjetas.

Prueba Silenciosa, el aspecto sin bordes, en Ajustes.
</es-419>
<es-ES>
Un Hoy más tranquilo. Añade lo que sea con el + de abajo: sube un panel y el teclado espera a que toques. Si quieres, lo terminado puede guardarse en una línea tranquila de Hecho hoy.

Las tareas que se repiten tienen su propia sala, agrupadas por ritmo. Las rutinas empiezan vacías, con una sugerencia suave. El menú es una página de salas, cada una con su imagen, y los ajustes caben en cinco tarjetas.

Prueba Silenciosa, el aspecto sin bordes, en Ajustes.
</es-ES>
<fr-FR>
Un Aujourd'hui plus calme. Ajoute ce que tu veux avec le + en bas : un panneau monte, et le clavier attend que tu touches. Si tu veux, ce qui est fini peut se ranger dans une ligne discrète Fait aujourd'hui.

Les tâches répétées ont leur propre pièce, groupées par rythme. Les routines commencent vides, avec une suggestion douce. Le menu est une page de pièces, chacune avec son image, et les réglages tiennent en cinq cartes.

Essaie Silencieuse, le style sans bordures, dans les Réglages.
</fr-FR>
<it-IT>
Un Oggi più calmo. Aggiungi quello che vuoi con il + in basso: sale un pannello e la tastiera aspetta che tu tocchi. Se vuoi, ciò che hai finito può raccogliersi in una riga tranquilla Fatto oggi.

Le attività ricorrenti hanno una stanza tutta loro, raggruppate per ritmo. Le routine partono vuote, con un suggerimento gentile. Il menu è una pagina di stanze, ognuna con la sua immagine, e le impostazioni stanno in cinque schede.

Prova Silenziosa, l'aspetto senza bordi, nelle Impostazioni.
</it-IT>
```

- [ ] **Save > Review release.** On production, roll out to **100%**, not staged.

---

## Phase 3: send it

### 10. One batch
- [ ] **Publishing overview > Send changes for review**, with everything above in it.
- [ ] **Don't reply to the rejection and don't appeal.** The compliant update is the reply.

---

## After Google approves
- [ ] Update your phone **from Play** (never sideload over a Play install).
- [ ] No price anywhere: Premium, the welcome, Settings, the Menu, Terms, Privacy.
- [ ] A web-bought account shows Premium after sign-in.
- [ ] A fresh free account can start the free month, with no payment step.
- [ ] Tell me, and I'll bump the Android version in `version.json`, so people on the old build get nudged to update.

---

## The iPhone side (1.6.0, build 33)
- [ ] Wait for Apple's processing email, about 5 to 10 minutes. Then install from **TestFlight** on your iPhone.
- [ ] Quick native check: tap + then the box (When and Add sit above the keyboard); add a few tasks; turn on VoiceOver and open the panel (focus lands on "Add to Today").
- [ ] In App Store Connect: **1.6.0 > add build 33 > What's New** (from `docs/release-notes/1.6.0.md`) > **Submit for Review**.
- [ ] In the review notes, tell Apple to **test the purchase signed out**. The `appreview@` account is comped, so signed in it never sees the paywall.
