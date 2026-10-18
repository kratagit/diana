// Funkcje bramek w D-algebrze, opcje badania zgodności i przypisywanie wartości przez węzły.
const test = require('node:test');
const assert = require('node:assert/strict');

const { DAlgorithmEngine } = require('../web/engine.js');
const { circuit } = require('./helpers.js');
const { LOGIC, dGate } = require('./oracle.js');

const GATES = ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR'];
const VALUES = ['0', '1', 'D', '~D', 'x'];
const BITS = [[0, 0], [0, 1], [1, 0], [1, 1]];
const eng = new DAlgorithmEngine({}, null, 'sa0', {});

function prepared(comps, target, fault = 'sa0') {
    const e = new DAlgorithmEngine(comps, target, fault, {});
    e.prepare();
    return e;
}

for (const gate of GATES) {
    test(`tablica prawdy: ${gate}`, () => {
        for (const [a, b] of BITS) assert.equal(eng.evalValues(gate, [String(a), String(b)]), String(LOGIC[gate]([a, b])));
    });
}

for (const gate of [...GATES, 'NOT']) {
    test(`D-algebra zgodna z wyrocznią: ${gate}`, () => {
        // Wartości w D-algebrze (z x) zgodne z niezależną wyrocznią dla wszystkich kombinacji wejść.
        const combos = gate === 'NOT' ? VALUES.map(v => [v]) : VALUES.flatMap(a => VALUES.map(b => [a, b]));
        for (const ins of combos) assert.equal(eng.evalValues(gate, ins), dGate(gate, ...ins), ins.join(','));
    });
}

test('NOT, węzeł i wejście', () => {
    assert.equal(eng.evalValues('NOT', ['0']), '1');
    assert.equal(eng.evalValues('NOT', ['x']), 'x');
    assert.equal(eng.evalValues('NODE', ['1']), '1');
    assert.equal(eng.evalValues('IN', ['0']), '0');
});

for (const [gate, ctrl, out] of [['AND', '0', '0'], ['NAND', '0', '1'], ['OR', '1', '1'], ['NOR', '1', '0']]) {
    test(`wartość kontrolująca wygrywa z x: ${gate}`, () => {
        assert.equal(eng.evalValues(gate, [ctrl, 'x']), out);
        assert.equal(eng.evalValues(gate, ['x', ctrl]), out);
    });
}

for (const gate of GATES) {
    for (const val of ['0', '1']) {
        test(`opcje badania zgodności trafne i pełne: ${gate} = ${val}`, () => {
            // Każda opcja daje 'val' niezależnie od pozostałych 'x', a każde wejście dające 'val' jest pokryte.
            const options = prepared(circuit({ X1: 'IN', X2: 'IN', G1: [gate, 'X1', 'X2'] }), 'G1').requirementOptions('G1', val);
            assert.ok(options.length);
            const covers = (o, a, b) => (o.X1 ?? String(a)) === String(a) && (o.X2 ?? String(b)) === String(b);
            for (const o of options) {
                for (const [a, b] of BITS) if (covers(o, a, b)) assert.equal(String(LOGIC[gate]([a, b])), val, JSON.stringify([o, a, b]));
            }
            for (const [a, b] of BITS) {
                if (String(LOGIC[gate]([a, b])) === val) assert.ok(options.some(o => covers(o, a, b)), `${a}, ${b}`);
            }
        });
    }
}

test('opcje badania zgodności: NOT', () => {
    const e = prepared(circuit({ X1: 'IN', G1: ['NOT', 'X1'] }), 'G1');
    assert.deepEqual(e.requirementOptions('G1', '1'), [{ X1: '0' }]);
    assert.deepEqual(e.requirementOptions('G1', '0'), [{ X1: '1' }]);
});

test('wartości D w opcjach tylko tam, gdzie może dotrzeć błąd', () => {
    // G3 = XOR(W1, G2) z W1 = D: wartość 1 daje G2 = ~D (G2 = NOT(W1) leży w zasięgu błędu)
    const comps = circuit({ X1: 'IN', X2: 'IN', G1: ['AND', 'X1', 'X2'], W1: ['NODE', 'G1'], G2: ['NOT', 'W1'],
                            G3: ['XOR', 'W1', 'G2'], G4: ['XOR', 'W1', 'X2'] });
    const e = prepared(comps, 'G1');
    e.assignState('G1', 'D', {});
    assert.deepEqual(e.requirementOptions('G3', '1'), [{ G2: '~D' }]);
    assert.deepEqual(e.requirementOptions('G4', '1'), []);  // X2 nie może mieć wartości D
});

test('dwa wejścia z tej samej linii dostają tę samą wartość', () => {
    const e = prepared(circuit({ X1: 'IN', X2: 'IN', G1: ['OR', 'X1', 'X2'], W1: ['NODE', 'G1'], G2: ['AND', 'W1', 'W1'] }), 'G2');
    assert.deepEqual(e.requirementOptions('G2', '0'), [{ G1: '0' }]);
    assert.deepEqual(e.requirementOptions('G2', '1'), [{ G1: '1' }]);
});

test('resolveName przechodzi przez łańcuch węzłów', () => {
    const e = new DAlgorithmEngine(circuit({ X1: 'IN', W1: ['NODE', 'X1'], W2: ['NODE', 'W1'], G1: ['NOT', 'W2'] }), 'G1', 'sa0', {});
    assert.equal(e.resolveName('W2'), 'X1');
    assert.equal(e.resolveName('W1'), 'X1');
    assert.equal(e.resolveName('G1'), 'G1');
});

test('assignState przenosi wartość przez węzły i wykrywa sprzeczność', () => {
    const comps = circuit({ X1: 'IN', W1: ['NODE', 'X1'], W2: ['NODE', 'W1'], G1: ['NOT', 'W2'] });
    const e = new DAlgorithmEngine(comps, 'G1', 'sa0', {});
    e.state = Object.fromEntries(Object.keys(comps).map(c => [c, 'x']));
    const delta = {};
    assert.equal(e.assignState('W1', '1', delta), false);
    assert.deepEqual([e.state.X1, e.state.W1, e.state.W2], ['1', '1', '1']);
    assert.deepEqual(delta, { W1: '1', X1: '1', W2: '1' });
    assert.equal(e.assignState('W2', '1', {}), false);  // ta sama wartość - brak zmian
    assert.equal(e.assignState('X1', '0', {}), true);   // sprzeczność
});
