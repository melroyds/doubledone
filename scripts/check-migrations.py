#!/usr/bin/env python3
"""Which of supabase/*.sql are actually applied to the live database?

Run:  python scripts/check-migrations.py

WHY THIS EXISTS
---------------
Every Supabase file in this repo is pasted BY HAND into the dashboard, so "is it applied?" has
only ever been answerable from memory or from a line in a doc that somebody remembered to write.
On 2026-08-16 an adversarial review flagged three files with no applied record anywhere
(ours-due, ours-open, ours-rename-self), one of which carries "DO NOT APPLY UNTIL REVIEWED" in its
own header while the SHIPPED build calls the function it creates. That is a question worth being
able to answer in one command rather than one conversation.

All six turned out to be applied. The point is that nobody could prove it without asking.

HOW IT WORKS
------------
The anon key cannot read a single row, and that is fine: we are asking whether an OBJECT exists,
not what is in it. PostgREST answers that through its error codes, and the difference is crisp
once you have controls:

  PGRST205  the TABLE does not exist
  42703     the COLUMN does not exist
  42501     permission denied  ->  the object EXISTS and Postgres refused execution
  PGRST202  no function of that name with THOSE parameter names

That last one is the trap. Calling any function with no arguments returns PGRST202 whether it
exists or not (it means "no zero-arg overload"), so a probe MUST pass the real parameter names or
it reports a false missing. Every function here is `revoke ... from public, anon`, so the EXECUTE
check fires before the body runs and a probe can never mutate anything. Confirmed empirically: a
known-good control and a garbage name are included in the run precisely so the output interprets
itself rather than asking you to trust these comments.

Reads EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY from client/.env (gitignored).
The key is never printed. Nothing is written. Safe to run against production, which is the only
place it is useful.
"""

import io
import json
import os
import sys
import urllib.error
import urllib.request

NIL = '00000000-0000-0000-0000-000000000000'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (file, label, kind, target, params) -- kind is 'table' | 'absent-table' | 'column' | 'function'
#
# 'absent-table' inverts the test: ours-open.sql's whole job is DROPPING ours_allowlist, so the
# table being gone is the proof it ran. That is the one check here where "not found" is the pass.
CHECKS = [
    ('ours.sql', 'shared_tasks table', 'table', 'shared_tasks', None),
    ('ours.sql', 'create_pair_invite()', 'function', 'create_pair_invite',
     {'p_invited_email': 'probe@example.invalid', 'p_my_label': 'probe', 'p_name': None}),
    ('ours.sql', 'forget_pair()', 'function', 'forget_pair', {'p_pair': NIL}),
    ('ours.sql', 'rename_pair()', 'function', 'rename_pair', {'p_pair': NIL, 'p_name': 'probe'}),
    ('tasks-shared-ref.sql', 'tasks.shared_ref column', 'column', 'tasks.shared_ref', None),
    ('ours-resume.sql', 'invite_to_resume()', 'function', 'invite_to_resume', {'p_pair': NIL}),
    ('ours-resume.sql', 'resume_pair()', 'function', 'resume_pair', {'p_code': 'PROBE0'}),
    ('ours-resume.sql', 'sweep_shared_tombstones()', 'function', 'sweep_shared_tombstones', {'p_pair': NIL}),
    ('ours-due.sql', 'shared_tasks.due column', 'column', 'shared_tasks.due', None),
    ('ours-open.sql', 'ours_allowlist DROPPED', 'absent-table', 'ours_allowlist', None),
    ('ours-rename-self.sql', 'rename_self()', 'function', 'rename_self', {'p_pair': NIL, 'p_label': 'probe'}),
]

# Controls, run first, so the output proves its own error codes rather than asking you to trust them.
CONTROLS = [
    ('a column that cannot exist', 'column', 'shared_tasks.zzz_not_a_real_column', None),
    ('a function that cannot exist', 'function', 'zzz_no_such_function', {'p_probe': 1}),
]


def load_env():
    path = os.path.join(ROOT, 'client', '.env')
    if not os.path.exists(path):
        sys.exit('No client/.env. This script needs the project URL and the publishable key.')
    env = {}
    for line in io.open(path, encoding='utf-8'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    try:
        return env['EXPO_PUBLIC_SUPABASE_URL'].rstrip('/'), env['EXPO_PUBLIC_SUPABASE_ANON_KEY']
    except KeyError as missing:
        sys.exit('client/.env is missing %s' % missing)


def call(url, key, method, path, body=None):
    req = urllib.request.Request(url + path, method=method)
    req.add_header('apikey', key)
    req.add_header('Authorization', 'Bearer ' + key)
    if body is not None:
        req.add_header('Content-Type', 'application/json')
        req.data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return res.status, res.read(400).decode('utf-8', 'replace')
    except urllib.error.HTTPError as err:
        return err.code, err.read(400).decode('utf-8', 'replace')
    except Exception as err:  # network, DNS, TLS
        return None, 'ERR ' + repr(err)


def probe(url, key, kind, target, params):
    """Returns (exists, pgcode). `exists` is None when the answer is not interpretable."""
    if kind in ('table', 'absent-table'):
        status, text = call(url, key, 'GET', '/rest/v1/%s?select=*&limit=1' % target)
    elif kind == 'column':
        table, column = target.split('.')
        status, text = call(url, key, 'GET', '/rest/v1/%s?select=%s&limit=1' % (table, column))
    else:
        status, text = call(url, key, 'POST', '/rest/v1/rpc/%s' % target, params or {})

    try:
        code = json.loads(text).get('code') or ''
    except Exception:
        code = ''

    if status == 200:
        return True, code            # readable, so it plainly exists
    if code == '42501':
        return True, code            # RLS or EXECUTE refused: the object is there
    if code in ('PGRST205', 'PGRST202', '42703'):
        return False, code
    return None, code


def main():
    url, key = load_env()
    print('project: %s\n' % url)     # url only, never the key

    print('controls, so the codes below interpret themselves')
    for label, kind, target, params in CONTROLS:
        exists, code = probe(url, key, kind, target, params)
        print('  %-30s -> %-9s (expected: not found)' % (label, code or '?'))

    print('\nmigrations')
    worst = 0
    current = None
    for filename, label, kind, target, params in CHECKS:
        if filename != current:
            print('\n  supabase/%s' % filename)
            current = filename
        exists, code = probe(url, key, kind, target, params)
        want_absent = kind == 'absent-table'
        ok = (exists is False) if want_absent else (exists is True)
        if exists is None:
            mark, worst = '?  UNCLEAR', max(worst, 2)
        elif ok:
            mark = 'OK'
        else:
            mark, worst = 'NOT APPLIED', max(worst, 1)
        print('    %-28s %-12s %s' % (label, mark, code))

    print()
    if worst == 0:
        print('All checked objects are present. Every supabase/*.sql above is applied.')
    elif worst == 1:
        print('Something is NOT applied. Paste that file ALONE into the Supabase SQL editor.')
    else:
        print('At least one probe was not interpretable. Check the project URL and the key.')
    return worst


if __name__ == '__main__':
    sys.exit(0 if main() == 0 else 1)
