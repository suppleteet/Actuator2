import type { Quat, Vec3 } from "../app/types";

export type BakeTransformSample = {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
};

export type BakeActuatorSample = {
  id: string;
  parentId: string | null;
  transform: BakeTransformSample;
};

export type BakeFrame = {
  frame: number;
  timeSec: number;
  transforms: Record<string, BakeTransformSample>;
};

export type BakeCache = {
  cacheId: string;
  fps: number;
  startFrame: number;
  endFrame: number;
  actuatorIds: string[];
  parentById: Record<string, string | null>;
  frames: BakeFrame[];
};

export type BakeCaptureOptions = {
  fps: number;
  startFrame: number;
  endFrame: number;
  actuators: BakeActuatorSample[];
  sampleAtFrame?: (frame: number, timeSec: number) => BakeActuatorSample[];
};

function cloneTransform(transform: BakeTransformSample): BakeTransformSample {
  return {
    position: {
      x: transform.position.x,
      y: transform.position.y,
      z: transform.position.z,
    },
    rotation: {
      x: transform.rotation.x,
      y: transform.rotation.y,
      z: transform.rotation.z,
      w: transform.rotation.w,
    },
    scale: {
      x: transform.scale.x,
      y: transform.scale.y,
      z: transform.scale.z,
    },
  };
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function assertValidBakeOptions(options: BakeCaptureOptions): void {
  if (!Number.isFinite(options.fps) || options.fps <= 0) {
    throw new Error("Bake capture requires fps > 0.");
  }
  if (!Number.isInteger(options.startFrame) || !Number.isInteger(options.endFrame)) {
    throw new Error("Bake capture startFrame/endFrame must be integers.");
  }
  if (options.endFrame < options.startFrame) {
    throw new Error("Bake capture endFrame must be >= startFrame.");
  }
  if (options.actuators.length === 0) {
    throw new Error("Bake capture requires at least one actuator.");
  }
}

export function captureBakeCache(options: BakeCaptureOptions): BakeCache {
  assertValidBakeOptions(options);

  const actuatorIds = [...new Set(options.actuators.map((actuator) => actuator.id))].sort((lhs, rhs) => lhs.localeCompare(rhs));
  const baseById = new Map<string, BakeActuatorSample>();
  for (const actuator of options.actuators) {
    baseById.set(actuator.id, actuator);
  }

  const parentById: Record<string, string | null> = {};
  for (const id of actuatorIds) {
    parentById[id] = baseById.get(id)?.parentId ?? null;
  }

  const frames: BakeFrame[] = [];
  for (let frame = options.startFrame; frame <= options.endFrame; frame += 1) {
    const timeSec = frame / options.fps;
    const sampled = options.sampleAtFrame ? options.sampleAtFrame(frame, timeSec) : options.actuators;
    const sampledById = new Map<string, BakeActuatorSample>();
    for (const actuator of sampled) {
      sampledById.set(actuator.id, actuator);
    }

    const transforms: Record<string, BakeTransformSample> = {};
    for (const id of actuatorIds) {
      const sample = sampledById.get(id) ?? baseById.get(id);
      if (sample === undefined) {
        throw new Error(`Bake capture sample is missing actuator ${id} at frame ${frame}.`);
      }
      transforms[id] = cloneTransform(sample.transform);
    }

    frames.push({
      frame,
      timeSec,
      transforms,
    });
  }

  const cacheSignature = `${options.fps}|${options.startFrame}|${options.endFrame}|${actuatorIds.join(",")}`;
  return {
    cacheId: `bake_${fnv1a32(cacheSignature)}`,
    fps: options.fps,
    startFrame: options.startFrame,
    endFrame: options.endFrame,
    actuatorIds,
    parentById,
    frames,
  };
}

export function stableSerializeBakeCache(cache: BakeCache): string {
  const normalizedFrames = cache.frames
    .slice()
    .sort((lhs, rhs) => lhs.frame - rhs.frame)
    .map((frame) => {
      const sortedIds = Object.keys(frame.transforms).sort((lhs, rhs) => lhs.localeCompare(rhs));
      const transforms: Record<string, BakeTransformSample> = {};
      for (const id of sortedIds) {
        transforms[id] = cloneTransform(frame.transforms[id]);
      }
      return {
        frame: frame.frame,
        timeSec: frame.timeSec,
        transforms,
      };
    });

  const sortedIds = cache.actuatorIds.slice().sort((lhs, rhs) => lhs.localeCompare(rhs));
  const normalizedParentById: Record<string, string | null> = {};
  for (const id of sortedIds) {
    normalizedParentById[id] = cache.parentById[id] ?? null;
  }

  return JSON.stringify(
    {
      cacheId: cache.cacheId,
      fps: cache.fps,
      startFrame: cache.startFrame,
      endFrame: cache.endFrame,
      actuatorIds: sortedIds,
      parentById: normalizedParentById,
      frames: normalizedFrames,
    },
    null,
    2,
  );
}
