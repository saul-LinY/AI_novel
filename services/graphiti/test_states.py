import unittest

from state_projection import transition_plan, validate_changes, state_sources


def event(n, minutes=None):
    return {'id': f'e{n}', 'ordinal': n, 'timeMinutes': n * 5 if minutes is None else minutes}


def change(value, operation='set', property='holder', card='card'):
    return dict(subject='item', property=property, value=value, operation=operation,
                subjectName='蓝色本子', valueName=value, cardId=card, quote='逐字交接记录', supports=[])


class StateTests(unittest.TestCase):
    def test_prose_and_its_summary_are_not_counted_as_separate_transfers(self):
        records = [{'id': 'p', 'kind': 'narrative'}, {'id': 'l', 'kind': 'ledger'}, {'id': 'm', 'kind': 'character-memory'}]
        self.assertEqual([r['id'] for r in state_sources(records)], ['p'])
        self.assertEqual([r['id'] for r in state_sources(records[1:])], ['l'])

    def test_transfer_and_return_create_distinct_intervals(self):
        a = transition_plan('g', event(0), [], [change('a')])[0]
        updates = transition_plan('g', event(1), [a], [change('b')])
        old = next(s for s in updates if s['value'] == 'a')
        b = next(s for s in updates if s['value'] == 'b')
        self.assertEqual(old['invalidAt'], b['validAt'])
        last = transition_plan('g', event(2), [b], [change('a')])
        returned = next(s for s in last if s['value'] == 'a')
        self.assertNotEqual(a['edgeUuid'], returned['edgeUuid'])
        self.assertNotEqual(a['key'], returned['key'])
        self.assertIsNone(returned['invalidAt'])
        self.assertEqual(sum(s['invalidAt'] is None for s in last), 1)

    def test_reassertion_preserves_start_and_adds_evidence(self):
        a = transition_plan('g', event(0), [], [change('a')])[0]
        repeated = transition_plan('g', event(1), [a], [change('a', card='later')])[0]
        self.assertEqual(a['key'], repeated['key'])
        self.assertEqual(a['validAt'], repeated['validAt'])
        self.assertEqual(repeated['cardIds'], ['card', 'later'])

    def test_negating_old_holder_does_not_clear_current_holder(self):
        b = transition_plan('g', event(1), [], [change('b')])[0]
        self.assertEqual(transition_plan('g', event(2), [b], [change('a', 'clear')]), [])
        cleared = transition_plan('g', event(2), [b], [change('b', 'clear')])
        self.assertIsNotNone(cleared[0]['invalidAt'])

    def test_properties_and_same_minute_sequences_are_independent(self):
        a = transition_plan('g', event(0), [], [change('a')])[0]
        states = transition_plan('g', event(1, 0), [a], [change('b'), change('c'), change('shelf', property='location')])
        self.assertEqual(sum(s['property'] == 'holder' and s['invalidAt'] is None for s in states), 1)
        self.assertEqual(sum(s['property'] == 'location' and s['invalidAt'] is None for s in states), 1)
        self.assertEqual(len({s['edgeUuid'] for s in states}), 4)

    def test_literal_grounding_and_epistemic_boundaries(self):
        records = [{'id': 'card', 'text': '她以为本子仍由阿青保管。'}]
        nodes = [{'uuid': 'item', 'name': '本子', 'labels': ['Item']}, {'uuid': 'a', 'name': '阿青', 'labels': ['Character']}]
        c = dict(subject=0, value=1, property='holder', operation='set', basis='belief', card=0, quote=records[0]['text'])
        self.assertEqual(validate_changes({'changes': [c]}, records, nodes, [], 'global'), [])
        self.assertEqual(len(validate_changes({'changes': [c]}, records, nodes, [], 'character:x')), 1)
        for basis in ['historical', 'plan', 'uncertain']:
            self.assertEqual(validate_changes({'changes': [c | {'basis': basis}]}, records, nodes, [], 'character:x'), [])
        with self.assertRaises(ValueError):
            validate_changes({'changes': [c | {'quote': '模型编造的文字'}]}, records, nodes, [], 'character:x')
        with self.assertRaises(ValueError):
            validate_changes({'changes': [c | {'subject': 9}]}, records, nodes, [], 'character:x')

    def test_unrelated_native_edges_cannot_be_expired(self):
        records = [{'id': 'card', 'text': '阿青拿着本子。'}]
        nodes = [{'uuid': 'item', 'name': '本子', 'labels': ['Item']}, {'uuid': 'a', 'name': '阿青', 'labels': ['Character']}]
        c = dict(subject=0, value=1, property='holder', operation='set', basis='current', card=0,
                 quote=records[0]['text'], supporting_facts=[0])
        with self.assertRaises(ValueError):
            validate_changes({'changes': [c]}, records, nodes, [{'uuid': 'e', 'name': 'HOLDS', 'source': 'someone-else', 'target': 'item'}], 'global')
        owns = {'uuid': 'e', 'name': 'OWNS', 'source': 'a', 'target': 'item'}
        self.assertEqual(validate_changes({'changes': [c]}, records, nodes, [owns], 'global')[0]['supports'], [])


if __name__ == '__main__':
    unittest.main()
