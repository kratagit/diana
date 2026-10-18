// Niezależna wyrocznia testów – symulacja układu w logice 0/1 i w D-algebrze.
//
// Nie korzysta z kodu silnika. To na jej podstawie testy rozstrzygają, czy tabela
// wygenerowana przez silnik jest zgodna z prawdą: czy test wykrywa usterkę, czy stany
// linii zgadzają się z symulacją i czy zgłoszona sprzeczność jest rzeczywista.
//
// Wartości linii jak w silniku: '0', '1', 'D' (zdatny 1 / błędny 0), '~D' (zdatny 0 / błędny 1), 'x'.
// Bramki mogą mieć dowolną liczbę wejść (materiały używają np. 3-wejściowego OR).

const LOGIC = {
    AND: v => +v.every(b => b), OR: v => +v.some(b => b),
    NAND: v => 1 - v.every(b => b), NOR: v => 1 - v.some(b => b),
    XOR: v => v.filter(b => b).length % 2, XNOR: v => 1 - v.filter(b => b).length % 2,
    NOT: v => 1 - v[0], NODE: v => v[0],
};
const D_PAIRS = { '0': [0, 0], '1': [1, 1], 'D': [1, 0], '~D': [0, 1] };
const dName = (good, bad) => ({ '00': '0', '11': '1', '10': 'D', '01': '~D' })[`${good}${bad}`];

function gateInputs(comp) {
    const ins = comp.inputs.filter(i => i);
    return ['NOT', 'NODE'].includes(comp.type) ? ins.slice(0, 1) : ins;
}

// Wartości 0/1 wszystkich linii. fault = [linia, 0|1] wymusza stan wyjścia elementu.
function simulate(comps, pis, fault = null) {
    const memo = {};
    const val = cid => {
        if (!(cid in memo)) {
            const c = comps[cid];
            memo[cid] = fault && cid === fault[0] ? fault[1] : c.type === 'IN' ? pis[cid] : LOGIC[c.type](gateInputs(c).map(val));
        }
        return memo[cid];
    };
    return Object.fromEntries(Object.keys(comps).map(cid => [cid, val(cid)]));
}

// Wartości w D-algebrze: para (układ zdatny, układ z usterką) zapisana jako 0/1/D/~D.
function dSimulate(comps, pis, fault) {
    const good = simulate(comps, pis), bad = simulate(comps, pis, fault);
    return Object.fromEntries(Object.keys(comps).map(cid => [cid, dName(good[cid], bad[cid])]));
}

function product(lists) {
    return lists.reduce((acc, list) => acc.flatMap(a => list.map(v => [...a, v])), [[]]);
}

// Operacja D-algebry dla bramki (Tabela 2 materiałów). 'x' = dowolna z wartości 0, 1, D, ~D.
function dGate(gtype, ...values) {
    const results = new Set(product(values.map(v => v === 'x' ? Object.keys(D_PAIRS) : [v])).map(combo =>
        dName(LOGIC[gtype](combo.map(v => D_PAIRS[v][0])), LOGIC[gtype](combo.map(v => D_PAIRS[v][1])))));
    return results.size === 1 ? [...results][0] : 'x';
}

function natural(name) {
    const digits = name.replace(/\D/g, '');
    return [name.replace(/\d+$/, ''), digits ? parseInt(digits, 10) : 0];
}

const byNatural = (a, b) => { const [pa, na] = natural(a), [pb, nb] = natural(b); return pa < pb ? -1 : pa > pb ? 1 : na - nb; };

function primaryInputs(comps) {
    return Object.keys(comps).filter(c => comps[c].type === 'IN').sort(byNatural);
}

function primaryOutputs(comps) {
    const used = new Set(Object.values(comps).flatMap(gateInputs));
    return Object.keys(comps).filter(c => !used.has(c) && comps[c].type !== 'IN').sort();
}

// Linie, na które może dotrzeć błąd z linii target (łącznie z nią).
function faultCone(comps, target) {
    const cone = new Set([target]);
    for (let changed = true; changed;) {
        changed = false;
        for (const [cid, c] of Object.entries(comps)) {
            if (!cone.has(cid) && gateInputs(c).some(i => cone.has(i))) { cone.add(cid); changed = true; }
        }
    }
    return cone;
}

function allVectors(comps) {
    const pis = primaryInputs(comps);
    return product(pis.map(() => [0, 1])).map(bits => Object.fromEntries(pis.map((p, n) => [p, bits[n]])));
}

function detects(comps, pis, target, stuck) {
    const good = simulate(comps, pis), bad = simulate(comps, pis, [target, stuck]);
    return primaryOutputs(comps).some(o => good[o] !== bad[o]);
}

function isTestable(comps, target, stuck) {
    return allVectors(comps).some(v => detects(comps, v, target, stuck));
}

// Wszystkie wektory wejściowe wraz z wartościami linii w D-algebrze dla jednej usterki.
// Pozwala szybko sprawdzić, czy zbiór przypisań (stan z tabeli) da się zrealizować jakimkolwiek wektorem wejściowym.
class Oracle {
    constructor(comps, target, stuck) {
        this.outputs = primaryOutputs(comps);
        this.rows = allVectors(comps).map(v => [v, dSimulate(comps, v, [target, stuck])]);
        this.cache = new Map();
    }

    // Wektory, przy których każda przypisana linia stanu (0/1/D/~D) ma dokładnie tę wartość.
    matching(state) {
        const fixed = Object.entries(state).filter(([, v]) => v in D_PAIRS).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
        const key = JSON.stringify(fixed);
        if (!this.cache.has(key)) this.cache.set(key, this.rows.filter(([, d]) => fixed.every(([k, v]) => d[k] === v)));
        return this.cache.get(key);
    }

    realizable(state, condition = null) {
        return this.matching(state).some(([, d]) => condition === null || condition(d));
    }

    tests() {
        return this.rows.filter(([, d]) => this.outputs.some(o => ['D', '~D'].includes(d[o]))).map(([v]) => v);
    }
}

module.exports = { LOGIC, gateInputs, simulate, dSimulate, dGate, primaryInputs, primaryOutputs, faultCone, allVectors, detects, isTestable, Oracle };
