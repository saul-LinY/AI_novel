"""Durable desired snapshots. Graphiti is a rebuildable projection of these sources."""
import json
import sqlite3
import time
from uuid import uuid4


class QueueStore:
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('''CREATE TABLE IF NOT EXISTS streams (
            scope TEXT NOT NULL, view TEXT NOT NULL, group_id TEXT NOT NULL,
            payload TEXT NOT NULL, processed INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL, retry_at REAL NOT NULL DEFAULT 0,
            error TEXT, updated_at REAL NOT NULL, PRIMARY KEY(scope, view))''')
        self.db.execute('CREATE TABLE IF NOT EXISTS scope_owners (scope TEXT PRIMARY KEY, owner TEXT NOT NULL)')
        self.db.execute('''CREATE TABLE IF NOT EXISTS retirements (
            scope TEXT PRIMARY KEY, groups_json TEXT NOT NULL, pending INTEGER NOT NULL DEFAULT 1,
            retry_at REAL NOT NULL DEFAULT 0)''')
        # An interrupted LLM operation may already have changed old facts. Never
        # replay that ambiguous operation into the same graph generation.
        for row in self.db.execute("SELECT * FROM streams WHERE status = 'indexing'").fetchall():
            self.db.execute("UPDATE streams SET group_id=?, processed=0, status='pending', retry_at=0 WHERE scope=? AND view=?",
                            (self.new_group(), row['scope'], row['view']))
        self.db.commit()

    @staticmethod
    def new_group():
        return 'novel_' + uuid4().hex

    def get(self, scope, view):
        row = self.db.execute('SELECT * FROM streams WHERE scope=? AND view=?', (scope, view)).fetchone()
        if row is None:
            return None
        result = dict(row)
        result['payload'] = json.loads(result['payload'])
        return result

    def submit(self, payload):
        scope, view = payload['scope'], payload['view']
        if self.retired(scope):
            raise ValueError('Retired scope cannot accept stale snapshots')
        old = self.get(scope, view)
        manifest = [e['fingerprint'] for e in payload['events']]
        prior = [e['fingerprint'] for e in old['payload']['events']] if old else []
        append_only = old is not None and manifest[:len(prior)] == prior
        group = old['group_id'] if append_only else self.new_group()
        processed = old['processed'] if append_only else 0
        unchanged = old is not None and manifest == prior
        status = old['status'] if unchanged else ('ready' if processed == len(manifest) else 'pending')
        # Keep indexing state on appends until the in-flight event acknowledges;
        # a crash must still trigger a rebuild, not an unsafe replay.
        if append_only and old['status'] in ('indexing', 'failed'):
            status = old['status']
        retry_at = old['retry_at'] if unchanged else 0
        error = old['error'] if unchanged else None
        self.db.execute('''INSERT INTO streams VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(scope,view) DO UPDATE SET group_id=excluded.group_id,
            payload=excluded.payload, processed=excluded.processed, status=excluded.status,
            retry_at=excluded.retry_at, error=excluded.error, updated_at=excluded.updated_at''',
            (scope, view, group, json.dumps(payload, ensure_ascii=False), processed, status, retry_at, error, time.time()))
        self.db.commit()
        return self.get(scope, view)

    def retired(self, scope):
        return self.db.execute('SELECT 1 FROM retirements WHERE scope=?', (scope,)).fetchone() is not None

    def reconcile(self, owner, active_scopes):
        keep = set(active_scopes)
        for scope in keep:
            prior = self.db.execute('SELECT owner FROM scope_owners WHERE scope=?', (scope,)).fetchone()
            if self.retired(scope) or (prior and prior['owner'] != owner):
                raise ValueError('Scope is retired or belongs to another story owner')
        with self.db:
            for scope in keep:
                self.db.execute('INSERT OR IGNORE INTO scope_owners VALUES (?,?)', (scope, owner))
            owned = self.db.execute('SELECT scope FROM scope_owners WHERE owner=?', (owner,)).fetchall()
            for row in owned:
                scope = row['scope']
                if scope in keep:
                    continue
                groups = [r['group_id'] for r in self.db.execute('SELECT group_id FROM streams WHERE scope=?', (scope,))]
                self.db.execute('INSERT OR IGNORE INTO retirements(scope,groups_json) VALUES (?,?)', (scope, json.dumps(groups)))
                # Durable tombstone precedes graph deletion. In-flight workers
                # can finish, but cannot publish or enqueue this scope again.
                self.db.execute('DELETE FROM streams WHERE scope=?', (scope,))

    def next_retirement(self):
        row = self.db.execute('SELECT * FROM retirements WHERE pending=1 AND retry_at<=? ORDER BY rowid LIMIT 1', (time.time(),)).fetchone()
        return dict(row) if row else None

    def finish_retirement(self, scope, failed=False):
        self.db.execute('UPDATE retirements SET pending=?,retry_at=? WHERE scope=?', (int(failed), time.time() + 15 if failed else 0, scope))
        self.db.commit()

    def cleanup_pending(self):
        return self.db.execute('SELECT count(*) FROM retirements WHERE pending=1').fetchone()[0]

    def next(self):
        row = self.db.execute("SELECT scope, view FROM streams WHERE status IN ('pending','failed') AND retry_at<=? ORDER BY updated_at LIMIT 1", (time.time(),)).fetchone()
        if row is None:
            return None
        current = self.get(row['scope'], row['view'])
        if current['status'] == 'failed':
            self.db.execute('UPDATE streams SET group_id=?, processed=0 WHERE scope=? AND view=?',
                            (self.new_group(), row['scope'], row['view']))
        self.db.execute("UPDATE streams SET status='indexing' WHERE scope=? AND view=?", (row['scope'], row['view']))
        self.db.commit()
        return self.get(row['scope'], row['view'])

    def finish(self, job, error=None):
        current = self.get(job['scope'], job['view'])
        if not current or current['group_id'] != job['group_id']:
            return  # A revision superseded this worker; do not publish its graph.
        processed = job['processed'] + (0 if error else 1)
        state = 'failed' if error else ('ready' if processed == len(current['payload']['events']) else 'pending')
        self.db.execute('UPDATE streams SET processed=?,status=?,retry_at=?,error=?,updated_at=? WHERE scope=? AND view=?',
                        (processed, state, time.time() + 60 if error else 0, error, time.time(), job['scope'], job['view']))
        self.db.commit()

    def summaries(self, scope=None):
        rows = self.db.execute('SELECT scope,view FROM streams' + (' WHERE scope=?' if scope else ''), (scope,) if scope else ()).fetchall()
        return [self.summary(self.get(r['scope'], r['view'])) for r in rows]

    @staticmethod
    def summary(row):
        p = row['payload']
        n = row['processed']
        return dict(scope=row['scope'], view=row['view'], groupId=row['group_id'],
                    fingerprint=p['fingerprint'], status=row['status'], indexed=n,
                    total=len(p['events']), headEventId=p['headEventId'],
                    indexedThroughEventId=p['events'][n - 1]['id'] if n else None,
                    error=row['error'])

    def close(self):
        self.db.close()
