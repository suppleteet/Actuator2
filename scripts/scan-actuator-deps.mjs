#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const source = process.argv[2] || 'c:/Projects/Actuator';
const rootRel = 'Assets/Actuator';
const sourceRoot = path.resolve(source);
const assetsRoot = path.join(sourceRoot, 'Assets');
const rootAbs = path.join(sourceRoot, rootRel);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else out.push(f);
  }
  return out;
}

function rel(p) { return p.split(path.sep).join('/').replace(sourceRoot.split(path.sep).join('/') + '/', ''); }

const allFiles = walk(assetsRoot);
const allMetas = allFiles.filter((f) => f.endsWith('.meta'));
const guidToAsset = new Map();

for (const meta of allMetas) {
  const text = fs.readFileSync(meta, 'utf8');
  const m = text.match(/^guid:\s*([0-9a-f]{32})\s*$/m);
  if (!m) continue;
  const asset = meta.slice(0, -5);
  guidToAsset.set(m[1], asset);
}

const refFileExts = new Set(['.unity', '.prefab', '.asset', '.mat', '.controller']);
const rootFiles = walk(rootAbs).filter((f) => refFileExts.has(path.extname(f).toLowerCase()));
const guidRegex = /guid:\s*([0-9a-f]{32})/g;
const extRefs = new Map();

for (const f of rootFiles) {
  const text = fs.readFileSync(f, 'utf8');
  const seen = new Set();
  let m;
  while ((m = guidRegex.exec(text))) seen.add(m[1]);
  for (const g of seen) {
    const tgt = guidToAsset.get(g);
    if (!tgt) continue;
    const rr = rel(tgt);
    if (!rr.startsWith(rootRel + '/')) {
      if (!extRefs.has(rr)) extRefs.set(rr, []);
      extRefs.get(rr).push(rel(f));
    }
  }
}

const scriptFiles = walk(path.join(rootAbs, 'Scripts')).filter((f) => f.endsWith('.cs'));
const usingRegex = /^using\s+([A-Za-z0-9_.]+)\s*;/gm;
const resourcesRegex = /Resources\.Load(?:<[^>]+>)?\(\s*"([^"]+)"/g;
const namespaces = new Set();
const resourceLoads = new Map();
for (const sf of scriptFiles) {
  const t = fs.readFileSync(sf, 'utf8');
  let m;
  while ((m = usingRegex.exec(t))) namespaces.add(m[1]);
  while ((m = resourcesRegex.exec(t))) {
    const p = m[1];
    if (!resourceLoads.has(p)) resourceLoads.set(p, []);
    resourceLoads.get(p).push(rel(sf));
  }
}

const externalNamespaces = [...namespaces].filter((n) => !n.startsWith('System') && !n.startsWith('UnityEngine') && !n.startsWith('UnityEditor') && !n.startsWith('Actuator')).sort();

const resourcesDirs = walk(assetsRoot).filter((f) => fs.statSync(f).isDirectory);

function findResourceMatches(loadPath) {
  const matches = [];
  for (const f of allFiles) {
    const norm = rel(f);
    const idx = norm.indexOf('/Resources/');
    if (idx === -1) continue;
    const sub = norm.slice(idx + '/Resources/'.length + 1);
    const noExt = sub.replace(/\.[^/.]+$/, '');
    if (noExt === loadPath || noExt.startsWith(loadPath + '/')) matches.push(norm);
  }
  return matches;
}

const resourceResolution = [];
for (const [loadPath, callers] of [...resourceLoads.entries()].sort((a,b)=>a[0].localeCompare(b[0]))) {
  resourceResolution.push({
    loadPath,
    callers,
    matches: findResourceMatches(loadPath),
  });
}

const externalByTop = {};
for (const k of extRefs.keys()) {
  const top = k.split('/').slice(0,2).join('/');
  externalByTop[top] = (externalByTop[top] || 0) + 1;
}

const result = {
  sourceRoot: rel(sourceRoot),
  root: rootRel,
  analyzedAtUtc: new Date().toISOString(),
  externalGuidReferencedAssets: [...extRefs.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([asset, from]) => ({asset, referencedBy: [...new Set(from)].sort()})),
  externalGuidReferencedAssetsByTopFolder: Object.entries(externalByTop).sort((a,b)=>b[1]-a[1]).map(([folder, count])=>({folder, count})),
  externalCodeNamespaces: externalNamespaces,
  resourcesLoadPaths: resourceResolution,
};

const out = path.join('c:/Projects/Actuator2/docs/migration/actuator_dependency_scan_30c6ea7.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(out);
console.log(`external assets: ${result.externalGuidReferencedAssets.length}`);
console.log(`external namespaces: ${result.externalCodeNamespaces.join(', ')}`);
