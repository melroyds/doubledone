"""Where DoubleDone shows up in each store's public search, for the searches its listings target.

    python scripts/store-ranks.py                 # measure now, print a dated markdown section
    python scripts/store-ranks.py --append        # ...and append it to docs/store-search-ranks.md
    python scripts/store-ranks.py --from-json F   # render a saved run (F) instead of measuring

A PROXY, read it as one. The App Store column is the iTunes Search API (up to 200 iPhone apps, unpersonalised), close
to but not the same as search on a phone. The Play column is the public search page's first page (about 30 apps), so
"not in 30" means off the first page, not unranked. Same terms, same countries, every run, so runs compare like for
like. Writes nothing but the doc; needs no key. About four minutes: the Search API is rate limited, so it paces itself.
"""
import argparse
import datetime
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

APPLE_ID = 6790136615
PLAY_ID = "app.doubledone"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
DOC = pathlib.Path(__file__).resolve().parent.parent / "docs" / "store-search-ranks.md"

# Never edit these between runs without starting a new baseline: the point is comparing like with like.
EN = ["doubledone", "adhd to do list", "adhd planner", "adhd", "to do list", "calm planner", "autism planner",
      "audhd", "ocd planner", "neurodivergent planner", "brain dump", "task breakdown", "shared to do list",
      "couples to do list", "household chores", "low energy planner"]
SETS = [
    ("au", "en_AU", EN), ("us", "en_US", EN), ("gb", "en_GB", EN),
    ("de", "de", ["doubledone", "adhs to do liste", "adhs", "aufgabenliste"]),
    ("fr", "fr", ["doubledone", "tdah", "liste de tâches", "tdah liste de tâches"]),
    ("it", "it", ["doubledone", "adhd lista", "lista cose da fare"]),
    ("es", "es", ["doubledone", "tdah", "lista de tareas"]),
    ("mx", "es_419", ["doubledone", "tdah", "lista de tareas"]),
]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def apple(term, country):
    q = urllib.parse.urlencode({"term": term, "country": country, "entity": "software", "limit": 200})
    err = ""
    for attempt in range(3):
        try:
            ids = [r.get("trackId") for r in json.loads(get("https://itunes.apple.com/search?" + q))["results"]]
            return {"rank": ids.index(APPLE_ID) + 1 if APPLE_ID in ids else None, "of": len(ids)}
        except Exception as e:  # a rate limit or a blip: back off and retry
            err = str(e)
            time.sleep(20 * (attempt + 1))
    return {"error": err}


def play(term, country, hl):
    q = urllib.parse.urlencode({"q": term, "c": "apps", "hl": hl, "gl": country.upper()})
    try:
        page = get("https://play.google.com/store/search?" + q)
    except Exception as e:
        return {"error": str(e)}
    ids = []
    for m in re.finditer(r"/store/apps/details\?id=([A-Za-z0-9_.]+)", page):
        if m.group(1) not in ids:
            ids.append(m.group(1))
    return {"rank": ids.index(PLAY_ID) + 1 if PLAY_ID in ids else None, "of": len(ids)}


def measure():
    rows = []
    for country, hl, terms in SETS:
        for term in terms:
            rows.append({"country": country, "term": term, "apple": apple(term, country), "play": play(term, country, hl)})
            print(".", end="", file=sys.stderr, flush=True)
            time.sleep(3.5)
    print(file=sys.stderr)
    return rows


def cell(r):
    if "error" in r:
        return "error"
    return f"**{r['rank']}**" if r["rank"] else f"not in {r['of']}"


def render(rows, date):
    out = [f"### {date}", "", "| Store | Search | App Store | Google Play |", "|---|---|---|---|"]
    out += [f"| {r['country'].upper()} | {r['term']} | {cell(r['apple'])} | {cell(r['play'])} |" for r in rows]
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--append", action="store_true")
    ap.add_argument("--from-json")
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    a = ap.parse_args()
    rows = json.loads(pathlib.Path(a.from_json).read_text(encoding="utf-8")) if a.from_json else measure()
    section = render(rows, a.date)
    sys.stdout.reconfigure(encoding="utf-8")
    print(section)
    if a.append:
        with DOC.open("a", encoding="utf-8", newline="\n") as f:
            f.write("\n" + section)
