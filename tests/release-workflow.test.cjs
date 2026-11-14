'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','.github','workflows','release.yml'),'utf8');

test('release workflow requires an intentional new version instead of suggesting an existing tag',()=>{
  assert.match(source,/workflow_dispatch:/);
  assert.match(source,/version:\s*\n\s*description:\s*"NEW unused version/);
  assert.doesNotMatch(source,/default:\s*"2\.0\.1"/);
  assert.match(source,/description:.*\(no v or trailing dot\)/);
});

test('release preflight prevents duplicate tags and old versions before any build',()=>{
  const preflight=source.indexOf('name: Validate new release version before building');
  const build=source.indexOf('name: Build unsigned Windows EXE and versioned UI patch');
  const tests=source.indexOf('name: Run updater security tests');
  assert.ok(preflight>=0&&build>preflight&&tests>preflight,'preflight must precede tests and build');
  assert.match(source,/gh release view "\$TAG"/);
  assert.match(source,/git ls-remote --tags origin/);
  assert.match(source,/sort -V/);
  assert.match(source,/Invalid version/);
  assert.match(source,/already exists/);
});

test('release workflow still publishes the versioned EXE, patch ZIP and checksum after checks',()=>{
  assert.match(source,/GOOS=windows GOARCH=amd64/);
  assert.match(source,/make_patch\.py --version/);
  assert.match(source,/sha256sum \* > SHA256SUMS\.txt/);
  assert.match(source,/gh release create "\$TAG" dist\/\*/);
  assert.match(source,/permissions:\s*\n\s*contents: write/);
});
