import type { Vec3 } from "./closestCapsuleBinding";

export type Triangle = [number, number, number];

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function mul(v: Vec3, scalar: number): Vec3 {
  return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function buildVertexNeighbors(vertexCount: number, triangles: Triangle[]): number[][] {
  const neighbors: Array<Set<number>> = Array.from({ length: vertexCount }, () => new Set<number>());

  for (const [a, b, c] of triangles) {
    neighbors[a].add(b);
    neighbors[a].add(c);
    neighbors[b].add(a);
    neighbors[b].add(c);
    neighbors[c].add(a);
    neighbors[c].add(b);
  }

  return neighbors.map((entries) => [...entries].sort((x, y) => x - y));
}

export function applyDeltaMush(
  input: Vec3[],
  neighbors: number[][],
  iterations = 5,
  alpha = 0.5,
): Vec3[] {
  let current = input.map((value) => ({ ...value }));
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  const loopCount = Math.max(0, Math.floor(iterations));

  for (let iteration = 0; iteration < loopCount; iteration += 1) {
    const next = current.map((value, index) => {
      const adj = neighbors[index];
      if (adj === undefined || adj.length === 0) return { ...value };

      let average = { x: 0, y: 0, z: 0 };
      for (const neighborIndex of adj) {
        average = add(average, current[neighborIndex]);
      }
      average = mul(average, 1 / adj.length);

      return {
        x: value.x + (average.x - value.x) * clampedAlpha,
        y: value.y + (average.y - value.y) * clampedAlpha,
        z: value.z + (average.z - value.z) * clampedAlpha,
      };
    });
    current = next;
  }

  return current;
}

export function buildDeltaMushDetailOffsets(
  restPositions: Vec3[],
  neighbors: number[][],
  iterations = 5,
  alpha = 0.5,
): Vec3[] {
  const smoothedRest = applyDeltaMush(restPositions, neighbors, iterations, alpha);
  return restPositions.map((rest, index) => sub(rest, smoothedRest[index] ?? rest));
}

export function applyDeltaMushWithDetailRestore(
  input: Vec3[],
  neighbors: number[][],
  detailOffsets: Vec3[],
  iterations = 5,
  alpha = 0.5,
): Vec3[] {
  const smoothed = applyDeltaMush(input, neighbors, iterations, alpha);
  return smoothed.map((value, index) => add(value, detailOffsets[index] ?? { x: 0, y: 0, z: 0 }));
}
