import { describe, expect, it } from "vitest";
import { BufferAttribute, BufferGeometry } from "three";
import {
  detectMeshImportFormat,
  integrateImportedMesh,
  normalizeMeshImport,
  suggestImportDefaults,
} from "../runtime/meshImport";

describe("Mesh import normalization", () => {
  it("detects file formats deterministically", () => {
    expect(detectMeshImportFormat("Character.FBX")).toBe("fbx");
    expect(detectMeshImportFormat("character.glb")).toBe("glb");
    expect(detectMeshImportFormat("character.obj")).toBe("obj");
    expect(detectMeshImportFormat("character.abc")).toBe("unknown");
  });

  it("normalizes supported FBX files into deterministic mesh ids", () => {
    const file = { name: "HeroMesh.fbx", size: 1024, type: "application/octet-stream" };
    const a = normalizeMeshImport(file, "blob:mesh-a", { importedAtUtc: "2026-03-02T00:00:00Z" });
    const b = normalizeMeshImport(file, "blob:mesh-b", { importedAtUtc: "2026-03-02T00:00:00Z" });

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.mesh.id).toBe(b.mesh.id);
    expect(a.mesh.format).toBe("fbx");
  });

  it("normalizes supported GLB files into deterministic mesh ids", () => {
    const file = { name: "HeroMesh.glb", size: 1024, type: "model/gltf-binary" };
    const a = normalizeMeshImport(file, "blob:mesh-a", { importedAtUtc: "2026-03-02T00:00:00Z" });
    const b = normalizeMeshImport(file, "blob:mesh-b", { importedAtUtc: "2026-03-02T00:00:00Z" });

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.mesh.id).toBe(b.mesh.id);
    expect(a.mesh.format).toBe("glb");
  });

  it("returns explicit unsupported errors for unsupported formats", () => {
    const file = { name: "HeroMesh.abc", size: 1024, type: "application/octet-stream" };
    const result = normalizeMeshImport(file, "blob:mesh");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("unsupported_format");
    expect(result.message.toLowerCase()).toContain("supported: fbx, glb");
  });

  it("integrates imported meshes in deterministic sorted order", () => {
    const existing = [
      {
        id: "mesh_zeta",
        format: "fbx" as const,
        displayName: "zeta.fbx",
        sourceUri: "blob:zeta",
        importedAtUtc: "2026-03-02T00:00:00Z",
      },
    ];
    const next = {
      id: "mesh_alpha",
      format: "fbx" as const,
      displayName: "alpha.fbx",
      sourceUri: "blob:alpha",
      importedAtUtc: "2026-03-02T00:00:00Z",
    };
    const integrated = integrateImportedMesh(existing, next);
    expect(integrated.map((mesh) => mesh.id)).toEqual(["mesh_alpha", "mesh_zeta"]);
  });
});

describe("suggestImportDefaults", () => {
  function makeGeometry(positions: number[]): BufferGeometry {
    const geom = new BufferGeometry();
    geom.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    return geom;
  }

  it("suggests scale 0.01 when bounding box is gigantic (max dim > 100)", () => {
    const geom = makeGeometry([0, 0, 0, 200, 0, 0, 0, 150, 0]);
    const result = suggestImportDefaults(geom);
    expect(result.importScale).toBe(0.01);
    expect(result.upAxis).toBe("Y");
  });

  it("suggests scale 100 when bounding box is tiny (max dim < 0.01)", () => {
    const geom = makeGeometry([0, 0, 0, 0.005, 0, 0, 0, 0.005, 0]);
    const result = suggestImportDefaults(geom);
    expect(result.importScale).toBe(100);
    expect(result.upAxis).toBe("Y");
  });

  it("keeps scale 1 and Y up for normal-sized mesh", () => {
    const geom = makeGeometry([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const result = suggestImportDefaults(geom);
    expect(result.importScale).toBe(1);
    expect(result.upAxis).toBe("Y");
  });

  it("suggests Z up when Z is the largest extent (e.g. Z-up character)", () => {
    const geom = makeGeometry([0, -5, 0, 0, -5, 100, 0, 0, 50]);
    const result = suggestImportDefaults(geom);
    expect(result.upAxis).toBe("Z");
  });

  it("keeps Y up when Y is the largest extent", () => {
    const geom = makeGeometry([0, 0, 0, 0, 100, 0, 1, 50, 1]);
    const result = suggestImportDefaults(geom);
    expect(result.upAxis).toBe("Y");
  });
});
