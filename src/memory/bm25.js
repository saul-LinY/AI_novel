import { digest } from './cards.js';

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
const stopWords = new Set(('的 了 是 在 和 与 及 我 你 他 她 它 他们 她们 我们 你们 这 那 一个 一些 什么 哪些 哪个 为什么 怎么 如何 哪里 是否 可以 请 现在 当前 地点 目标 本轮 进行 需要 应该 the a an is are was were be to of in on for and or it he she they what why where when who how do does did').split(' '));
const normalize = (value) => String(value ?? '').normalize('NFKC').toLocaleLowerCase('zh-CN');
const regexEscape = (value) => [...value].map((char) => '^$.*+?()[]{}|\\'.includes(char) ? String.fromCharCode(92) + char : char).join('');

export function buildAliasGroups(storyPackage, state) {
  const groups = new Map();
  const source = storyPackage.characters ?? [];
  for (const person of [...(Array.isArray(source) ? source : Object.values(source)), ...Object.values(state?.characters ?? {})]) {
    if (!person.id || !person.name) continue;
    const group = groups.get(person.id) ?? { id: person.id, name: person.name, aliases: new Set() };
    group.name = person.name;
    for (const name of [person.id, person.name, ...(person.aliases ?? [])]) if (typeof name === 'string' && name.trim().length > 1) group.aliases.add(name);
    groups.set(person.id, group);
  }
  return [...groups.values()].map((group) => ({ ...group, aliases: [...group.aliases].sort() })).sort((a, b) => a.id.localeCompare(b.id));
}

export function createTokenizer(aliasGroups = []) {
  const owners = new Map();
  const labels = new Map();
  for (const group of aliasGroups) {
    const token = 'entity' + digest(group.id).slice(0, 16);
    labels.set(token, group.name);
    for (const alias of group.aliases) {
      const text = normalize(alias);
      if (!owners.has(text)) owners.set(text, new Set());
      owners.get(text).add(token);
    }
  }
  // Ambiguous aliases are deliberately not expanded into an arbitrary person.
  const aliases = [...owners].filter(([, values]) => values.size === 1).sort((a, b) => b[0].length - a[0].length).map(([alias, values]) => ({
    expression: new RegExp((/^[a-z0-9_]/i.test(alias) ? '(?<![a-z0-9_])' : '') + regexEscape(alias) + (/[a-z0-9_]$/i.test(alias) ? '(?![a-z0-9_])' : ''), 'gu'), token: [...values][0],
  }));
  return {
    tokenize(value) {
      const text = normalize(value);
      const entities = [];
      const occupied = [];
      // Keep surface words as well as canonical aliases. Replacing a full name
      // would otherwise make an unlisted but token-matching short name vanish.
      for (const alias of aliases) for (const match of text.matchAll(alias.expression)) {
        const start = match.index, end = start + match[0].length;
        if (occupied.some((span) => start < span.end && end > span.start)) continue;
        occupied.push({ start, end }); entities.push(alias.token);
      }
      const words = [...segmenter.segment(text)].filter((part) => part.isWordLike && !stopWords.has(part.segment)).map((part) => part.segment);
      const tokens = [...words, ...entities].map((word) => 'w:' + word);
      // Low-weight character bigrams make Chinese word-boundary differences
      // searchable, without inventing semantic synonyms or extra facts.
      for (const word of words) if (/^[\p{Script=Han}]{3,}$/u.test(word)) {
        const chars = [...word];
        for (let i = 0; i + 1 < chars.length; i++) tokens.push('g:' + chars[i] + chars[i + 1]);
      }
      return tokens;
    },
    label(token) { const word = token.slice(2); return labels.get(word) ?? word; },
  };
}

export class BM25Index {
  constructor(records, aliasGroups = [], { k1 = 1.2, b = 0.75 } = {}) {
    this.records = records;
    this.k1 = k1; this.b = b;
    this.tokenizer = createTokenizer(aliasGroups);
    this.postings = new Map();
    this.lengths = [];
    let total = 0;
    for (const [index, record] of records.entries()) {
      const tokens = this.tokenizer.tokenize(record.text);
      const frequencies = new Map();
      for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
      const length = tokens.filter((token) => token.startsWith('w:')).length;
      this.lengths.push(length); total += length;
      for (const [token, count] of frequencies) {
        if (!this.postings.has(token)) this.postings.set(token, new Map());
        this.postings.get(token).set(index, count);
      }
    }
    this.averageLength = records.length ? Math.max(total / records.length, 1) : 1;
  }

  search(query, limit = 5) {
    const queryTerms = [...new Set(this.tokenizer.tokenize(query))];
    const scores = new Map();
    const matched = new Map();
    const n = this.records.length;
    for (const token of queryTerms) {
      const posting = this.postings.get(token);
      if (!posting) continue;
      const idf = Math.log(1 + (n - posting.size + 0.5) / (posting.size + 0.5));
      const weight = token.startsWith('g:') ? 0.2 : 1;
      for (const [index, frequency] of posting) {
        const normalization = this.k1 * (1 - this.b + this.b * this.lengths[index] / this.averageLength);
        const score = weight * idf * frequency * (this.k1 + 1) / (frequency + normalization);
        scores.set(index, (scores.get(index) ?? 0) + score);
        if (!matched.has(index)) matched.set(index, new Set());
        matched.get(index).add(this.tokenizer.label(token));
      }
    }
    return [...scores].sort((a, b) => b[1] - a[1] || this.records[b[0]].ordinal - this.records[a[0]].ordinal || this.records[a[0]].id.localeCompare(this.records[b[0]].id)).slice(0, limit).map(([index, score]) => ({ record: this.records[index], score, matchedTerms: [...matched.get(index)] }));
  }
}
