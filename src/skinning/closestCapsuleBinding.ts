export type Vec3 = { x: number; y: number; z: number };

export type Capsule = {
  id: string;
  start: Vec3;
  end: Vec3;
  radius: number;
};

export type VertexBinding = {
  capsuleId: string;
  axisPoint: Vec3;
  surfacePoint: Vec3;
  distanceToSurface: number;
  weight: number;
};

export type BindOptions = {
  rootCapsuleIds?: string[];
  falloffMultiplier?: number;
};

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function mul(v: Vec3, scalar: number): Vec3 {
  return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(v: Vec3): number {
  return Math.sqrt(dot(v, v));
}

function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (len < 1e-8) return { x: 1, y: 0, z: 0 };
  return mul(v, 1 / len);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function closestPointOnSegment(point: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ab = sub(b, a);
  const abLenSq = dot(ab, ab);
  if (abLenSq < 1e-8) return a;
  const t = clamp01(dot(sub(point, a), ab) / abLenSq);
  return add(a, mul(ab, t));
}

function evaluateCapsuleBinding(vertex: Vec3, capsule: Capsule, falloffMultiplier: number): VertexBinding {
  const axisPoint = closestPointOnSegment(vertex, capsule.start, capsule.end);
  const axisToVertex = sub(vertex, axisPoint);
  const axisDistance = length(axisToVertex);
  const direction = normalize(axisToVertex);
  const surfacePoint = add(axisPoint, mul(direction, capsule.radius));
  const distanceToSurface = Math.max(0, axisDistance - capsule.radius);
  const weight = clamp01(1 - distanceToSurface / Math.max(capsule.radius * falloffMultiplier, 1e-5));

  return {
    capsuleId: capsule.id,
    axisPoint,
    surfacePoint,
    distanceToSurface,
    weight,
  };
}

export function bindVerticesToClosestCapsule(vertices: Vec3[], capsules: Capsule[], options?: BindOptions): VertexBinding[] {
  if (capsules.length === 0) return [];
  const falloffMultiplier = Math.max(options?.falloffMultiplier ?? 2, 0.0001);
  const rootIds = new Set(options?.rootCapsuleIds ?? []);
  const rootCapsules =
    rootIds.size === 0
      ? []
      : capsules.filter((capsule) => rootIds.has(capsule.id));

  return vertices.map((vertex) => {
    let best: VertexBinding | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestWithinFalloff: VertexBinding | null = null;
    let bestWithinFalloffDistance = Number.POSITIVE_INFINITY;

    for (const capsule of capsules) {
      const candidate = evaluateCapsuleBinding(vertex, capsule, falloffMultiplier);
      if (candidate.distanceToSurface < bestDistance) {
        bestDistance = candidate.distanceToSurface;
        best = candidate;
      }
      if (candidate.weight > 0 && candidate.distanceToSurface < bestWithinFalloffDistance) {
        bestWithinFalloffDistance = candidate.distanceToSurface;
        bestWithinFalloff = candidate;
      }
    }

    if (bestWithinFalloff !== null) {
      return bestWithinFalloff;
    }

    if (rootCapsules.length > 0) {
      let bestRoot: VertexBinding | null = null;
      let bestRootDistance = Number.POSITIVE_INFINITY;
      for (const root of rootCapsules) {
        const rootCandidate = evaluateCapsuleBinding(vertex, root, falloffMultiplier);
        if (rootCandidate.distanceToSurface < bestRootDistance) {
          bestRootDistance = rootCandidate.distanceToSurface;
          bestRoot = rootCandidate;
        }
      }
      if (bestRoot !== null) {
        return {
          ...bestRoot,
          weight: 1,
        };
      }
    }

    return best!;
  });
}
