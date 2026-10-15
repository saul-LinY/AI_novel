// Browser queries must select one exact story scope and perspective. A display
// label is independent of Graphiti's semantic name and embedding.
export function graphBrowserQuery(stream) {
  if (!stream || !/^novel_[a-f0-9]{32}$/.test(stream.groupId) || !/^novel-[a-f0-9]{32}$/.test(stream.scope)
    || !/^(global|environment|character:[a-zA-Z0-9:_-]+)$/.test(stream.view) || stream.status === 'snapshot_mismatch') return null;
  return `MATCH (s:NovelMemoryStream {scope: '${stream.scope}', view: '${stream.view}', group_id: '${stream.groupId}', active: true})
MATCH (n:Entity {group_id: s.group_id})
OPTIONAL MATCH (n)-[r:RELATES_TO]->(m:Entity {group_id: s.group_id})
RETURN n, r, m
LIMIT 1000;`;
}

export function browserURL(command) {
  return 'http://localhost:7474/browser/?' + new URLSearchParams({ cmd: 'edit', arg: command });
}
