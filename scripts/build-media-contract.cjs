'use strict';
// Deterministically embeds the pure Node-tested contract in the existing
// single-file browser bundle. No new runtime asset paths: v2 patch allowlist
// and previously installed EXEs stay compatible.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', 'media-contract.js'), 'utf8');
const appPath = path.join(root, 'web', 'app.js');
const app = fs.readFileSync(appPath, 'utf8');
const pStart = '/* media-contract:portable:start */';
const pEnd = '/* media-contract:portable:end */';
const bStart = '  /* GENERATED MEDIA CONTRACT START */';
const bEnd = '  /* GENERATED MEDIA CONTRACT END */';
function between(haystack, begin, end) {
  const a = haystack.indexOf(begin), b = haystack.indexOf(end, a + begin.length);
  if (a < 0 || b < 0 || haystack.indexOf(begin, a + 1) >= 0 || haystack.indexOf(end,b + 1) >= 0)
    throw new Error('Missing or duplicate media-contract build markers');
  return {a,b,value:haystack.slice(a + begin.length, b)};
}
const portable = between(source,pStart,pEnd).value.trim();
const payload = [bStart,'  const mediaContract = (() => {',
  ...portable.split('\n').map(line=>'    '+line),
  '    return {MEDIA_RECORD_SCHEMA_VERSION,MEDIA_EVIDENCE_LEVELS,',
  '      mediaContractEvidence,mediaContractDateEvidence,normalizeMediaRecord};',
  '  })();',bEnd].join('\n');
const marked = between(app,bStart,bEnd);
const output = app.slice(0,marked.a) + payload + app.slice(marked.b + bEnd.length);
if (process.argv.includes('--check')) {
  if (output !== app) {
    console.error('web/app.js does not match src/media-contract.js; run node scripts/build-media-contract.cjs');
    process.exitCode=1;
  } else console.log('Media contract bundle matches portable source');
} else {
  fs.writeFileSync(appPath,output);
  console.log('Updated web/app.js from src/media-contract.js');
}
