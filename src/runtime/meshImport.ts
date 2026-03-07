import { BufferGeometry, Mesh, Object3D, SkinnedMesh } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ImportedMeshDocument, ImportedMeshFormat } from "./scenePersistence";

const GIGANTIC_THRESHOLD = 100;
const TINY_THRESHOLD = 0.01;

export type MeshImportErrorCode = "unsupported_format" | "invalid_file";

export type MeshImportResult =
  | {
      ok: true;
      mesh: ImportedMeshDocument;
    }
  | {
      ok: false;
      code: MeshImportErrorCode;
      message: string;
    };

type FileLike = {
  name: string;
  size: number;
  type?: string;
};

function nowUtcIso(): string {
  return new Date().toISOString();
}

function sanitizeName(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const sanitized = trimmed
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return sanitized.length > 0 ? sanitized : "mesh";
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function splitExtension(fileName: string): { baseName: string; extension: string } {
  const trimmed = fileName.trim();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === trimmed.length - 1) {
    return {
      baseName: trimmed.length > 0 ? trimmed : "mesh",
      extension: "",
    };
  }
  return {
    baseName: trimmed.slice(0, lastDot),
    extension: trimmed.slice(lastDot + 1).toLowerCase(),
  };
}

export function detectMeshImportFormat(fileName: string): ImportedMeshFormat {
  const { extension } = splitExtension(fileName);
  if (extension === "fbx") return "fbx";
  if (extension === "glb" || extension === "gltf") return "glb";
  if (extension === "obj") return "obj";
  return "unknown";
}

function withUniqueId(candidateId: string, existingIds: ReadonlySet<string>): string {
  if (!existingIds.has(candidateId)) return candidateId;
  let attempt = 2;
  while (true) {
    const nextId = `${candidateId}_${attempt}`;
    if (!existingIds.has(nextId)) return nextId;
    attempt += 1;
  }
}

export function normalizeMeshImport(file: FileLike, sourceUri: string, options?: { existingIds?: ReadonlySet<string>; importedAtUtc?: string }): MeshImportResult {
  if (typeof file.name !== "string" || file.name.trim().length === 0) {
    return {
      ok: false,
      code: "invalid_file",
      message: "Mesh import failed: file name is required.",
    };
  }
  if (!Number.isFinite(file.size) || file.size < 0) {
    return {
      ok: false,
      code: "invalid_file",
      message: "Mesh import failed: file size is invalid.",
    };
  }

  const format = detectMeshImportFormat(file.name);
  if (format !== "fbx" && format !== "glb") {
    return {
      ok: false,
      code: "unsupported_format",
      message: `Mesh import failed: format "${format}" is not implemented. Supported: fbx, glb.`,
    };
  }

  const { baseName } = splitExtension(file.name);
  const stableHash = fnv1a32(`${file.name.toLowerCase()}|${file.size}|${file.type ?? ""}|${format}`);
  const baseId = `mesh_${sanitizeName(baseName)}_${stableHash}`;
  const id = withUniqueId(baseId, options?.existingIds ?? new Set<string>());
  const importedAtUtc = options?.importedAtUtc ?? nowUtcIso();

  return {
    ok: true,
    mesh: {
      id,
      format,
      displayName: file.name,
      sourceUri,
      importedAtUtc,
    },
  };
}

export function integrateImportedMesh(existing: ImportedMeshDocument[], next: ImportedMeshDocument): ImportedMeshDocument[] {
  const alreadyPresent = existing.find((mesh) => mesh.id === next.id && mesh.sourceUri === next.sourceUri);
  if (alreadyPresent !== undefined) return existing.slice().sort((lhs, rhs) => lhs.id.localeCompare(rhs.id));
  return [...existing, next].sort((lhs, rhs) => lhs.id.localeCompare(rhs.id));
}

/** Extract the main mesh geometry from a loaded FBX/GLTF scene (same logic as viewer). */
function extractGeometryFromScene(scene: Object3D): BufferGeometry | null {
  type Candidate = { geometry: BufferGeometry; vertexCount: number };
  const candidates: Candidate[] = [];
  scene.traverse((object) => {
    const skinned = (object as SkinnedMesh).isSkinnedMesh ? (object as SkinnedMesh) : null;
    const mesh = (object as Mesh).isMesh ? (object as Mesh) : null;
    const m = skinned ?? mesh;
    if (m === null) return;
    const geom = m.geometry;
    if (geom === undefined) return;
    const pos = geom.getAttribute("position");
    const vertexCount = pos !== undefined ? pos.count : 0;
    if (vertexCount === 0) return;
    candidates.push({ geometry: geom.clone(), vertexCount });
  });
  if (candidates.length === 0) return null;
  const best = candidates.reduce((a, b) => (a.vertexCount >= b.vertexCount ? a : b));
  return best.geometry;
}

export type SuggestImportDefaultsResult = {
  importScale: number;
  upAxis: "Y" | "Z";
};

/** Suggest importScale and upAxis from geometry bounding box (gigantic → 0.01, tiny → 100, Z-dominant → Z-up). */
export function suggestImportDefaults(geometry: BufferGeometry): SuggestImportDefaultsResult {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) return { importScale: 1, upAxis: "Y" };
  const min = box.min;
  const max = box.max;
  const extentX = max.x - min.x;
  const extentY = max.y - min.y;
  const extentZ = max.z - min.z;
  const maxDim = Math.max(extentX, extentY, extentZ);

  let importScale = 1;
  if (maxDim > GIGANTIC_THRESHOLD) importScale = 0.01;
  else if (maxDim < TINY_THRESHOLD) importScale = 100;

  let upAxis: "Y" | "Z" = "Y";
  if (extentZ >= extentX && extentZ >= extentY) upAxis = "Z";

  return { importScale, upAxis };
}

/** Load mesh from URL and return its main geometry for inspection (bbox-based defaults). */
export async function loadMeshGeometryForInspection(
  uri: string,
  format: "fbx" | "glb",
): Promise<BufferGeometry | null> {
  if (format === "fbx") {
    const loader = new FBXLoader();
    const scene = await loader.loadAsync(uri);
    return extractGeometryFromScene(scene);
  }
  const loader = new GLTFLoader();
  const gltf: GLTF = await loader.loadAsync(uri);
  return extractGeometryFromScene(gltf.scene);
}
