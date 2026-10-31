# Store search ranks

*Where DoubleDone appears in each store's public search, for the searches its listings target. Rerun with
`python scripts/store-ranks.py --append`, which adds a dated section below with the same terms and countries every
time. Ruana's keyword check, item 4 of Tier 1.*

**Read it as a proxy.** The App Store column is the iTunes Search API (up to 200 iPhone apps, unpersonalised): close
to search on a phone, not the same. The Play column, in the 2026-10-25 baseline only, was the first page of the
public search (about 30 apps), so "not in 30" meant off the first page, not unranked. **Later runs measure the App
Store only:** Play's robots.txt disallows `/store/search`, so Play is read in its Console's acquisition report by
search term instead. Bold is a rank. Store search moves for about two to four weeks
after a metadata change, so judge a listing change from the second rerun, not the first.

**The other half of the check lives in the consoles,** and is not here: Play Console's acquisition report broken down
by search term (what people actually typed), and Apple Ads keyword popularity, which needs an Apple Ads account
(skipped unless ads ever run).

## Reading the baseline (2026-10-25, six days after 1.9.0 went live)

- **The rename works where the name is.** "DoubleDone: ADHD To-Do List" ranks 18 in Australia, 29 in the US and 43
  in the UK for "adhd to do list", 12 in Germany for "adhs to do liste" and 10 in Italy for "adhd lista". The name is
  Apple's heaviest field, and this is the 1.9.0 bet paying out.
- **The broad searches are out of reach,** and that is expected rather than a fault: "adhd" and "to do list" are
  held by apps with years of ratings (DoubleDone is 93 for "to do list" in Australia, absent elsewhere).
- **The keyword field barely shows yet.** "audhd" is the only keyword-field search in anyone's top 100 (21 in
  Australia, 35 in the UK, 60 in the US, out of a small field). "ocd", "autism" and "neurodivergent" with "planner"
  reach 150 to 180 in Australia and nothing elsewhere. The UK set (shared, couples, household) shows nowhere in the
  first 185.
- **Spanish is the weak language.** The name says "tareas para TDAH", yet neither "tdah" nor "lista de tareas" ranks
  in Spain or Mexico, where German and Italian already sit in their top 12.
- **Google Play ranks DoubleDone for its own name and nothing else** in the first 30 of any search. Play weighs
  installs, ratings and engagement heavily, so this is volume, not wording. The review ask (1.9.0) is the lever, not
  another title change.
- **Decided: change nothing on six days of data.** Rerun on 2026-11-01, then again around 2026-11-22, and only then
  judge the keyword sets.

## Reading the first rerun (2026-11-01, thirteen days after 1.9.0)

Too early to judge (the two to four weeks above), so this is a direction, not a verdict. **Mostly up.**
- **Up:** "audhd" in all three English stores (Australia 21 to 14, the US 60 to 48, the UK 35 to 31), "adhd to do
  list" in the UK (43 to 29), "adhd planner" in Australia (108 to 79), "to do list" in Australia (93 to 78), Germany's
  "adhs to do liste" (12 to 8) and Italy's "lista cose da fare" (61 to 42).
- **New:** the UK now shows DoubleDone at 38 for plain "adhd", a broad search it was absent from.
- **Flat:** "adhd to do list" in Australia (18) and the US (29 to 31), Italy's "adhd lista" (10 to 9), France's
  "tdah liste de tâches" (109 to 114), and the Australian keyword-field tail (ocd, neurodivergent).
- **Lost:** Germany's plain "adhs" (87 to outside 188) and Australia's "autism planner" (179, at the edge, now outside).
- **Spain and Mexico: still nothing,** a fortnight in. The pre-decided call: if they are still invisible at the
  second rerun (about 22 November), rework the Spanish name, subtitle and keywords in the next version.

## Runs

### 2026-10-25

| Store | Search | App Store | Google Play |
|---|---|---|---|
| AU | doubledone | **1** | **1** |
| AU | adhd to do list | **18** | not in 30 |
| AU | adhd planner | **108** | not in 30 |
| AU | adhd | not in 192 | not in 30 |
| AU | to do list | **93** | not in 28 |
| AU | calm planner | not in 186 | not in 30 |
| AU | autism planner | **179** | not in 30 |
| AU | audhd | **21** | not in 29 |
| AU | ocd planner | **158** | not in 30 |
| AU | neurodivergent planner | **153** | not in 30 |
| AU | brain dump | not in 173 | not in 28 |
| AU | task breakdown | not in 136 | not in 13 |
| AU | shared to do list | not in 185 | not in 10 |
| AU | couples to do list | not in 190 | not in 30 |
| AU | household chores | not in 184 | not in 30 |
| AU | low energy planner | not in 184 | not in 30 |
| US | doubledone | **1** | **1** |
| US | adhd to do list | **29** | not in 30 |
| US | adhd planner | not in 193 | not in 30 |
| US | adhd | not in 190 | not in 30 |
| US | to do list | not in 187 | not in 18 |
| US | calm planner | not in 190 | not in 30 |
| US | autism planner | not in 181 | not in 30 |
| US | audhd | **60** | not in 30 |
| US | ocd planner | not in 185 | not in 30 |
| US | neurodivergent planner | not in 193 | not in 30 |
| US | brain dump | not in 171 | not in 28 |
| US | task breakdown | not in 154 | not in 14 |
| US | shared to do list | not in 156 | not in 15 |
| US | couples to do list | not in 191 | not in 30 |
| US | household chores | not in 187 | not in 30 |
| US | low energy planner | not in 188 | not in 30 |
| GB | doubledone | **1** | **1** |
| GB | adhd to do list | **43** | not in 30 |
| GB | adhd planner | not in 195 | not in 30 |
| GB | adhd | not in 194 | not in 30 |
| GB | to do list | not in 182 | not in 30 |
| GB | calm planner | not in 186 | not in 28 |
| GB | autism planner | not in 190 | not in 30 |
| GB | audhd | **35** | not in 30 |
| GB | ocd planner | not in 185 | not in 30 |
| GB | neurodivergent planner | not in 192 | not in 30 |
| GB | brain dump | not in 174 | not in 28 |
| GB | task breakdown | not in 132 | not in 8 |
| GB | shared to do list | not in 185 | not in 23 |
| GB | couples to do list | not in 190 | not in 30 |
| GB | household chores | not in 188 | not in 30 |
| GB | low energy planner | not in 184 | not in 30 |
| DE | doubledone | **1** | **1** |
| DE | adhs to do liste | **12** | not in 12 |
| DE | adhs | **87** | not in 30 |
| DE | aufgabenliste | not in 172 | not in 25 |
| FR | doubledone | **1** | **1** |
| FR | tdah | not in 192 | not in 29 |
| FR | liste de tâches | not in 186 | not in 30 |
| FR | tdah liste de tâches | **109** | not in 30 |
| IT | doubledone | **1** | **1** |
| IT | adhd lista | **10** | not in 11 |
| IT | lista cose da fare | **61** | not in 27 |
| ES | doubledone | **1** | **1** |
| ES | tdah | not in 193 | not in 30 |
| ES | lista de tareas | not in 176 | not in 30 |
| MX | doubledone | **1** | **1** |
| MX | tdah | not in 195 | not in 30 |
| MX | lista de tareas | not in 186 | not in 30 |

### 2026-11-01

| Store | Search | App Store |
|---|---|---|
| AU | doubledone | **1** |
| AU | adhd to do list | **18** |
| AU | adhd planner | **79** |
| AU | adhd | not in 194 |
| AU | to do list | **78** |
| AU | calm planner | not in 186 |
| AU | autism planner | not in 180 |
| AU | audhd | **14** |
| AU | ocd planner | **163** |
| AU | neurodivergent planner | **154** |
| AU | brain dump | not in 179 |
| AU | task breakdown | not in 135 |
| AU | shared to do list | not in 183 |
| AU | couples to do list | not in 191 |
| AU | household chores | not in 186 |
| AU | low energy planner | not in 183 |
| US | doubledone | **1** |
| US | adhd to do list | **31** |
| US | adhd planner | not in 192 |
| US | adhd | not in 191 |
| US | to do list | not in 184 |
| US | calm planner | not in 189 |
| US | autism planner | not in 184 |
| US | audhd | **48** |
| US | ocd planner | not in 184 |
| US | neurodivergent planner | not in 193 |
| US | brain dump | not in 173 |
| US | task breakdown | not in 153 |
| US | shared to do list | not in 158 |
| US | couples to do list | not in 192 |
| US | household chores | not in 188 |
| US | low energy planner | not in 187 |
| GB | doubledone | **1** |
| GB | adhd to do list | **29** |
| GB | adhd planner | not in 196 |
| GB | adhd | **38** |
| GB | to do list | not in 182 |
| GB | calm planner | not in 185 |
| GB | autism planner | not in 190 |
| GB | audhd | **31** |
| GB | ocd planner | not in 185 |
| GB | neurodivergent planner | not in 192 |
| GB | brain dump | not in 181 |
| GB | task breakdown | not in 128 |
| GB | shared to do list | not in 183 |
| GB | couples to do list | not in 188 |
| GB | household chores | not in 189 |
| GB | low energy planner | not in 184 |
| DE | doubledone | **1** |
| DE | adhs to do liste | **8** |
| DE | adhs | not in 188 |
| DE | aufgabenliste | not in 173 |
| FR | doubledone | **1** |
| FR | tdah | not in 192 |
| FR | liste de tâches | not in 194 |
| FR | tdah liste de tâches | **114** |
| IT | doubledone | **1** |
| IT | adhd lista | **9** |
| IT | lista cose da fare | **42** |
| ES | doubledone | **1** |
| ES | tdah | not in 194 |
| ES | lista de tareas | not in 176 |
| MX | doubledone | **1** |
| MX | tdah | not in 195 |
| MX | lista de tareas | not in 187 |
