import { Euler, Quaternion } from "three";
import type { BakeCache } from "./bakeCache";

export type ExportFormatId = "bvh" | "fbx" | "glb";

export type ExportCapability = {
  format: ExportFormatId;
  label: string;
  status: "implemented" | "unsupported";
  reason?: string;
  extension: string;
};

export type ExportJobRequest = {
  format: ExportFormatId;
  cache: BakeCache;
  sceneId: string;
  fileBaseName?: string;
};

export type ExportJobResult =
  | {
      status: "success";
      format: ExportFormatId;
      fileName: string;
      mimeType: string;
      content: string;
    }
  | {
      status: "unsupported";
      format: ExportFormatId;
      reason: string;
    }
  | {
      status: "failed";
      format: ExportFormatId;
      reason: string;
    };

export type BakeExportAdapter = {
  format: ExportFormatId;
  label: string;
  extension: string;
  mimeType: string;
  exportContent: (cache: BakeCache) => string;
};

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const normalized = Number(value.toFixed(6));
  return normalized.toString();
}

function sanitizeJointName(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized.length > 0 ? sanitized : "joint";
}

function toEulerDegrees(quat: { x: number; y: number; z: number; w: number }): { x: number; y: number; z: number } {
  const q = new Quaternion(quat.x, quat.y, quat.z, quat.w);
  const e = new Euler().setFromQuaternion(q, "XYZ");
  const radToDeg = 180 / Math.PI;
  return {
    x: e.x * radToDeg,
    y: e.y * radToDeg,
    z: e.z * radToDeg,
  };
}

function buildSingleRootParentMap(cache: BakeCache): { rootId: string; parentById: Record<string, string | null> } {
  const sortedIds = cache.actuatorIds.slice().sort((lhs, rhs) => lhs.localeCompare(rhs));
  if (sortedIds.length === 0) {
    throw new Error("Export failed: bake cache has no actuators.");
  }
  const idSet = new Set(sortedIds);
  const rootIds = sortedIds.filter((id) => {
    const parentId = cache.parentById[id];
    return parentId === null || parentId === undefined || !idSet.has(parentId);
  });
  const rootId = (rootIds[0] ?? sortedIds[0]) as string;
  const parentById: Record<string, string | null> = {};
  for (const id of sortedIds) {
    if (id === rootId) {
      parentById[id] = null;
      continue;
    }
    const parentId = cache.parentById[id];
    parentById[id] = parentId !== undefined && parentId !== null && idSet.has(parentId) ? parentId : rootId;
  }
  return {
    rootId,
    parentById,
  };
}

function buildBvhContent(cache: BakeCache): string {
  if (cache.frames.length === 0) {
    throw new Error("Export failed: bake cache has no frames.");
  }

  const firstFrame = cache.frames[0];
  const { rootId, parentById } = buildSingleRootParentMap(cache);
  const childrenByParent = new Map<string, string[]>();
  for (const id of cache.actuatorIds) {
    const parentId = parentById[id];
    if (parentId === null) continue;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(id);
    childrenByParent.set(parentId, children);
  }
  for (const children of childrenByParent.values()) {
    children.sort((lhs, rhs) => lhs.localeCompare(rhs));
  }

  const jointOrder: string[] = [];
  const lines: string[] = ["HIERARCHY"];

  const appendJoint = (jointId: string, depth: number): void => {
    const indent = "  ".repeat(depth);
    const isRoot = depth === 0;
    const keyword = isRoot ? "ROOT" : "JOINT";
    lines.push(`${indent}${keyword} ${sanitizeJointName(jointId)}`);
    lines.push(`${indent}{`);

    const parentId = parentById[jointId];
    const jointTransform = firstFrame.transforms[jointId];
    const parentTransform = parentId === null ? undefined : firstFrame.transforms[parentId];
    if (jointTransform === undefined) {
      throw new Error(`Export failed: missing frame transform for actuator ${jointId}.`);
    }

    const offsetX = parentTransform === undefined ? jointTransform.position.x : jointTransform.position.x - parentTransform.position.x;
    const offsetY = parentTransform === undefined ? jointTransform.position.y : jointTransform.position.y - parentTransform.position.y;
    const offsetZ = parentTransform === undefined ? jointTransform.position.z : jointTransform.position.z - parentTransform.position.z;
    lines.push(`${indent}  OFFSET ${formatNumber(offsetX)} ${formatNumber(offsetY)} ${formatNumber(offsetZ)}`);
    if (isRoot) {
      lines.push(`${indent}  CHANNELS 6 Xposition Yposition Zposition Xrotation Yrotation Zrotation`);
    } else {
      lines.push(`${indent}  CHANNELS 3 Xrotation Yrotation Zrotation`);
    }

    jointOrder.push(jointId);

    const children = childrenByParent.get(jointId) ?? [];
    if (children.length === 0) {
      lines.push(`${indent}  End Site`);
      lines.push(`${indent}  {`);
      lines.push(`${indent}    OFFSET 0 0.1 0`);
      lines.push(`${indent}  }`);
    } else {
      for (const childId of children) {
        appendJoint(childId, depth + 1);
      }
    }
    lines.push(`${indent}}`);
  };

  appendJoint(rootId, 0);

  lines.push("MOTION");
  lines.push(`Frames: ${cache.frames.length}`);
  lines.push(`Frame Time: ${formatNumber(1 / cache.fps)}`);

  for (const frame of cache.frames) {
    const values: string[] = [];
    for (let i = 0; i < jointOrder.length; i += 1) {
      const jointId = jointOrder[i];
      const transform = frame.transforms[jointId];
      if (transform === undefined) {
        throw new Error(`Export failed: missing transform for joint ${jointId} in frame ${frame.frame}.`);
      }
      if (i === 0) {
        values.push(formatNumber(transform.position.x));
        values.push(formatNumber(transform.position.y));
        values.push(formatNumber(transform.position.z));
      }
      const euler = toEulerDegrees(transform.rotation);
      values.push(formatNumber(euler.x));
      values.push(formatNumber(euler.y));
      values.push(formatNumber(euler.z));
    }
    lines.push(values.join(" "));
  }

  return lines.join("\n");
}

const UNSUPPORTED_FORMAT_CAPABILITIES: ExportCapability[] = [
  {
    format: "fbx",
    label: "FBX",
    status: "unsupported",
    reason: "FBX exporter is not implemented in Sprint 07 scaffolding.",
    extension: "fbx",
  },
  {
    format: "glb",
    label: "GLB",
    status: "unsupported",
    reason: "GLB exporter is not implemented in Sprint 07 scaffolding.",
    extension: "glb",
  },
];

export class BakeExportRegistry {
  private readonly adapters = new Map<ExportFormatId, BakeExportAdapter>();

  registerAdapter(adapter: BakeExportAdapter): void {
    this.adapters.set(adapter.format, adapter);
  }

  getCapabilities(): ExportCapability[] {
    const implemented = [...this.adapters.values()]
      .sort((lhs, rhs) => lhs.format.localeCompare(rhs.format))
      .map((adapter) => ({
        format: adapter.format,
        label: adapter.label,
        status: "implemented" as const,
        extension: adapter.extension,
      }));

    const implementedFormats = new Set(implemented.map((capability) => capability.format));
    const unsupported = UNSUPPORTED_FORMAT_CAPABILITIES.filter((capability) => !implementedFormats.has(capability.format));
    return [...implemented, ...unsupported].sort((lhs, rhs) => lhs.format.localeCompare(rhs.format));
  }

  runExportJob(request: ExportJobRequest): ExportJobResult {
    const adapter = this.adapters.get(request.format);
    if (adapter === undefined) {
      const capability = this.getCapabilities().find((entry) => entry.format === request.format);
      return {
        status: "unsupported",
        format: request.format,
        reason: capability?.reason ?? `Format ${request.format} is not supported.`,
      };
    }

    try {
      const content = adapter.exportContent(request.cache);
      const baseName = (request.fileBaseName ?? `${request.sceneId}_${request.cache.cacheId}`)
        .trim()
        .replace(/[^a-zA-Z0-9_.-]/g, "_");
      return {
        status: "success",
        format: request.format,
        fileName: `${baseName}.${adapter.extension}`,
        mimeType: adapter.mimeType,
        content,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown export error.";
      return {
        status: "failed",
        format: request.format,
        reason,
      };
    }
  }
}

export function createDefaultBakeExportRegistry(): BakeExportRegistry {
  const registry = new BakeExportRegistry();
  registry.registerAdapter({
    format: "bvh",
    label: "BVH",
    extension: "bvh",
    mimeType: "application/octet-stream",
    exportContent: (cache) => buildBvhContent(cache),
  });
  return registry;
}
