/**
 * MirPDF Head Quality Check
 * HTML dosyaları üzerinde çalışır — deploy gerekmez
 * Kullanım: node tests/head-quality.js [PUBLIC_DIR]
 */
const fs   = require('fs');
const path = require('path');

const BASE = process.argv[2] || path.join(__dirname, '../public');
let pass = 0, fail = 0, warn = 0;

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory() &&
        !['assets','admin','cms','.well-known'].includes(f)) {
      out.push(...walk(full));
    } else if (f.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

const checks = [
  { name: 'meta description var',  test: c => /name=["']description["']/.test(c),       level: 'warn' },
  { name: 'canonical var',         test: c => /rel=["']canonical["']/.test(c),            level: 'warn' },
  { name: 'og:title var',          test: c => /og:title/.test(c),                          level: 'warn' },
  { name: 'og:url var',            test: c => /og:url/.test(c),                            level: 'warn' },
  { name: 'twitter:card var',      test: c => /twitter:card/.test(c),                      level: 'warn' },
  { name: 'double meta desc yok',  test: c => (c.match(/name=["']description["']/gi)||[]).length <= 1, level: 'fail' },
  { name: 'canonical=og:url',      test: c => {
      const cn = c.match(/rel=["']canonical["'][^>]+href=["']([^"']+)["']/);
      const og = c.match(/og:url[^>]+content=["']([^"']+)["']|content=["']([^"']+)["'][^>]+og:url/);
      if (!cn || !og) return true; // eksik ayrıca işaretlenir
      return (cn[1]||'').replace(/\/$/,'') === ((og[1]||og[2]||'')).replace(/\/$/,'');
  }, level: 'fail' },
];

let issues = [];
for (const file of walk(BASE)) {
  const rel  = file.slice(BASE.length);
  const c    = fs.readFileSync(file, 'utf8');
  // noindex sayfaları warn seviyesinde
  const noindex = /noindex/.test(c);
  for (const chk of checks) {
    if (!chk.test(c)) {
      if (chk.level === 'fail' && !noindex) {
        issues.push({ level: 'FAIL', file: rel, check: chk.name });
        fail++;
      } else {
        issues.push({ level: 'WARN', file: rel, check: chk.name });
        warn++;
      }
    } else {
      pass++;
    }
  }
}

// Yalnızca FAIL ve ilk 20 WARN göster
const toShow = [...issues.filter(i => i.level==='FAIL'), ...issues.filter(i => i.level==='WARN').slice(0,20)];
for (const i of toShow) {
  console.log(`  ${i.level==='FAIL'?'❌':'⚠️ '} ${i.file}: ${i.check}`);
}

console.log(`\nHead kalite: ✅ ${pass} pass | ⚠️  ${warn} warn | ❌ ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
