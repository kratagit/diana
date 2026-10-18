// Wbudowuje przykładowe układy ([NUMER].json z katalogu głównego) w web/examples.js
//
//   node buduj_przyklady.js
const fs = require('fs');
const path = require('path');

const BASE_DIR = __dirname;
const OUT_FILE = path.join(BASE_DIR, 'web', 'examples.js');

function znajdzPrzyklady(katalog = BASE_DIR) {
    return fs.readdirSync(katalog).filter(p => /^\d+\.json$/.test(p)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

function generujExamplesJs(katalog = BASE_DIR) {
    let out = 'const EXAMPLES = {\n';
    for (const plik of znajdzPrzyklady(katalog)) {
        const tresc = fs.readFileSync(path.join(katalog, plik), 'utf8').replace(/\r\n/g, '\n');
        JSON.parse(tresc);  // walidacja - przerwij, jeśli plik jest uszkodzony
        out += `    ${plik.slice(0, -5)}: ${tresc.trim()},\n`;
    }
    return out + '};\n';
}

function buduj(katalog = BASE_DIR, outFile = OUT_FILE) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, generujExamplesJs(katalog));
    return znajdzPrzyklady(katalog);
}

if (require.main === module) {
    console.log(`Gotowe! Zaktualizowano web/examples.js (${buduj().join(', ')})`);
}

module.exports = { znajdzPrzyklady, generujExamplesJs, buduj };
