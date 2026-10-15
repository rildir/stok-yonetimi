#!/usr/bin/env node
/**
 * Rebuilds the generated e-Belge assets under backend/src/assets/ebelge (WP5). Run after updating
 * the vendored GİB packages (see backend/src/assets/ebelge/vendor/UPDATE-CHECKLIST.md):
 *
 *   node backend/tools/ebelge/build-ebelge-assets.js
 *
 *  1. GİB schematron (UBL-TR_Main_Schematron.xml + includes) -> ISO Schematron XSLT 2.0 pipeline
 *     (abstract expansion, SVRL skeleton, tools/ebelge/iso-schematron, MIT) -> SaxonJS SEF
 *     (vendor/schematron/ubltr-schematron.sef.json). The includes are resolved here because
 *     iso_dsdl_include.xsl overflows the SaxonJS stack on the 160 KB GİB schema.
 *  2. Display template: tools/ebelge/edocument.src.xslt + GİB emblem -> xslt/edocument.xslt and its SEF.
 *  3. MANIFEST.json: SHA-256 of every vendored and generated file (checked by a unit test).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../../..');
const assets = path.join(root, 'backend/src/assets/ebelge');
const vendor = path.join(assets, 'vendor');
const xslt3 = path.join(root, 'node_modules/xslt3/xslt3.js');
const iso = path.join(__dirname, 'iso-schematron');

function run(args, cwd) {
  const r = spawnSync(process.execPath, [xslt3, ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`xslt3 ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
}

function pattern(file, id) {
  const s = fs.readFileSync(file, 'utf8');
  const start = s.search(new RegExp(`<sch:pattern[^>]*id="${id}"`));
  if (start < 0) throw new Error(`pattern ${id} not found in ${file}`);
  const end = s.indexOf('</sch:pattern>', start) + '</sch:pattern>'.length;
  return s.slice(start, end);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ebelge-'));
try {
  // 1. Schematron
  const sch = path.join(vendor, 'schematron');
  let main = fs.readFileSync(path.join(sch, 'UBL-TR_Main_Schematron.xml'), 'utf8');
  main = main
    .replace('<sch:include href="UBL-TR_Codelist.xml#codes"/>', () => pattern(path.join(sch, 'UBL-TR_Codelist.xml'), 'codes'))
    .replace('<sch:include href="UBL-TR_Common_Schematron.xml#abstracts"/>', () => pattern(path.join(sch, 'UBL-TR_Common_Schematron.xml'), 'abstracts'));
  if (main.includes('sch:include')) throw new Error('unresolved sch:include');
  fs.writeFileSync(path.join(tmp, 'step1.sch'), main);
  for (const f of fs.readdirSync(iso)) fs.copyFileSync(path.join(iso, f), path.join(tmp, f));
  run(['-xsl:iso_abstract_expand.xsl', '-s:step1.sch', '-o:step2.sch'], tmp);
  run(['-xsl:iso_svrl_for_xslt2.xsl', '-s:step2.sch', '-o:ubltr.xsl'], tmp);
  run(['-xsl:ubltr.xsl', `-export:${path.join(sch, 'ubltr-schematron.sef.json')}`, '-nogo', '-relocate:on'], tmp);

  // 2. Display template
  const emblem = fs.readFileSync(path.join(vendor, 'gib-amblem.jpg')).toString('base64');
  const src = fs.readFileSync(path.join(__dirname, 'edocument.src.xslt'), 'utf8').replace('__GIB_EMBLEM__', emblem);
  fs.mkdirSync(path.join(assets, 'xslt'), { recursive: true });
  fs.writeFileSync(path.join(assets, 'xslt/edocument.xslt'), src);
  run([`-xsl:${path.join(assets, 'xslt/edocument.xslt')}`, `-export:${path.join(assets, 'xslt/edocument.sef.json')}`, '-nogo', '-relocate:on'], tmp);

  // 3. Manifest
  const files = {};
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (!f.endsWith('MANIFEST.json')) files[path.relative(assets, p).split(path.sep).join('/')] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    }
  };
  walk(assets);
  const history = fs.readFileSync(path.join(sch, 'History.txt'), 'utf8');
  const versions = [...history.matchAll(/^(\d{8})\s*$/gm)].map((m) => m[1]);
  const manifest = {
    ublTrPackage: '1.2.1',
    schematronVersion: versions[versions.length - 1] || null,
    codeListGuide: 'UBL-TR Kod Listeleri V 1.43',
    sources: {
      'vendor/ubltr-1.2.1': 'https://ebelge.gib.gov.tr/dosyalar/kilavuzlar/UBL-TR1.2.1_Paketi.zip',
      'vendor/schematron': 'https://ebelge.gib.gov.tr/dosyalar/kilavuzlar/e-FaturaPaketi.zip (schematron/)',
      'vendor/gib-amblem.jpg': 'UBL-TR 1.2.1 paketi, xml/general.xslt',
    },
    files,
  };
  fs.writeFileSync(path.join(assets, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  // eslint-disable-next-line no-console
  console.log(`e-Belge assets rebuilt (schematron ${manifest.schematronVersion}, ${Object.keys(files).length} files).`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
