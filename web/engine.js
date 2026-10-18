// engine.js
// D-algorytm: pobudzenie źródła błędu -> propagacja błędu -> badanie zgodności stanów.
// Każdy wiersz tabeli to jeden krok metody i pokazuje wartości ustalone w tym kroku. Zgodność sprawdzana jest w D-algebrze.
// Wartości linii: '0', '1', 'D' (zdatny 1 / błędny 0), '~D' (zdatny 0 / błędny 1), 'x' (nieustalona).
// Zwykły skrypt: w oknie aplikacji definiuje globalną klasę DAlgorithmEngine, w Node.js (testy) eksportuje ją przez module.exports.

const D_PAIRS = { '0': [0, 0], '1': [1, 1], 'D': [1, 0], '~D': [0, 1] };
const D_NAMES = { '0,0': '0', '1,1': '1', '1,0': 'D', '0,1': '~D' };
const D_VALUES = ['D', '~D'];
const ANY = ['0', '1', 'D', '~D'];
const LOGIC = {
    AND: b => +b.every(v => v), OR: b => +b.some(v => v),
    NAND: b => 1 - b.every(v => v), NOR: b => 1 - b.some(v => v),
    XOR: b => b.reduce((s, v) => s + v, 0) % 2, XNOR: b => 1 - b.reduce((s, v) => s + v, 0) % 2,
    NOT: b => 1 - b[0], NODE: b => b[0], IN: b => b[0],
};
const NON_CONTROLLING = { AND: '1', NAND: '1', OR: '0', NOR: '0' };

// Iloczyn kartezjański list (jak itertools.product).
function product(lists) {
    return lists.reduce((acc, list) => acc.flatMap(a => list.map(v => [...a, v])), [[]]);
}

// Porównanie kluczy sortowania: liczby albo tablice (porządek leksykograficzny).
function cmp(a, b) {
    if (!Array.isArray(a)) return a - b;
    for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = cmp(a[i], b[i]); if (c) return c; }
    return a.length - b.length;
}

const dEvalCache = new Map();

// Wartość bramki w D-algebrze; 'x' na wejściu może być dowolną z wartości 0, 1, D, ~D.
function dEval(gtype, values) {
    const key = gtype + ':' + values.join(',');
    if (!dEvalCache.has(key)) {
        const results = new Set();
        for (const combo of product(values.map(v => v === 'x' ? ANY : [v]))) {
            const good = LOGIC[gtype](combo.map(v => D_PAIRS[v][0])), bad = LOGIC[gtype](combo.map(v => D_PAIRS[v][1]));
            results.add(D_NAMES[good + ',' + bad]);
            if (results.size > 1) break;
        }
        dEvalCache.set(key, results.size > 1 ? 'x' : [...results][0]);
    }
    return dEvalCache.get(key);
}

class DAlgorithmEngine {
    constructor(components, targetNode, faultType, userChoices) {
        this.components = components;
        this.target = targetNode;
        this.faultType = faultType;
        this.userChoices = userChoices || {};
        this.decisionLog = [];
        this.state = {};
        this.steps = [];
        this.cols = [];
    }

    resolveName(cid) {
        let c = this.components[cid];
        while (c && c.type === 'NODE') { cid = c.inputs[0]; c = this.components[cid]; }
        return cid;
    }

    pins(cid) {
        const c = this.components[cid];
        return ['NOT', 'NODE'].includes(c.type) ? c.inputs.slice(0, 1) : c.inputs;
    }

    evalValues(gtype, values) { return dEval(gtype, values); }

    evalLine(cid) { return this.evalValues(this.components[cid].type, this.pins(cid).map(i => i ? this.state[i] : 'x')); }

    assignState(k, v, delta) {
        const cur = this.state[k];
        if (cur === v) return false;
        if (cur !== 'x' && cur != null && v !== 'x' && v != null) return true;
        this.state[k] = v;
        if (delta) delta[k] = v;
        let conflict = false;
        const c = this.components[k];
        if (c && c.type === 'NODE' && c.inputs[0] && this.assignState(c.inputs[0], v, delta)) conflict = true;
        for (const [cid, comp] of Object.entries(this.components)) {
            if (comp.type === 'NODE' && comp.inputs[0] === k && this.assignState(cid, v, delta)) conflict = true;
        }
        return conflict;
    }

    // Minimalne przypisania nieustalonych wejść bramki cid, przy których daje ona val.
    // Dla linii 0/1 to pierwotne sześciany z materiałów (Tabela 5); linia, do której może dotrzeć błąd,
    // może dodatkowo przyjąć D lub ~D (np. XOR(D, ~D) = 1). Wymaganie na węźle dotyczy jego źródła,
    // a dwa wejścia z tej samej linii dostają tę samą wartość.
    requirementOptions(cid, val) {
        const lines = this.pins(cid).map(p => p ? this.resolveName(p) : null);
        const col = l => this.cols.indexOf(l);
        const free = [...new Set(lines.filter(l => l && this.state[l] === 'x'))].sort((a, b) => col(a) - col(b));
        const found = [];
        for (const combo of product(free.map(l => ['x', '0', '1', ...(this.cone.has(l) ? D_VALUES : [])]))) {
            const chosen = Object.fromEntries(free.map((l, n) => [l, combo[n]]));
            const values = lines.map(l => l ? (l in chosen ? chosen[l] : this.state[l]) : 'x');
            if (this.evalValues(this.components[cid].type, values) === val) {
                found.push(Object.fromEntries(Object.entries(chosen).filter(([, v]) => v !== 'x')));
            }
        }
        const within = (o, f) => Object.entries(o).every(([k, v]) => f[k] === v);
        const minimal = found.filter(f => !found.some(o => o !== f && within(o, f) && Object.keys(o).length < Object.keys(f).length));
        const key = f => [Object.values(f).filter(v => D_VALUES.includes(v)).length, Object.keys(f).length, Object.keys(f).map(col)];
        return minimal.sort((a, b) => cmp(key(a), key(b)));
    }

    // Ustalone wejścia bramki, od których zależy jej obecna wartość (pozostałe mogą być dowolne).
    neededInputs(cid) {
        const lines = this.pins(cid).filter(p => p).map(p => this.resolveName(p));
        const unique = [...new Set(lines)], free = new Set();
        for (const l of unique) {
            const values = lines.map(m => m === l || free.has(m) ? 'x' : this.state[m]);
            if (this.evalValues(this.components[cid].type, values) === this.state[cid]) free.add(l);
        }
        return Object.fromEntries(unique.filter(l => !free.has(l) && this.state[l] !== 'x').map(l => [l, this.state[l]]));
    }

    makeDecision(id, title, options) {
        if (options.length <= 1) return 0;
        let selected = this.userChoices[id] ?? 0;
        if (!(Number.isInteger(selected) && selected >= 0 && selected < options.length)) selected = 0;
        this.decisionLog.push({ id, title, options, selected });
        return selected;
    }

    addStep(msg, delta = {}, full = false) {
        this.steps.push({ s: { ...this.state }, delta, msg, full });
    }

    conflictStep(msg, line, delta = {}) {
        this.addStep(msg, { ...delta, [line]: 'ERR' });
    }

    // Wiersz „Wybór ścieżki propagacji” zaraz po pobudzeniu – bramki wybrane w „Wybierz drogę”, po kolei.
    insertPathRow(at, path) {
        if (path.length) {
            this.steps.splice(at, 0, { s: { ...this.steps[at - 1].s }, delta: {}, msg: `Wybór ścieżki propagacji (${path.join(', ')})`, full: false });
        }
    }

    requirementsLabel(needed, empty) {
        return Object.entries(needed).map(([k, v]) => `${k}=${v}`).join(', ') || empty;
    }

    apply(needed, delta) {
        for (const [k, v] of Object.entries(needed)) this.assignState(k, v, delta);
    }

    sortKey(k) {
        const t = this.components[k].type;
        return [t === 'IN' ? 0 : (t === 'NODE' ? 2 : 1), parseInt(k.replace(/\D/g, '') || '0', 10)];
    }

    // Stan początkowy: kolumny tabeli, kolejność topologiczna bramek, odbiorcy linii, wyjścia i zasięg błędu.
    prepare() {
        this.cols = Object.keys(this.components).sort((a, b) => cmp(this.sortKey(a), this.sortKey(b)));
        this.state = Object.fromEntries(this.cols.map(c => [c, 'x']));
        this.gates = [];
        const seen = new Set();
        const visit = c => {
            if (seen.has(c)) return;
            seen.add(c);
            for (const i of this.components[c].inputs) if (i in this.components) visit(i);
            if (!['IN', 'NODE'].includes(this.components[c].type)) this.gates.push(c);
        };
        this.cols.forEach(visit);
        this.consumers = Object.fromEntries(this.cols.map(c => [c, this.cols.filter(d => this.pins(d).includes(c))]));
        this.outputs = this.cols.filter(c => !this.consumers[c].length && this.components[c].type !== 'IN');
        this.cone = new Set([this.target]);
        for (let changed = true; changed;) {
            const add = Object.keys(this.components).filter(c => !this.cone.has(c) && this.pins(c).some(i => i && this.cone.has(i)));
            add.forEach(c => this.cone.add(c));
            changed = add.length > 0;
        }
        this.goodTarget = this.faultType === 'sa0' ? '1' : '0';
    }

    run() {
        if (!(this.target in this.components)) return this.result();
        this.prepare();
        this.addStep('Stan początkowy układu', {}, true);

        // 1. Pobudzenie źródła błędu
        const faultSym = this.faultType === 'sa0' ? 'D' : '~D';
        const cubes = this.requirementOptions(this.target, this.goodTarget);
        if (!cubes.length) {
            this.addStep(`BŁĄD: Nie można wysterować ${this.target} na ${this.goodTarget}`);
            return this.result();
        }
        let opts = cubes.map(cb => ({ label: this.requirementsLabel(cb, 'Brak wymagań'), data: cb }));
        const idx = this.makeDecision(`excite_${this.target}`, `Pobudzenie błędu: ${this.target} na ${this.goodTarget}`, opts);
        let delta = {};
        this.assignState(this.target, faultSym, delta);
        this.apply(opts[idx].data, delta);
        this.addStep(`Pobudzenie błędu: ${this.target}. Wymagane: ${opts[idx].label}`, delta);

        // 2. Propagacja błędu: użytkownik wybiera bramkę, do której dotarł błąd (D-granica), jej pozostałe wejścia
        //    dostają wartości nie-kontrolujące. Kilka ścieżek naraz = wybieranie kolejnych bramek przed dojściem do wyjścia.
        const pathAt = this.steps.length, order = [this.target];
        const isD = i => i && D_VALUES.includes(this.state[i]);
        const stop = (msg, line, delta = {}, blocked = null) => {
            this.conflictStep(msg, line, delta);
            this.insertPathRow(pathAt, blocked ? [...order.slice(1), blocked] : order.slice(1));
            return this.result();
        };

        while (!this.outputs.some(o => D_VALUES.includes(this.state[o]))) {
            const reached = new Map();
            for (const g of this.gates) {
                if (this.state[g] === 'x' && this.pins(g).some(isD)) {
                    reached.set(g, Math.max(...this.pins(g).filter(isD).map(i => order.indexOf(this.resolveName(i)))));
                }
            }
            if (!reached.size) {
                return stop('SPRZECZNOŚĆ: błąd nie może dotrzeć do wyjścia – pusta D-granica ' +
                            '(żadna bramka nie ma błędu na wejściu i nieustalonego wyjścia).', this.target);
            }
            // najpierw dalsza droga ostatnią bramką
            const frontier = [...reached.keys()].sort((a, b) => cmp([-reached.get(a), this.sortKey(a)], [-reached.get(b), this.sortKey(b)]));
            opts = frontier.map(g => ({ label: `Przez ${g} (${this.components[g].type})`, data: g }));
            const g = opts[this.makeDecision('branch_' + frontier.join('_'), 'Propagacja błędu. Wybierz drogę:', opts)].data;
            const gtype = this.components[g].type, needed = {};
            delta = {};
            if (this.pins(g).includes(null)) {
                return stop(`SPRZECZNOŚĆ (Blokada propagacji) na ${g}! Wejście bramki nie jest podłączone.`, g, {}, g);
            }
            for (const inp of this.pins(g)) {
                if (this.state[inp] !== 'x') continue;
                if (gtype in NON_CONTROLLING) {
                    needed[this.resolveName(inp)] = NON_CONTROLLING[gtype];
                } else if (['XOR', 'XNOR'].includes(gtype)) {
                    const values = this.pins(g).map(i => this.state[i]);
                    const side = ['0', '1'].map(v => {
                        const out = this.evalValues(gtype, this.pins(g).map((i, n) => i === inp ? v : values[n]));
                        return { label: `${this.resolveName(inp)}=${v} (wypuści ${out})`, data: v };
                    });
                    needed[this.resolveName(inp)] = side[this.makeDecision(`prop_${g}`, `Propagacja błędu przez ${g}`, side)].data;
                }
            }
            this.apply(needed, delta);
            const out = this.evalLine(g);
            if (!D_VALUES.includes(out)) {
                const reason = this.pins(g).every(i => D_VALUES.includes(this.state[i])) ? 'D i ~D znoszą się' :
                               'inne wejście ma wartość, która blokuje błąd';
                return stop(`SPRZECZNOŚĆ (Blokada propagacji) na ${g}! Błąd nie przechodzi (${reason}).`, g, delta, g);
            }
            this.assignState(g, out, delta);
            order.push(g);
            const side = Object.fromEntries(this.pins(g).filter(i => !D_VALUES.includes(this.state[i])).map(i => [this.resolveName(i), this.state[i]]));
            this.addStep(`Propagacja błędu przez ${g} (${gtype}). Wymagane: ${this.requirementsLabel(side, 'Brak')}`, { ...side, ...delta });
        }

        this.insertPathRow(pathAt, order.slice(1));
        this.addStep('Stan po propagacji (Podsumowanie)', {}, true);

        // 3. Badanie zgodności: od wyjść w głąb układu każda ustalona wartość musi wynikać z wejść bramki
        const done = new Set();
        const justify = (cid, val) => {
            const ev = this.evalLine(cid);
            const options = ev === val ? [{}] : (ev === 'x' ? this.requirementOptions(cid, val) : []);
            if (!options.length) {
                const inputs = this.pins(cid).filter(i => i).map(i => `${this.resolveName(i)}=${this.state[i]}`).join(', ');
                this.conflictStep(`SPRZECZNOŚĆ na ${cid}=${val}! Bramka ${this.components[cid].type} ma na wejściach: ` +
                                  `${inputs}. Funkcja logiczna bramki wyklucza taki wynik.`, cid);
                return true;
            }
            const jopts = options.map(o => ({ label: this.requirementsLabel(o, 'Gotowe'), data: o }));
            const jdelta = {};
            this.apply(jopts[this.makeDecision(`just_${cid}`, `Badanie zgodności stanu na ${cid}=${val}`, jopts)].data, jdelta);
            const shown = Object.fromEntries(this.pins(cid).filter(p => p).map(p => [this.resolveName(p), this.state[p]]));  // wszystkie wejścia bramki
            this.addStep(`Badanie zgodności stanu na ${cid}=${val}. Wymagane: ${this.requirementsLabel(this.neededInputs(cid), 'Brak')}`,
                         { ...shown, [cid]: val, ...jdelta });
            return false;
        };
        const check = line => {
            if (!line || done.has(line) || this.state[line] === 'x') return false;
            done.add(line);
            const c = this.components[line], val = this.state[line];
            if (c.type !== 'IN' && line !== this.target && (['0', '1'].includes(val) || this.evalLine(line) !== val)) {
                if (justify(line, val)) return true;
            }
            for (const p of c.type !== 'IN' ? this.pins(line) : []) if (p && check(this.resolveName(p))) return true;
            return false;
        };
        for (const line of [...this.outputs, ...[...this.cols].reverse()]) {  // najpierw od wyjść, potem pozostałe ustalone linie
            if (check(this.resolveName(line))) return this.result();
        }

        this.addStep('TEST (Stan końcowy układu)', {}, true);
        return this.result();
    }

    result() {
        return { cols: this.cols, steps: this.steps, decision_log: this.decisionLog };
    }
}

if (typeof module !== 'undefined') module.exports = { DAlgorithmEngine, dEval };
