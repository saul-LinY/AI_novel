import test from 'node:test';
import assert from 'node:assert/strict';
import { graphBrowserQuery, browserURL } from '../console/graph-browser.js';

const stream = { scope: 'novel-' + 'a'.repeat(32), groupId: 'novel_' + 'b'.repeat(32), view: 'character:erii', status: 'ready' };
test('Neo4j links constrain both nodes to the selected story and perspective', () => {
  const query = graphBrowserQuery(stream);
  assert.ok(query.includes(`scope: '${stream.scope}'`));
  assert.ok(query.includes(`group_id: '${stream.groupId}'`));
  assert.ok(query.includes("view: 'character:erii'"));
  assert.equal(query.match(/:Entity \{group_id: s.group_id\}/g).length, 2);
  assert.equal(new URL(browserURL(query)).searchParams.get('arg'), query);
});
test('missing, mismatched historical snapshots and untrusted identifiers cannot open broad graph queries', () => {
  assert.equal(graphBrowserQuery(null), null);
  assert.equal(graphBrowserQuery({ ...stream, status: 'snapshot_mismatch' }), null);
  assert.equal(graphBrowserQuery({ ...stream, groupId: "x' RETURN 1 //" }), null);
  assert.equal(graphBrowserQuery({ ...stream, view: 'all' }), null);
});
