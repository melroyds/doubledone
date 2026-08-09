# Ours: the English copy review

*Verbatim synthesis of the adversarial copy panel on the `ours` namespace, 2026-08-09. Five lenses
(never-shame / RSD, voice consistency with the 950 shipped strings, does-the-copy-tell-the-truth
against the SQL, native quality in es/fr/it/de, comprehension under stress), every finding then put
to a refute-by-default verifier. 159 raised, 113 confirmed. All of it is applied except where noted
in the build plan.*

---

No feature rethink is needed. Three build notes fall out of the findings, and one is a real risk to watch during the dogfood fortnight.

**1. `waiting` cannot be made true, so the copy stops claiming.** `loadMyPair` returns membership and pair state only; `pair_invites` has zero RLS policies and `expiresAt` is returned once, by `createInvite`. After a reload the screen knows only `partnerLabel === null`, so it can never tell "code live" from "code died yesterday." The rewrite below never asserts the code is alive; it states the rule and points at the remedy. If you ever want a live countdown or a greyed-out dead code, that needs a definer RPC returning the caller's own outstanding invite's `expires_at` / `used_at` (never the hash). Copy is sufficient for v1.

**2. The email binding has an unrecoverable dead end, and copy is the only mitigation available.** `join_pair` hashes `auth.users.email` and compares. Anyone who signs in with an Apple private relay address, a work alias, or a different address from the one their person typed fails forever with the undifferentiated `invalid-code`, and the creator cannot look up what they typed because it is hashed. Four strings now carry the precondition (`shareMessage`, `theirEmailHint`, `codeBody`, `errInvalidCode`) and the escape hatch is `create_pair_invite`'s re-mint, which means **`newCode` must be visible on the code screen, not buried**. Watch this one in the two-couple dogfood; if it bites, the fix is product, not words.

**3. `forget_pair` cannot be undone after the call, so an undo must be a delayed commit.** No INSERT policy on `pair_members`, no rejoin RPC, `join_pair` refuses closed pairs, and if the other member has also gone the prune trigger hard-deletes and cascades `shared_tasks`. The SQL comment asks the client for an undo rather than a confirm; the only honest way to build that is to hold the removal locally and call the RPC after the window elapses. If instead the build calls the RPC immediately and shows an undo toast, the toast is a lie and `forgetHint` below is mandatory. Ship `forgetHint` either way.

Two smaller notes: `errNotYours` fires on a **rename of a frozen list**, which is a normal path, so consider disabling rename on a frozen list rather than surfacing any error. And `signedOutBody` was factually false against shipped `signIn.subtitle`; that is fixed below.

Two findings rejected as stale or wrong: `errTooManyLists` is **not** missing, it exists in all five (reworded below anyway), and its proposed "removing one makes room" remedy promises an affordance v1 has no UI for, so it is dropped. `errSignedOut` correctly stays unadded; route `signed-out` to the existing `signedOutTitle` / `signedOutBody` / `signIn`.

---

# The rewrite list

30 keys change, 1 is new. All five locales move together on every one of them.

### Typography sweep (mechanical, do it while editing)
The `ours` block introduced curly apostrophes (U+2019) against house convention: **11 lines in `en.ts`, 17 in `fr.ts`, 3 in `it.ts`**. Everywhere else these catalogs use straight `'` with a double-quote string delimiter (359 straight vs 13 curly outside `ours` in fr). Every string below is written with straight apostrophes; use `"…"` delimiters where the string contains one. `es` and `de` have none.

---

### `codeBody`
- **en** `"They type it into DoubleDone on their own phone, signed in with the address you gave. It works once, and it lasts a day."`
- **es** `'Lo escribe en DoubleDone desde su propio teléfono, entrando con la dirección que has puesto. Sirve una vez y dura un día.'`
- **fr** `"Ta personne le tape dans DoubleDone, sur son propre téléphone, connectée avec l'adresse que tu as donnée. Il ne marche qu'une fois, et il dure un jour."`
- **it** `"Lo scrive in DoubleDone sul suo telefono, con l'account dell'indirizzo che hai messo. Funziona una volta sola e dura un giorno."`
- **de** `'Dein Mensch tippt ihn in DoubleDone auf dem eigenen Handy ein, angemeldet mit der Adresse, die du angegeben hast. Er gilt einmal, einen Tag lang.'`

Why: adds the precondition that actually decides whether the code works (they must be signed in on that address), kills French "Elle" and German's agentless passive, fixes German's preposition, and drops es "móvil", the catalog's only Peninsular device word. "For the next day" becomes "a day", matching what all four translations already said. French "connectée" agrees with *personne*, which is grammatically feminine regardless of the human, so it stays gender-safe.

### `enterCode`
- **en** `'Code from your person'` · **es** `'El código de tu persona'` · **fr** `'Le code de ta personne'` · **it** `'Il codice della tua persona'` · **de** `'Der Code von deinem Menschen'`

Why: on the join screen the code is not yours, it was handed to you, and "Your code" collides with the 6-digit sign-in code the app emails. Parallels the shipped `signIn.codeA11y`, "Code from your email".

### `errAlreadyPaired`
- **en** `"For now, DoubleDone keeps one shared list at a time. You can leave the one you have whenever you like, and nothing is lost."`
- **es** `'Por ahora, DoubleDone tiene una lista compartida a la vez. Puedes salir de la que tienes cuando quieras, y no se pierde nada.'`
- **fr** `"Pour l'instant, DoubleDone garde une seule liste partagée à la fois. Tu peux quitter celle que tu as quand tu veux, et rien n'est perdu."`
- **it** `'Per ora, DoubleDone tiene una lista condivisa alla volta. Puoi uscire da quella che hai quando vuoi, e non si perde niente.'`
- **de** `'In DoubleDone gibt es erst mal immer nur eine gemeinsame Liste. Du kannst die, die du hast, jederzeit verlassen, und es geht nichts verloren.'`

Why: states the app's own v1 cap instead of correcting the reader, and adds the true way forward. Verified true: `k_max_pairs` counts live pairs only, so a frozen list costs no slot.

### `errBadEmail`
- **en** `"That doesn't look like an email address."`

Why: apostrophe only, content unchanged. Other four unchanged.

### `errInvalidCode`
- **en** `"That code didn't work. Codes last a day, and only work for the address on your account. Ask your person for a fresh one?"`
- **es** `'Ese código no ha funcionado. Los códigos duran un día y solo sirven para la dirección de tu cuenta. ¿Le pides otro a tu persona?'`
- **fr** `"Ce code n'a pas marché. Un code dure un jour, et ne marche que pour l'adresse de ton compte. Demande-en un nouveau à ta personne ?"`
- **it** `"Quel codice non ha funzionato. Un codice dura un giorno e vale solo per l'indirizzo del tuo account. Ne chiedi uno nuovo alla tua persona?"`
- **de** `'Mit dem Code hat es nicht geklappt. Ein Code gilt einen Tag lang und nur für die Adresse deines Kontos. Frag deinen Menschen ruhig nach einem neuen.'`

Why: this one line covers six causes and four of them are not the reader's doing, so a bare verdict sends an honest user into a retype loop that ends at the rate limit. It now carries the two facts that let them self-diagnose, plus a route. Matches the shipped sibling `signIn.codeInvalid` in register. "Valid" and it/de's schoolteacher tone ("non va bene", "stimmt nicht") are gone. Gendered participles avoided throughout ("l'adresse de ton compte", not "avec laquelle tu es connectée").

### `errListFull`
- **en** `"A shared list holds two people, and that one is full."`
- **es** `'Una lista compartida es para dos personas, y esa está completa.'`
- **fr** `"Une liste partagée, c'est deux personnes, et celle-là est complète."`
- **it** `'Una lista condivisa è per due persone, e quella è al completo.'`
- **de** `'Eine gemeinsame Liste ist für zwei Menschen, und diese ist voll.'`

Why: "already has two people in it" implies a third party is in there with your person, which is false and cruel for what is a plain two-seat limit. "Already / ya / già / schon" dropped for the same reason.

### `errNotOpen`
- **en** `"Shared lists aren't open yet. Nothing you typed was saved."`
- **es** `'Las listas compartidas todavía no están abiertas. No se ha guardado nada.'`
- **fr** `"Les listes partagées ne sont pas encore ouvertes. Rien n'a été enregistré."`
- **it** `'Le liste condivise non sono ancora aperte. Non è stato salvato niente.'`
- **de** `'Gemeinsame Listen sind noch nicht verfügbar. Wir haben nichts gespeichert.'`

Why: the allowlist refusal lands after the reader has picked a preset, named the list and typed their person's email, leaving them wondering where that address went. `create_pair_invite` raises before any insert, so the reassurance is literally true. German: "offen" does not collocate with a feature, and the German clause is active per the glossary.

### `errNotYours`
- **en** `'This list is closed to changes.'`
- **es** `'Esta lista está cerrada y ya no admite cambios.'`
- **fr** `"Cette liste est fermée, on ne peut plus la changer."`
- **it** `'Questa lista è chiusa e non accetta più modifiche.'`
- **de** `'Diese Liste ist geschlossen und lässt sich nicht mehr ändern.'`

Why: 42501 fires on a rename of a frozen list and on a second-device leave after you have already left, so an accusation of trespass lands on someone whose relationship just ended. Each locale now opens with its own existing `frozenTitle` wording, so the app says one thing about this state.

### `errOwnEmail`
- **en** `"That's your own address."`

Why: apostrophe only.

### `errRateLimited`
- **en** `"Joining is paused just now. Nothing is wrong with your account. You can try again in an hour."`
- **es** `'Unirse está en pausa ahora mismo. Tu cuenta está bien. Puedes probar otra vez dentro de una hora.'`
- **fr** `"Rejoindre est en pause pour l'instant. Il n'y a aucun problème avec ton compte. Tu peux réessayer dans une heure."`
- **it** `"Entrare è in pausa in questo momento. Il tuo account è a posto. Puoi riprovare tra un'ora."`
- **de** `'Gerade kannst du nicht beitreten. Mit deinem Konto ist alles in Ordnung. In einer Stunde kannst du es ruhig noch mal versuchen.'`

Why: the old line counts the reader's failures back at them and prescribes a break, which is the shape RSD reads as a rebuke. It can also fire from the 5000/hour **global** ceiling with the reader doing nothing at all, which is why the middle sentence is load-bearing. That middle sentence is lifted verbatim from the app's own `premium.iapUnavailable` in each locale, so it is already native-reviewed. German avoids the nominalised infinitive as subject.

### `errTooManyLists`
- **en** `"This account has reached DoubleDone's limit for shared lists."`
- **es** `'Esta cuenta ha llegado al límite de listas compartidas de DoubleDone.'`
- **fr** `"Ce compte a atteint la limite de listes partagées de DoubleDone."`
- **it** `'Questo account ha raggiunto il limite di liste condivise di DoubleDone.'`
- **de** `'Dieses Konto hat die Grenze für gemeinsame Listen erreicht.'`

Why: the key already exists, the finding that called it missing is wrong. Reworded only to stop "That's as many..." counting back at the reader. No remedy offered on purpose: `k_max_lists = 25` is an abuse ceiling, and v1 has no surface listing old lists, so "remove one to make room" would name an affordance that does not exist.

### `errUnknown`
- **en** `"That didn't work just now. Try again?"`

Why: apostrophe only.

### `forget`
- **en** `'Delete this list for good'` · **es** `'Borrar esta lista para siempre'` · **fr** `'Supprimer cette liste définitivement'` · **it** `'Elimina questa lista per sempre'` · **de** `'Diese Liste endgültig löschen'`

Why: "Remove this list" is indistinguishable from "Leave this list" in all five, and only one of them is irreversible. Each locale now takes its own delete verb from the shipped `settings.deleteAccountLink` (Borrar / Supprimer / Elimina / löschen), which is how this app already labels its one other unrecoverable action. Verb forms match each locale's own `leave` sibling.

### `forgetHint`  — NEW KEY
Sorts between `forget` and `frozenBody`.

- **en** `"This removes the list and everything on it, and it cannot be undone. Put anything you want to keep on your Today first."`
- **es** `'Esto quita la lista y todo lo que hay en ella, y no se puede deshacer. Lleva antes a tu Hoy lo que quieras conservar.'`
- **fr** `"Ça retire la liste et tout ce qu'elle contient, et c'est irréversible. Mets d'abord dans ton Aujourd'hui ce que tu veux garder."`
- **it** `'Questo toglie la lista e tutto quello che contiene, e non si può annullare. Metti prima nel tuo Oggi quello che vuoi tenere.'`
- **de** `'Das löscht die Liste mit allem, was darauf steht, und lässt sich nicht rückgängig machen. Hol dir vorher ruhig in dein Heute, was du behalten möchtest.'`

Why: the only irreversible action in the feature currently ships with nothing beside it, and a bereaved user tapping it on a frozen list deletes the last copy of their person's words with no warning and no chance to keep anything. Each locale reuses its own irreversibility clause from the shipped `settings.deleteConfirmBody`. German carries warmth on "ruhig" per the glossary, no exclamation mark, none of the banned particles.

### `frozenBody`
- **en** `"Nothing is lost. You can still read everything here, and put anything you want on your Today, one at a time."`
- **es** `'No se ha perdido nada. Puedes seguir leyéndolo todo aquí, y llevar a tu Hoy lo que quieras, de una en una.'`
- **fr** `"Rien n'est perdu. Tu peux encore tout lire ici, et mettre dans ton Aujourd'hui ce que tu veux, une chose à la fois."`
- **it** `'Non si è perso niente. Puoi ancora leggere tutto qui, e mettere nel tuo Oggi quello che vuoi, una cosa alla volta.'`
- **de** `'Es ist nichts verloren. Du kannst hier noch alles lesen und dir die Sachen einzeln in dein Heute holen.'`

Why: "across" and its four translations name no destination, so someone who has just been left has to already know the pull gesture to understand the one line meant to reassure them. Naming Today also makes `forgetHint` above read as the same gesture.

### `joined`
- **en** `"You're now sharing with {name}."` (apostrophe only)
- **de** `'Du teilst diese Liste jetzt mit {name}.'`

Why: German "teilen" needs an object, so the current line reads unfinished at the moment the app confirms a second human can see your words. es / fr / it unchanged.

### `lead`
- **es** `'Una lista que es de los dos. Nada de aquí aparece en tu Hoy a menos que lo pongas tú.'`

Why: "lleváis" is one of only two vosotros forms in a 1085-line otherwise region-neutral Spanish catalog, and it lands at the emotional centre of the feature. Other four unchanged (fr "vous", it "tenete", de "ihr" are all correctly neutral).

### `leaveHint`
- **en** `"Nothing is lost. It closes for both of you, and you can both still read everything."`
- **es** `'No se pierde nada. Se cierra para los dos, pero sigue a la vista.'`
- **fr** `"Rien n'est perdu. Elle se ferme pour vous deux, et tout reste lisible."`
- **it** `'Non si perde niente. Si chiude per tutti e due, ma resta leggibile.'`
- **de** `'Es geht nichts verloren. Damit ist sie für euch beide geschlossen, lesen könnt ihr weiter alles.'`

Why: the reassurance now leads, and the missing fact is stated. Leaving stops writing for the other person too, and someone leaving a coercive or ending relationship needs to know the other side will visibly stop before they decide. The Spanish is rebuilt to drop "podréis", the catalog's second vosotros form, on the string whose whole job is to make leaving feel safe.

### `newCode`
- **en** `'Get a new code'` · **es** `'Conseguir otro código'` · **fr** `'Obtenir un nouveau code'` · **it** `'Ottieni un altro codice'` · **de** `'Neuen Code holen'`

Why: both halves of the old string were wrong. "Wrong address?" opens the recovery path by naming the reader's mistake, and "Start again" overstates a re-mint that keeps the same pair as a demolition. Dropping the diagnostic opener also lets this one button serve both real causes, a typo and an expiry, which is what the new `waiting` and `errInvalidCode` now point at. Verb forms match each locale's own `getCode`.

### `partnerJoined`
- **fr** `'{name} est là.'` · **it** `'{name} è qui.'`

Why: French "a rejoint" is transitive with no object, so the warmest moment in the flow arrives as a truncated sentence. Italian "è entrata" hard-genders your person feminine on a self-chosen label the app has no gender information about, so a brother, a flatmate or a husband is misgendered. Both replacements are complete, gender-free, and match the German sibling's register ("{name} ist dabei."). If a native French reviewer prefers the fuller "a rejoint la liste", that is the fallback; "est là" is chosen for warmth. en / es / de unchanged.

### `presetCare`
- **de** `'Sich um jemanden kümmern'`

Why: "versorgen" is clinical German for nursing patients, wounds and livestock, so it narrows a preset meant to fit a partner, a sick parent or a friend, and it was the only cold one of five.

### `presetShop`
- **en** `'The shopping'`

Why: in Australian and British English "the shop" is a premises, not the errand. All four translations already read it correctly as the shopping (La compra · Les courses · La spesa · Der Einkauf), leaving the source string the odd one out.

### `shareMessage`
- **en** `"A shared list on DoubleDone, if you'd like one. Open doubledone.app, sign in with the email address I used for you, then pick Join with a code and enter {code}. It lasts a day."`
- **es** `'Una lista compartida en DoubleDone, si te apetece. Entra en doubledone.app, inicia sesión con el correo que he puesto para ti, elige Unirte con un código y escribe {code}. Dura un día.'`
- **fr** `"Une liste partagée sur DoubleDone, si ça te dit. Va sur doubledone.app, connecte-toi avec l'adresse e-mail que j'ai indiquée pour toi, choisis Rejoindre avec un code et saisis {code}. Il dure un jour."`
- **it** `"Una lista condivisa su DoubleDone, se ti va. Apri doubledone.app, accedi con l'indirizzo email che ho messo per te, scegli Entra con un codice e scrivi {code}. Dura un giorno."`
- **de** `'Eine gemeinsame Liste bei DoubleDone, falls du magst. Geh auf doubledone.app, melde dich mit der E-Mail-Adresse an, die ich für dich angegeben habe, tippe auf Mit einem Code beitreten und gib {code} ein. Er gilt einen Tag lang.'`

Why: this is the only copy that leaves the app, it lands with someone who did not seek this product out and probably has no app, and it currently says none of what they need. Four changes, all load-bearing. It is now an **offer with a refusal built in** ("if you'd like one") rather than an instruction. It says what DoubleDone is and where. It names the exact button they will see (each locale's own `joinInstead` string, verbatim). And it carries the precondition that decides everything, that the code only works if they sign in with the address the sender typed, which is what prevents the unattributable `errInvalidCode` dead end described at the top. "My list" is gone: it contradicted the feature's own name before they had opened it. Trade-off accepted: this is around 200 characters, long for a text. It is the only shot the second person gets, and the share sheet lets the sender trim it.

### `sharingWith`
- **fr** `'Partagée avec {name}'`

Why: the past participle's only possible referent is *la liste*, so the agreement was wrong.

### `signedOutBody`
- **en** `"An account is only so we know who you are sharing with. Signing in also syncs your own tasks to your account, where only you can read them. Your person never sees them, and nothing about Today changes."`
- **es** `'La cuenta solo sirve para saber con quién compartes. Al iniciar sesión, tus propias tareas también se sincronizan con tu cuenta, donde solo tú puedes leerlas. Tu persona no las ve nunca, y en Hoy no cambia nada.'`
- **fr** `"Un compte sert seulement à savoir avec qui tu partages. En te connectant, tes propres tâches se synchronisent aussi avec ton compte, où personne d'autre que toi ne peut les lire. Ta personne ne les voit jamais, et rien ne change dans Aujourd'hui."`
- **it** `'Un account serve solo per sapere con chi condividi. Quando accedi, anche le tue attività si sincronizzano con il tuo account, dove solo tu puoi leggerle. La tua persona non le vede mai, e in Oggi non cambia nulla.'`
- **de** `'Ein Konto brauchen wir nur, um zu wissen, mit wem du teilst. Beim Anmelden landen auch deine eigenen Aufgaben in deinem Konto, wo nur du sie lesen kannst. Dein Mensch sieht sie nie, und an Heute ändert sich nichts.'`

Why: **the old string was false, and it was the privacy promise.** It said your tasks stay on this device either way, sitting above a Sign in button, when signing in is precisely what stops that. The app's own shipped `signIn.subtitle` says so ("Your tasks stay on this device until you sign in"), and `settings.syncedTo` renders the account. The one sentence a rejection-sensitive reader weighs hardest broke the moment they acted on it. The replacement tells the truth and moves the reassurance to where it is still true: only you can read them, and your person never does. Also fixes the sentence-fragment opener, the system phrase "who to sync with" for a human relationship, and German's agentless passive. All five avoid vosotros and gendered agreement.

### `theirEmail`
- **en** `"Your person's email"` (apostrophe only)

### `theirEmailHint`
- **en** `"We never email them. The code only works for the address they sign in with."`
- **es** `'No le enviamos ningún correo. El código solo funciona para la dirección con la que inicie sesión.'`
- **fr** `"On ne lui envoie aucun e-mail. Le code ne marche que pour l'adresse avec laquelle ta personne se connecte."`
- **it** `"Non le mandiamo nessuna email. Il codice funziona solo per l'indirizzo con cui accede."`
- **de** `'Wir schicken nie eine E-Mail dorthin. Der Code funktioniert nur für die Adresse, mit der dein Mensch bei DoubleDone angemeldet ist.'`

Why: typing your partner's email into an app leaves the loudest fear unanswered, that DoubleDone is about to message them behind your back, and the old line actively reads like a promise it will. The architecture's whole point is that it never does. It also stated the wrong precondition: the real one is a signed-in account on that exact address, not "this address". Both facts now, one clause each. Italian "le" and French "lui" agree with the grammatically feminine *persona / personne*, so no human is gendered.

### `theirEmailPlaceholder`
- **en** `'their@example.com'` · **es** `'nombre@ejemplo.com'` · **fr** `'nom@exemple.com'` · **it** `'nome@esempio.com'` · **de** `'name@beispiel.de'`

Why: the English trick of putting the pronoun in the local part does not transfer, so all four read as a literal address to copy. The German was worst: lowercase "ihre" reads as "her", and the capitalised form is the Sie-pronoun the German voice must never show. Domains now match the house `signIn.emailPlaceholder` per locale.

### `waiting`
- **en** `"You can close this. You'll see their name once they join. A code lasts a day, so get a new one if nothing happens."`
- **es** `'Puedes cerrar esto. Verás su nombre cuando entre. Un código dura un día, así que consigue otro si no pasa nada.'`
- **fr** `"Tu peux fermer. Dès que ta personne rejoint la liste, tu verras son nom. Un code dure un jour, alors prends-en un nouveau s'il ne se passe rien."`
- **it** `'Puoi chiudere. Quando la tua persona entra, vedrai il suo nome. Un codice dura un giorno, quindi prendine uno nuovo se non succede niente.'`
- **de** `'Du kannst das ruhig schließen. Sobald dein Mensch dabei ist, siehst du den Namen. Ein Code gilt einen Tag lang, hol dir also einen neuen, wenn nichts kommt.'`

Why: four problems in one string. It made the absent person the subject of a pending state, so every return visit read as "they still haven't", which is exactly the watching frame this feature must not create and the opposite of the catalog's own waiting voice ("They are safe."). It claimed something the app cannot know (see build note 1). French rendered your person as "elle", the only gendered human pronoun in the whole French catalog. German used "aufs Beitreten", the nominal UI style the glossary explicitly bans. The replacement leads with permission to leave, states what will actually happen without promising the screen polls, and closes the 24-hour trap by naming the remedy, which is the `newCode` button on the same screen.

### `wasntWho`
- **en** `"That wasn't who I meant"` (apostrophe only)
- **it** `'Non è chi aspettavo'`
- **de** `'Ich meinte jemand anderen'`

Why: German's free relative "wen" with no correlate is marginal and reads garbled on a control tapped in a moment of mild panic about a stranger holding your code. Italian "intendevo" is stilted and bookish for a tap target. es / fr unchanged.

### `yourName`
- **en** `'What should they call you?'` · **es** `'¿Cómo quieres que te llamen?'` · **fr** `"Comment veux-tu qu'on t'appelle ?"` · **it** `'Come vuoi farti chiamare?'` · **de** `'Wie soll dich dein Mensch nennen?'`

Why: every locale asked an identity question instead of labelling a field, which is the wrong question to hand an audience with a lifetime of masking at the moment two excited people are trying to connect, and it is a classic stall point. German's original was not grammatical German at all, and Italian's "farti vedere" means to show up or make an appearance. All five now ask for a name.

---

## One thing I rejected, flagged rather than changed

The French native reviewer called **"ta personne"** a calque and wanted "ton proche" in `codeTitle`. I kept "ta personne" everywhere and left `codeTitle` alone. Two reasons: the architecture doc §1 locks the transcreation explicitly (tu persona · ta personne · la tua persona · dein Mensch), and it appears in six strings, so changing one fractures the term while changing all six is a term decision, not a copy edit. Also "un proche" implies emotional closeness and quietly excludes the flatmate, which is exactly the exclusion §1 refuses. If it keeps coming back from French readers, treat it as one term-level call across the whole namespace, not a string fix.