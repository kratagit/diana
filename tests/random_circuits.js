// Generator losowych układów kombinacyjnych do testów (powtarzalny – zależy tylko od ziarna).
//
// Układy mają 2–5 wejść i 3–10 bramek wszystkich typów (rozmiar jak na zajęciach). Rozgałęzienie sygnału
// jest rysowane jak w aplikacji i w programie TESTER: jeden węzeł, z którego wychodzą wszystkie gałęzie.
// Rodzina „bez rekonwergencji” nie ma ścieżek, które rozchodzą się i ponownie spotykają;
// rodzina „z rekonwergencją” zawsze je ma.
const { faultCone, gateInputs } = require('./oracle.js');

const GATES = ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR', 'NOT'];

// Prosty generator liczb pseudolosowych z ziarnem (mulberry32).
function makeRng(seed) {
    let a = seed >>> 0;
    const random = () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return { random, randint: (lo, hi) => lo + Math.floor(random() * (hi - lo + 1)), choice: arr => arr[Math.floor(random() * arr.length)] };
}

function consumers(comps, sig) {
    return Object.keys(comps).filter(cid => gateInputs(comps[cid]).includes(sig));
}

// Czy jakieś rozgałęzienie ma dwie gałęzie, które ponownie się spotykają.
function hasReconvergence(comps) {
    for (const sig of Object.keys(comps)) {
        const branches = consumers(comps, sig).map(c => faultCone(comps, c));
        for (let i = 0; i < branches.length; i++) {
            for (let j = i + 1; j < branches.length; j++) {
                if ([...branches[i]].some(c => branches[j].has(c))) return true;
            }
        }
    }
    return false;
}

function build(rng) {
    const comps = {}, nodes = {};  // nodes: sygnał -> jego węzeł rozgałęziający
    let n = 0;
    const add = (ctype, ins) => {
        const cid = ({ IN: 'X', NODE: 'W' }[ctype] || 'G') + ++n;
        comps[cid] = { id: cid, type: ctype, x: 0, y: 0, inputs: [...ins, null, null].slice(0, 2), waypoints: [[], []] };
        return cid;
    };
    // Drugie i kolejne podłączenie do sygnału idzie przez jeden wspólny węzeł.
    const connect = src => {
        if (src in nodes) return nodes[src];
        const users = consumers(comps, src);
        if (!users.length) return src;
        const node = nodes[src] = add('NODE', [src]);
        for (const u of users) comps[u].inputs = comps[u].inputs.map(i => i === src ? node : i);
        return node;
    };

    const signals = Array.from({ length: rng.randint(2, 5) }, () => add('IN', []));
    for (let k = rng.randint(3, 10); k > 0; k--) {
        const gtype = rng.choice(GATES);
        const unused = signals.filter(s => !consumers(comps, s).length);
        const first = rng.choice(unused.length && rng.random() < 0.7 ? unused : signals);
        let ins;
        if (gtype === 'NOT') {
            ins = [connect(first)];
        } else {
            const second = rng.choice(signals.filter(s => s !== first));
            ins = [connect(first), connect(second)];
            if (rng.random() < 0.5) ins.reverse();
        }
        signals.push(add(gtype, ins));
    }
    if (signals.some(s => comps[s].type === 'IN' && !consumers(comps, s).length)) return null;
    return comps;
}

function randomCircuit(seed, reconvergent) {
    const rng = makeRng(seed);
    for (;;) {
        const comps = build(rng);
        if (comps && hasReconvergence(comps) === reconvergent) return comps;
    }
}

module.exports = { randomCircuit, hasReconvergence };
