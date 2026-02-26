#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = { source: null, out: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--source') {
      args.source = argv[i + 1];
      i += 1;
    } else if (arg === '--out') {
      args.out = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function parseGuid(text) {
  const m = text.match(/^guid:\s*([0-9a-f]{32})\s*$/m);
  return m ? m[1] : null;
}

function parseUnityVersion(projectSettingsDir) {
  const versionFile = path.join(projectSettingsDir, 'ProjectVersion.txt');
  if (!fs.existsSync(versionFile)) return null;
  const text = readText(versionFile);
  const m = text.match(/m_EditorVersion:\s*(.+)/);
  return m ? m[1].trim() : null;
}

function parseScriptGuids(assetFiles) {
  const guidToScript = new Map();
  for (const file of assetFiles) {
    if (!file.endsWith('.cs')) continue;
    const meta = `${file}.meta`;
    if (!fs.existsSync(meta)) continue;
    const guid = parseGuid(readText(meta));
    if (!guid) continue;
    const scriptPath = toPosix(file);
    const scriptName = path.basename(file, '.cs');
    guidToScript.set(guid, { scriptName, scriptPath });
  }
  return guidToScript;
}

function parseYamlScriptRefs(file, guidToScript) {
  const text = readText(file);
  const re = /m_Script:\s*\{fileID:\s*\d+,\s*guid:\s*([0-9a-f]{32}),\s*type:\s*\d+\s*\}/g;
  const matches = [];
  let m = re.exec(text);
  while (m) {
    const guid = m[1];
    const script = guidToScript.get(guid);
    matches.push({
      guid,
      scriptName: script ? script.scriptName : null,
      scriptPath: script ? script.scriptPath : null,
    });
    m = re.exec(text);
  }

  const uniqueByGuid = new Map();
  for (const item of matches) {
    if (!uniqueByGuid.has(item.guid)) uniqueByGuid.set(item.guid, item);
  }

  return {
    scriptCount: matches.length,
    scripts: Array.from(uniqueByGuid.values()).sort((a, b) => {
      const an = a.scriptName || a.guid;
      const bn = b.scriptName || b.guid;
      return an.localeCompare(bn);
    }),
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.source) {
    console.error('Usage: node scripts/extract-unity-inventory.mjs --source <unity-project-path> [--out <json-out>]');
    process.exit(1);
  }

  const sourceRoot = path.resolve(args.source);
  const outFile = path.resolve(args.out || 'docs/migration/unity_inventory.json');

  const assetsDir = path.join(sourceRoot, 'Assets');
  const packagesDir = path.join(sourceRoot, 'Packages');
  const projectSettingsDir = path.join(sourceRoot, 'ProjectSettings');

  if (!fs.existsSync(assetsDir)) {
    console.error(`Assets directory not found: ${assetsDir}`);
    process.exit(1);
  }

  const allFiles = walk(assetsDir);
  const assetFiles = allFiles.filter((f) => !f.endsWith('.meta'));

  const extensionCounts = {};
  for (const file of assetFiles) {
    const ext = path.extname(file).toLowerCase() || '<none>';
    extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
  }

  const topLevelAssetFolders = fs
    .readdirSync(assetsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const guidToScript = parseScriptGuids(assetFiles);

  const sceneFiles = assetFiles.filter((f) => f.endsWith('.unity')).sort();
  const prefabFiles = assetFiles.filter((f) => f.endsWith('.prefab')).sort();

  const sceneSummaries = sceneFiles.map((file) => ({
    path: toPosix(path.relative(sourceRoot, file)),
    ...parseYamlScriptRefs(file, guidToScript),
  }));

  const prefabSummaries = prefabFiles.map((file) => ({
    path: toPosix(path.relative(sourceRoot, file)),
    ...parseYamlScriptRefs(file, guidToScript),
  }));

  const manifestPath = path.join(packagesDir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(readText(manifestPath)) : null;

  const result = {
    generatedAtUtc: new Date().toISOString(),
    sourceRoot: toPosix(sourceRoot),
    unityVersion: parseUnityVersion(projectSettingsDir),
    topLevelAssetFolders,
    counts: {
      totalAssets: assetFiles.length,
      scenes: sceneFiles.length,
      prefabs: prefabFiles.length,
      scripts: assetFiles.filter((f) => f.endsWith('.cs')).length,
      models: assetFiles.filter((f) => f.endsWith('.fbx') || f.endsWith('.obj')).length,
      materials: assetFiles.filter((f) => f.endsWith('.mat')).length,
      textures: assetFiles.filter((f) => ['.png', '.jpg', '.jpeg', '.tga', '.psd', '.bmp'].includes(path.extname(f).toLowerCase())).length,
      animationClips: assetFiles.filter((f) => f.endsWith('.anim')).length,
      controllers: assetFiles.filter((f) => f.endsWith('.controller')).length,
      shaders: assetFiles.filter((f) => f.endsWith('.shader') || f.endsWith('.cginc') || f.endsWith('.compute')).length,
    },
    extensionCounts: Object.fromEntries(Object.entries(extensionCounts).sort((a, b) => b[1] - a[1])),
    packages: manifest?.dependencies || {},
    scenes: sceneSummaries,
    prefabs: prefabSummaries,
    knownScriptsByGuid: Object.fromEntries(Array.from(guidToScript.entries()).sort((a, b) => a[1].scriptName.localeCompare(b[1].scriptName))),
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log(`Inventory written: ${outFile}`);
  console.log(`Scenes: ${result.counts.scenes}, Prefabs: ${result.counts.prefabs}, Scripts: ${result.counts.scripts}`);
}

main();
