import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { BufferGeometry, Euler, LoadingManager, Material, Mesh, MeshStandardMaterial, Object3D, Quaternion, SRGBColorSpace, SkinnedMesh, Texture, TextureLoader, Vector3 } from "three";
import { smoothDampScalar } from "../smoothDamp";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { bindVerticesToClosestCapsule, type Capsule, type Vec3 as SkinVec3 } from "../../skinning/closestCapsuleBinding";
import { applyDeltaMush, buildDeltaMushDetailOffsets, buildVertexNeighbors } from "../../skinning/deltaMush";
import { getActuatorPrimitiveCenter, getActuatorRadius, getCapsuleHalfAxis } from "../../runtime/physicsAuthoring";
import type {
  ActiveMeshSource,
  ActuatorEntity,
  AppMode,
  DeltaMushSettings,
  GizmoMode,
  SkinningComputationStatus,
  SkinningStats,
  Vec3,
} from "../types";

const DEG2RAD = Math.PI / 180;

/** Heuristic: true if bbox suggests Z-up (e.g. character standing along +Z with feet in -Y). */
function isLikelyZUpFromGeometry(geometry: BufferGeometry): boolean {
  const pos = geometry.getAttribute("position");
  if (pos == null || pos.count === 0) return false;
  let xMin = Infinity, yMin = Infinity, zMin = Infinity;
  let xMax = -Infinity, yMax = -Infinity, zMax = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (x < xMin) xMin = x; if (x > xMax) xMax = x;
    if (y < yMin) yMin = y; if (y > yMax) yMax = y;
    if (z < zMin) zMin = z; if (z > zMax) zMax = z;
  }
  const zRange = zMax - zMin;
  const yRange = yMax - yMin;
  if (zRange <= 0 || yRange <= 0) return false;
  const fractionInPositiveZ = (zMax - Math.max(0, zMin)) / zRange;
  const fractionInNegativeY = yMin < 0 ? (Math.min(0, yMax) - yMin) / yRange : 0;
  return fractionInPositiveZ >= 0.9 && fractionInNegativeY >= 0.05;
}

/** Build quat: rotationOffset (euler deg) then upAxis fix (Z→Y = -90° X). */
function meshImportRotationQuat(upAxis: "Y" | "Z", rotationOffset: Vec3): Quaternion {
  const upFix = new Quaternion().setFromEuler(new Euler(upAxis === "Z" ? -90 * DEG2RAD : 0, 0, 0));
  const rot = new Quaternion().setFromEuler(
    new Euler(rotationOffset.x * DEG2RAD, rotationOffset.y * DEG2RAD, rotationOffset.z * DEG2RAD),
  );
  return rot.premultiply(upFix);
}

export type ActiveSkinnedMeshProps = {
  meshSource: ActiveMeshSource;
  actuators: ActuatorEntity[];
  appMode: AppMode;
  gizmoMode: GizmoMode;
  pendingPoseRevision: number | null;
  simulationSamplesRef: MutableRefObject<
    Record<string, { position: SkinVec3; rotation: { x: number; y: number; z: number; w: number } }> | null
  >;
  isTransformDragging: boolean;
  skinningEnabled: boolean;
  skinningRevision: number;
  deltaMushEnabled: boolean;
  deltaMushSettings: DeltaMushSettings;
  onSkinningStats: (stats: SkinningStats) => void;
  onSkinningComputationStatus: (status: SkinningComputationStatus) => void;
  onDrawSurfaceRef?: (meshId: string, object: Object3D | null) => void;
  /** Called when geometry loads and heuristic detects Z-up; app can update mesh document. */
  onUpAxisDetected?: (meshId: string, upAxis: "Z") => void;
};

type RuntimeVertexBinding = {
  capsuleId: string;
  rootCapsuleId: string | null;
  bindWorld: SkinVec3;
  localOffset: SkinVec3;
  rootLocalOffset: SkinVec3;
  rootBindRotation: { x: number; y: number; z: number; w: number };
  /** Bind-time rotation of the influencing capsule; used to rotate delta-mush detail by effective deformation. */
  capsuleBindRotation: { x: number; y: number; z: number; w: number } | null;
  weight: number;
};

/** 1x1 white PNG data URL; use as placeholder when no external texture so useLoader always has a valid URL. */
export const PLACEHOLDER_WHITE_TEX_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

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
  const merged = mergeVertices(best.geometry);
  merged.computeVertexNormals();
  return merged;
}

/** Get first material from mesh (single or array); may be any type (e.g. MeshBasicMaterial with map). */
function getFirstMaterial(mat: unknown): Material | null {
  if (mat instanceof Material) return mat;
  if (Array.isArray(mat) && mat.length > 0 && mat[0] instanceof Material) return mat[0] as Material;
  return null;
}

/** Build MeshStandardMaterial from any material, copying map and other texture props so embedded GLB textures are preserved. */
function toStandardMaterialWithMaps(mat: Material): MeshStandardMaterial {
  if (mat instanceof MeshStandardMaterial) {
    const cloned = mat.clone();
    cloned.map = mat.map;
    cloned.normalMap = mat.normalMap;
    cloned.roughnessMap = mat.roughnessMap;
    cloned.metalnessMap = mat.metalnessMap;
    return cloned;
  }
  const standard = new MeshStandardMaterial({ color: 0xcccccc, roughness: 1, metalness: 0 });
  const anyMat = mat as { map?: Texture | null; normalMap?: Texture | null; roughnessMap?: Texture | null; metalnessMap?: Texture | null; color?: { getHex?: () => number } };
  if (anyMat.map != null) standard.map = anyMat.map;
  if (anyMat.normalMap != null) standard.normalMap = anyMat.normalMap;
  if (anyMat.roughnessMap != null) standard.roughnessMap = anyMat.roughnessMap;
  if (anyMat.metalnessMap != null) standard.metalnessMap = anyMat.metalnessMap;
  if (typeof anyMat.color?.getHex === "function") standard.color.setHex(anyMat.color.getHex());
  return standard;
}

/** Get geometry and material from the same mesh; prefer a mesh whose material has a map (embedded texture). */
function extractGeometryAndMaterialFromGLTF(gltf: GLTF): { geometry: BufferGeometry | null; material: MeshStandardMaterial } {
  type Candidate = { geometry: BufferGeometry; material: MeshStandardMaterial };
  const candidates: Candidate[] = [];
  const defaultMaterial = new MeshStandardMaterial({ color: 0xcccccc, roughness: 1, metalness: 0 });
  gltf.scene.traverse((object) => {
    const mesh = (object as Mesh).isMesh ? (object as Mesh) : null;
    const skinned = (object as SkinnedMesh).isSkinnedMesh ? (object as SkinnedMesh) : null;
    const m = mesh ?? skinned;
    if (m === null) return;
    const geometry = m.geometry.clone() as BufferGeometry;
    const mat = getFirstMaterial(m.material);
    if (mat !== null) {
      const material = toStandardMaterialWithMaps(mat);
      candidates.push({ geometry, material });
    } else {
      candidates.push({ geometry, material: defaultMaterial.clone() });
    }
  });
  const pick = candidates.length === 0 ? null : candidates.find((c) => c.material.map != null) ?? candidates[0];
  if (pick == null) {
    return {
      geometry: null,
      material: new MeshStandardMaterial({ color: 0xcccccc, roughness: 1, metalness: 0 }),
    };
  }
  const merged = mergeVertices(pick.geometry);
  merged.computeVertexNormals();
  return { geometry: merged, material: pick.material };
}

function flipNormalsOnGeometry(geometry: BufferGeometry): void {
  const normals = geometry.getAttribute("normal");
  if (normals == null) return;
  for (let i = 0; i < normals.count; i++) {
    normals.setX(i, -normals.getX(i));
    normals.setY(i, -normals.getY(i));
    normals.setZ(i, -normals.getZ(i));
  }
  normals.needsUpdate = true;
}

/** Dispatches to FBX or GLB implementation based on mesh format. */
export function ActiveSkinnedMesh(props: ActiveSkinnedMeshProps) {
  if (props.meshSource.format === "glb") {
    return <ActiveSkinnedMeshGLB {...props} />;
  }
  return <ActiveSkinnedMeshFBX {...props} />;
}

function ActiveSkinnedMeshFBX({
  meshSource,
  actuators,
  appMode,
  gizmoMode,
  pendingPoseRevision,
  simulationSamplesRef,
  isTransformDragging,
  skinningEnabled,
  skinningRevision,
  deltaMushEnabled,
  deltaMushSettings,
  onSkinningStats,
  onSkinningComputationStatus,
  onDrawSurfaceRef,
  onUpAxisDetected,
}: ActiveSkinnedMeshProps) {
  const meshAsset = useLoader(FBXLoader, meshSource.meshUri);
  const colorMap = useLoader(TextureLoader, meshSource.colorMapUri);
  const normalMap = useLoader(TextureLoader, meshSource.normalMapUri);
  const roughnessMap = useLoader(TextureLoader, meshSource.roughnessMapUri);
  const importScale = meshSource.importScale;
  const positionOffset = meshSource.positionOffset;
  const rotationOffset = meshSource.rotationOffset;
  const upAxis = meshSource.upAxis;
  const materialRef = useRef<MeshStandardMaterial>(null);
  const meshOpacityRef = useRef(1);
  const meshOpacityVelocityRef = useRef(0);

  const combinedRotation = useMemo(
    () => meshImportRotationQuat(upAxis, rotationOffset),
    [upAxis, rotationOffset.x, rotationOffset.y, rotationOffset.z],
  );
  const inverseRotation = useMemo(() => combinedRotation.clone().invert(), [combinedRotation]);
  const scratchWorldRef = useRef(new Vector3());

  const baseGeometry: BufferGeometry | null = useMemo(() => extractGeometryFromScene(meshAsset), [meshAsset]);
  const upAxisDetectedRef = useRef(false);
  useEffect(() => {
    if (baseGeometry == null || meshSource.upAxis !== "Y" || upAxisDetectedRef.current || !onUpAxisDetected) return;
    if (isLikelyZUpFromGeometry(baseGeometry)) {
      upAxisDetectedRef.current = true;
      onUpAxisDetected(meshSource.id, "Z");
    }
  }, [baseGeometry, meshSource.id, meshSource.upAxis, onUpAxisDetected]);

  const displayGeometry: BufferGeometry | null = useMemo(() => {
    const geom = baseGeometry?.clone() ?? null;
    if (geom != null && meshSource.flipNormals) flipNormalsOnGeometry(geom);
    return geom;
  }, [baseGeometry, meshSource.flipNormals]);

  const baseVerticesLocal = useMemo<SkinVec3[]>(() => {
    if (baseGeometry === null) return [];
    const position = baseGeometry.getAttribute("position");
    if (position === undefined) return [];
    const vertices: SkinVec3[] = [];
    for (let i = 0; i < position.count; i += 1) {
      vertices.push({ x: position.getX(i), y: position.getY(i), z: position.getZ(i) });
    }
    return vertices;
  }, [baseGeometry]);

  const triangles = useMemo<Array<[number, number, number]>>(() => {
    if (baseGeometry === null) return [];
    const indices = baseGeometry.getIndex()?.array;
    const built: Array<[number, number, number]> = [];
    if (indices !== undefined) {
      for (let i = 0; i + 2 < indices.length; i += 3) {
        built.push([Number(indices[i]), Number(indices[i + 1]), Number(indices[i + 2])]);
      }
      return built;
    }

    for (let i = 0; i + 2 < baseVerticesLocal.length; i += 3) {
      built.push([i, i + 1, i + 2]);
    }
    return built;
  }, [baseGeometry, baseVerticesLocal.length]);

  const weldData = useMemo(() => {
    const vertexToWelded = new Array<number>(baseVerticesLocal.length);
    const weldedToVertices: number[][] = [];
    const weldedVertices: SkinVec3[] = [];
    const keyToWelded = new Map<string, number>();
    const precision = 10000;

    for (let i = 0; i < baseVerticesLocal.length; i += 1) {
      const vertex = baseVerticesLocal[i];
      const key = `${Math.round(vertex.x * precision)}|${Math.round(vertex.y * precision)}|${Math.round(vertex.z * precision)}`;
      let weldedIndex = keyToWelded.get(key);
      if (weldedIndex === undefined) {
        weldedIndex = weldedVertices.length;
        keyToWelded.set(key, weldedIndex);
        weldedVertices.push(vertex);
        weldedToVertices.push([]);
      }
      vertexToWelded[i] = weldedIndex;
      weldedToVertices[weldedIndex].push(i);
    }

    const weldedTriangles: Array<[number, number, number]> = [];
    for (const [a, b, c] of triangles) {
      const wa = vertexToWelded[a];
      const wb = vertexToWelded[b];
      const wc = vertexToWelded[c];
      if (wa === wb || wb === wc || wa === wc) continue;
      weldedTriangles.push([wa, wb, wc]);
    }

    return {
      vertexToWelded,
      weldedToVertices,
      weldedVertices,
      weldedTriangles,
    };
  }, [baseVerticesLocal, triangles]);

  const weldedNeighbors = useMemo(
    () => buildVertexNeighbors(weldData.weldedVertices.length, weldData.weldedTriangles),
    [weldData],
  );
  const deltaMushDetailOffsets = useMemo(() => {
    const iterations = Math.max(0, Math.floor(deltaMushSettings.iterations));
    const strength = Math.max(0, Math.min(1, deltaMushSettings.strength));
    return buildDeltaMushDetailOffsets(weldData.weldedVertices, weldedNeighbors, iterations, strength);
  }, [deltaMushSettings.iterations, deltaMushSettings.strength, weldData.weldedVertices, weldedNeighbors]);

  const baseVerticesWorld = useMemo(() => {
    const v = new Vector3();
    const out = new Vector3();
    return baseVerticesLocal.map((vertex) => {
      v.set(vertex.x * importScale, vertex.y * importScale, vertex.z * importScale);
      out.copy(v).applyQuaternion(combinedRotation);
      return {
        x: positionOffset.x + out.x,
        y: positionOffset.y + out.y,
        z: positionOffset.z + out.z,
      };
    });
  }, [baseVerticesLocal, importScale, positionOffset.x, positionOffset.y, positionOffset.z, combinedRotation]);

  const meshHash = useMemo(
    () => (baseGeometry === null ? null : `mesh:${baseVerticesLocal.length}:${triangles.length}`),
    [baseGeometry, baseVerticesLocal.length, triangles.length],
  );

  const [runtimeBindings, setRuntimeBindings] = useState<RuntimeVertexBinding[] | null>(null);
  const [bindingsRevision, setBindingsRevision] = useState(0);
  const skinningJobTokenRef = useRef(0);

  useEffect(() => {
    colorMap.colorSpace = SRGBColorSpace;
    colorMap.needsUpdate = true;
  }, [colorMap]);

  useEffect(() => {
    const shouldRunRigCompute = appMode === "Rig" && skinningRevision !== bindingsRevision;
    const shouldRunPoseRecoveryCompute = pendingPoseRevision === null && appMode === "Pose" && skinningEnabled && runtimeBindings === null;

    if (isTransformDragging) {
      skinningJobTokenRef.current += 1;
      onSkinningComputationStatus({
        busy: false,
        revision: skinningRevision,
        completed: false,
        bindingHash: null,
        meshHash,
      });
      return;
    }

    if (!shouldRunRigCompute && !shouldRunPoseRecoveryCompute) {
      skinningJobTokenRef.current += 1;
      onSkinningComputationStatus({
        busy: false,
        revision: skinningRevision,
        completed: false,
        bindingHash: null,
        meshHash,
      });
      return;
    }

    if (baseVerticesWorld.length === 0 || meshHash === null) {
      setRuntimeBindings(null);
      setBindingsRevision(skinningRevision);
      onSkinningStats({ vertexCount: 0, capsuleCount: 0, averageWeight: 0 });
      onSkinningComputationStatus({
        busy: false,
        revision: skinningRevision,
        completed: false,
        bindingHash: null,
        meshHash: null,
      });
      return;
    }

    const revision = skinningRevision;
    const currentToken = skinningJobTokenRef.current + 1;
    skinningJobTokenRef.current = currentToken;
    onSkinningComputationStatus({
      busy: true,
      revision,
      completed: false,
      bindingHash: null,
      meshHash,
    });

    const run = async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (skinningJobTokenRef.current !== currentToken) return;

      const capsules: Capsule[] = actuators
        .filter((actuator) => actuator.shape === "capsule")
        .map((actuator) => {
          const rotation = new Quaternion(
            actuator.transform.rotation.x,
            actuator.transform.rotation.y,
            actuator.transform.rotation.z,
            actuator.transform.rotation.w,
          );
          const halfHeight = getCapsuleHalfAxis(actuator.size);
          const up = new Vector3(0, 1, 0).applyQuaternion(rotation);
          const center = getActuatorPrimitiveCenter(actuator);
          const start = center.clone().addScaledVector(up, -halfHeight);
          const end = center.clone().addScaledVector(up, halfHeight);
          return {
            id: actuator.id,
            start: { x: start.x, y: start.y, z: start.z },
            end: { x: end.x, y: end.y, z: end.z },
            radius: getActuatorRadius(actuator),
          };
        });
      const rootCapsuleIds = actuators
        .filter((actuator) => actuator.parentId === null && actuator.shape === "capsule")
        .map((actuator) => actuator.id);

      if (capsules.length === 0) {
        setRuntimeBindings([]);
        setBindingsRevision(revision);
        onSkinningStats({ vertexCount: baseVerticesWorld.length, capsuleCount: 0, averageWeight: 0 });
        onSkinningComputationStatus({
          busy: false,
          revision,
          completed: true,
          bindingHash: `bind:${revision}:empty`,
          meshHash,
        });
        return;
      }

      const nearest = bindVerticesToClosestCapsule(baseVerticesWorld, capsules, {
        rootCapsuleIds,
        falloffMultiplier: 2,
      });
      if (skinningJobTokenRef.current !== currentToken) return;

      const actuatorById = new Map(
        actuators.map((actuator) => [
          actuator.id,
          {
            rigId: actuator.rigId,
            position: getActuatorPrimitiveCenter(actuator),
            rotation: new Quaternion(
              actuator.transform.rotation.x,
              actuator.transform.rotation.y,
              actuator.transform.rotation.z,
              actuator.transform.rotation.w,
            ),
          },
        ]),
      );
      const rootIdByRig = new Map<string, string>();
      for (const actuator of actuators) {
        if (actuator.parentId !== null || actuator.shape !== "capsule") continue;
        rootIdByRig.set(actuator.rigId, actuator.id);
      }
      const fallbackRootCapsuleId = rootCapsuleIds[0] ?? null;

      const nextBindings: RuntimeVertexBinding[] = nearest.map((binding, index) => {
        const bindWorld = baseVerticesWorld[index];
        const influenceActuator = actuatorById.get(binding.capsuleId);
        const rigScopedRootId =
          influenceActuator === undefined
            ? null
            : (rootIdByRig.get(influenceActuator.rigId) ?? fallbackRootCapsuleId);
        const rootCapsuleId = rigScopedRootId ?? fallbackRootCapsuleId;
        const rootActuator = rootCapsuleId === null ? undefined : actuatorById.get(rootCapsuleId);
        const rootLocalOffset =
          rootActuator === undefined
            ? { x: 0, y: 0, z: 0 }
            : (() => {
                const offset = new Vector3(bindWorld.x, bindWorld.y, bindWorld.z)
                  .sub(rootActuator.position)
                  .applyQuaternion(rootActuator.rotation.clone().invert());
                return { x: offset.x, y: offset.y, z: offset.z };
              })();
        const rootBindRotation =
          rootActuator === undefined
            ? { x: 0, y: 0, z: 0, w: 1 }
            : {
                x: rootActuator.rotation.x,
                y: rootActuator.rotation.y,
                z: rootActuator.rotation.z,
                w: rootActuator.rotation.w,
              };

        if (influenceActuator === undefined) {
          return {
            capsuleId: binding.capsuleId,
            rootCapsuleId,
            bindWorld,
            localOffset: { x: 0, y: 0, z: 0 },
            rootLocalOffset,
            rootBindRotation,
            capsuleBindRotation: null,
            weight: 0,
          };
        }

        const localOffset = new Vector3(bindWorld.x, bindWorld.y, bindWorld.z)
          .sub(influenceActuator.position)
          .applyQuaternion(influenceActuator.rotation.clone().invert());
        const capsuleBindRotation = {
          x: influenceActuator.rotation.x,
          y: influenceActuator.rotation.y,
          z: influenceActuator.rotation.z,
          w: influenceActuator.rotation.w,
        };
        return {
          capsuleId: binding.capsuleId,
          rootCapsuleId,
          bindWorld,
          localOffset: { x: localOffset.x, y: localOffset.y, z: localOffset.z },
          rootLocalOffset,
          rootBindRotation,
          capsuleBindRotation,
          weight: binding.weight,
        };
      });

      const averageWeight = nextBindings.reduce((sum, binding) => sum + binding.weight, 0) / Math.max(nextBindings.length, 1);
      const bindingHash = `bind:${revision}:${nextBindings.length}:${capsules.length}:${averageWeight.toFixed(6)}`;
      setRuntimeBindings(nextBindings);
      setBindingsRevision(revision);
      onSkinningStats({
        vertexCount: baseVerticesWorld.length,
        capsuleCount: capsules.length,
        averageWeight,
      });
      onSkinningComputationStatus({
        busy: false,
        revision,
        completed: true,
        bindingHash,
        meshHash,
      });
    };

    void run();
  }, [
    actuators,
    appMode,
    baseVerticesWorld,
    bindingsRevision,
    isTransformDragging,
    meshHash,
    onSkinningComputationStatus,
    onSkinningStats,
    pendingPoseRevision,
    runtimeBindings,
    skinningEnabled,
    skinningRevision,
  ]);

  useFrame((_, delta) => {
    const targetOpacity = gizmoMode === "draw" ? 1 : 1;
    const damped = smoothDampScalar(meshOpacityRef.current, targetOpacity, meshOpacityVelocityRef.current, 0.18, delta);
    meshOpacityRef.current = damped.value;
    meshOpacityVelocityRef.current = damped.velocity;
    if (materialRef.current !== null) {
      materialRef.current.transparent = false;
      materialRef.current.opacity = meshOpacityRef.current;
    }
    if (displayGeometry === null) return;
    const position = displayGeometry.getAttribute("position");
    if (position === undefined) return;

    const simulationSamples = simulationSamplesRef.current;
    const actuatorById = new Map(
      actuators.map((actuator) => [
        actuator.id,
        (() => {
          const sample = appMode === "Pose" ? simulationSamples?.[actuator.id] : undefined;
          if (sample !== undefined) {
            return {
              position: new Vector3(sample.position.x, sample.position.y, sample.position.z),
              rotation: new Quaternion(sample.rotation.x, sample.rotation.y, sample.rotation.z, sample.rotation.w),
            };
          }
          return {
            position: getActuatorPrimitiveCenter(actuator),
            rotation: new Quaternion(
              actuator.transform.rotation.x,
              actuator.transform.rotation.y,
              actuator.transform.rotation.z,
              actuator.transform.rotation.w,
            ),
          };
        })(),
      ]),
    );

    const shouldDeformInPose =
      skinningEnabled &&
      (appMode === "Pose" || pendingPoseRevision !== null) &&
      runtimeBindings !== null &&
      runtimeBindings.length === baseVerticesLocal.length &&
      bindingsRevision > 0;

    const deformed = baseVerticesLocal.map((bindLocal, index) => {
      if (!shouldDeformInPose) return bindLocal;
      const binding = runtimeBindings[index];
      if (binding === undefined) return bindLocal;

      const actuator = actuatorById.get(binding.capsuleId);
      const rootActuator = binding.rootCapsuleId === null ? undefined : actuatorById.get(binding.rootCapsuleId);
      const bindWorld = new Vector3(binding.bindWorld.x, binding.bindWorld.y, binding.bindWorld.z);
      const rootTransformedWorld =
        rootActuator === undefined
          ? bindWorld.clone()
          : new Vector3(binding.rootLocalOffset.x, binding.rootLocalOffset.y, binding.rootLocalOffset.z)
              .applyQuaternion(rootActuator.rotation)
              .add(rootActuator.position);
      const transformedWorld =
        actuator === undefined
          ? rootTransformedWorld.clone()
          : new Vector3(binding.localOffset.x, binding.localOffset.y, binding.localOffset.z)
              .applyQuaternion(actuator.rotation)
              .add(actuator.position);
      const weight = Math.max(0, Math.min(1, binding.weight));
      const weightedWorld = new Vector3(
        rootTransformedWorld.x + (transformedWorld.x - rootTransformedWorld.x) * weight,
        rootTransformedWorld.y + (transformedWorld.y - rootTransformedWorld.y) * weight,
        rootTransformedWorld.z + (transformedWorld.z - rootTransformedWorld.z) * weight,
      );

      const s = scratchWorldRef.current;
      s.set(
        weightedWorld.x - positionOffset.x,
        weightedWorld.y - positionOffset.y,
        weightedWorld.z - positionOffset.z,
      ).applyQuaternion(inverseRotation);
      return {
        x: s.x / importScale,
        y: s.y / importScale,
        z: s.z / importScale,
      };
    });

    let finalVertices = deformed;
    if (shouldDeformInPose && deltaMushEnabled) {
      const deltaMushIterations = Math.max(0, Math.floor(deltaMushSettings.iterations));
      const deltaMushStrength = Math.max(0, Math.min(1, deltaMushSettings.strength));
      const weldedCurrent = weldData.weldedVertices.map((_, weldedIndex) => {
        const members = weldData.weldedToVertices[weldedIndex] ?? [];
        if (members.length === 0) return { x: 0, y: 0, z: 0 };
        let sx = 0;
        let sy = 0;
        let sz = 0;
        for (const vertexIndex of members) {
          sx += deformed[vertexIndex].x;
          sy += deformed[vertexIndex].y;
          sz += deformed[vertexIndex].z;
        }
        const inv = 1 / members.length;
        return { x: sx * inv, y: sy * inv, z: sz * inv };
      });

      const smoothedWelded = applyDeltaMush(
        weldedCurrent,
        weldedNeighbors,
        deltaMushIterations,
        deltaMushStrength,
      );
      const scratchQuat = new Quaternion();
      const rotatedDetailOffsets = weldData.weldedVertices.map((_, weldedIndex) => {
        const detailOffset = deltaMushDetailOffsets[weldedIndex] ?? { x: 0, y: 0, z: 0 };
        const members = weldData.weldedToVertices[weldedIndex];
        if (members === undefined || members.length === 0) return detailOffset;
        const binding = runtimeBindings[members[0]];
        if (binding === undefined || binding.rootCapsuleId === null) return detailOffset;
        const rootActuator = actuatorById.get(binding.rootCapsuleId);
        if (rootActuator === undefined) return detailOffset;

        const bindRootRotation = new Quaternion(
          binding.rootBindRotation.x,
          binding.rootBindRotation.y,
          binding.rootBindRotation.z,
          binding.rootBindRotation.w,
        ).normalize();
        const rootRotationDelta = rootActuator.rotation.clone().multiply(bindRootRotation.invert()).normalize();
        let effectiveRotation = rootRotationDelta;
        if (
          binding.capsuleBindRotation !== null &&
          binding.weight > 0 &&
          binding.weight < 1
        ) {
          const actuator = actuatorById.get(binding.capsuleId);
          if (actuator !== undefined) {
            const bindCapsuleRotation = new Quaternion(
              binding.capsuleBindRotation.x,
              binding.capsuleBindRotation.y,
              binding.capsuleBindRotation.z,
              binding.capsuleBindRotation.w,
            ).normalize();
            const capsuleRotationDelta = actuator.rotation
              .clone()
              .multiply(bindCapsuleRotation.invert())
              .normalize();
            if (rootRotationDelta.dot(capsuleRotationDelta) < 0) capsuleRotationDelta.negate();
            scratchQuat.slerpQuaternions(rootRotationDelta, capsuleRotationDelta, binding.weight);
            effectiveRotation = scratchQuat;
          }
        } else if (binding.capsuleBindRotation !== null && binding.weight >= 1) {
          const actuator = actuatorById.get(binding.capsuleId);
          if (actuator !== undefined) {
            const bindCapsuleRotation = new Quaternion(
              binding.capsuleBindRotation.x,
              binding.capsuleBindRotation.y,
              binding.capsuleBindRotation.z,
              binding.capsuleBindRotation.w,
            ).normalize();
            effectiveRotation = actuator.rotation.clone().multiply(bindCapsuleRotation.invert()).normalize();
          }
        }
        const rotatedDetail = new Vector3(detailOffset.x, detailOffset.y, detailOffset.z).applyQuaternion(effectiveRotation);
        return { x: rotatedDetail.x, y: rotatedDetail.y, z: rotatedDetail.z };
      });
      const restoredWelded = smoothedWelded.map((value, weldedIndex) => {
        const detail = rotatedDetailOffsets[weldedIndex] ?? { x: 0, y: 0, z: 0 };
        return {
          x: value.x + detail.x,
          y: value.y + detail.y,
          z: value.z + detail.z,
        };
      });
      finalVertices = deformed.map((_, vertexIndex) => {
        const weldedIndex = weldData.vertexToWelded[vertexIndex];
        return restoredWelded[weldedIndex];
      });
    }

    for (let i = 0; i < finalVertices.length; i += 1) {
      position.setXYZ(i, finalVertices[i].x, finalVertices[i].y, finalVertices[i].z);
    }
    position.needsUpdate = true;
    displayGeometry.computeVertexNormals();
  });

  if (displayGeometry === null) return null;

  return (
    <group
      position={[positionOffset.x, positionOffset.y, positionOffset.z]}
      quaternion={combinedRotation}
      scale={[importScale, importScale, importScale]}
    >
      <mesh
        ref={(object) => onDrawSurfaceRef?.(meshSource.id, object)}
        geometry={displayGeometry}
        position={[0, 0, 0]}
        scale={[1, 1, 1]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial ref={materialRef} map={colorMap} normalMap={normalMap} roughnessMap={roughnessMap} roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}

function ActiveSkinnedMeshGLB({
  meshSource,
  actuators,
  appMode,
  gizmoMode,
  pendingPoseRevision,
  simulationSamplesRef,
  isTransformDragging,
  skinningEnabled,
  skinningRevision,
  deltaMushEnabled,
  deltaMushSettings,
  onSkinningStats,
  onSkinningComputationStatus,
  onDrawSurfaceRef,
  onUpAxisDetected,
}: ActiveSkinnedMeshProps) {
  const gltf = useLoader(
    GLTFLoader,
    meshSource.meshUri,
    (loader) => {
      if (meshSource.colorMapUri && meshSource.colorMapUri !== PLACEHOLDER_WHITE_TEX_URL) {
        const manager = new LoadingManager();
        const sidecarColorUrl = meshSource.colorMapUri;
        manager.setURLModifier((url) => {
          if (!url) return url;
          const isRelative = !/^(https?:|blob:|data:)\/\//i.test(url.trim());
          if (isRelative && sidecarColorUrl) return sidecarColorUrl;
          return url;
        });
        loader.manager = manager;
      }
    },
  );
  const importScale = meshSource.importScale;
  const positionOffset = meshSource.positionOffset;
  const rotationOffset = meshSource.rotationOffset;
  const upAxis = meshSource.upAxis;
  const materialRef = useRef<MeshStandardMaterial | null>(null);
  const meshOpacityRef = useRef(1);
  const meshOpacityVelocityRef = useRef(0);

  const combinedRotation = useMemo(
    () => meshImportRotationQuat(upAxis, rotationOffset),
    [upAxis, rotationOffset.x, rotationOffset.y, rotationOffset.z],
  );
  const inverseRotation = useMemo(() => combinedRotation.clone().invert(), [combinedRotation]);
  const scratchWorldRef = useRef(new Vector3());

  const { geometry: baseGeometry, material } = useMemo(() => extractGeometryAndMaterialFromGLTF(gltf), [gltf]);
  const upAxisDetectedRef = useRef(false);
  useEffect(() => {
    if (baseGeometry == null || meshSource.upAxis !== "Y" || upAxisDetectedRef.current || !onUpAxisDetected) return;
    if (isLikelyZUpFromGeometry(baseGeometry)) {
      upAxisDetectedRef.current = true;
      onUpAxisDetected(meshSource.id, "Z");
    }
  }, [baseGeometry, meshSource.id, meshSource.upAxis, onUpAxisDetected]);

  const colorMap = useLoader(TextureLoader, meshSource.colorMapUri);
  useEffect(() => {
    materialRef.current = material;
    return () => {
      materialRef.current = null;
    };
  }, [material]);
  useEffect(() => {
    if (
      meshSource.colorMapUri &&
      meshSource.colorMapUri !== PLACEHOLDER_WHITE_TEX_URL &&
      colorMap instanceof Texture
    ) {
      colorMap.colorSpace = SRGBColorSpace;
      material.map = colorMap;
      material.needsUpdate = true;
    }
  }, [material, meshSource.colorMapUri, colorMap]);

  const displayGeometry: BufferGeometry | null = useMemo(() => {
    const geom = baseGeometry?.clone() ?? null;
    if (geom != null && meshSource.flipNormals) flipNormalsOnGeometry(geom);
    return geom;
  }, [baseGeometry, meshSource.flipNormals]);

  const baseVerticesLocal = useMemo<SkinVec3[]>(() => {
    if (baseGeometry === null) return [];
    const position = baseGeometry.getAttribute("position");
    if (position === undefined) return [];
    const vertices: SkinVec3[] = [];
    for (let i = 0; i < position.count; i += 1) {
      vertices.push({ x: position.getX(i), y: position.getY(i), z: position.getZ(i) });
    }
    return vertices;
  }, [baseGeometry]);

  const triangles = useMemo<Array<[number, number, number]>>(() => {
    if (baseGeometry === null) return [];
    const indices = baseGeometry.getIndex()?.array;
    const built: Array<[number, number, number]> = [];
    if (indices !== undefined) {
      for (let i = 0; i + 2 < indices.length; i += 3) {
        built.push([Number(indices[i]), Number(indices[i + 1]), Number(indices[i + 2])]);
      }
      return built;
    }
    for (let i = 0; i + 2 < baseVerticesLocal.length; i += 3) {
      built.push([i, i + 1, i + 2]);
    }
    return built;
  }, [baseGeometry, baseVerticesLocal.length]);

  const weldData = useMemo(() => {
    const vertexToWelded = new Array<number>(baseVerticesLocal.length);
    const weldedToVertices: number[][] = [];
    const weldedVertices: SkinVec3[] = [];
    const keyToWelded = new Map<string, number>();
    const precision = 10000;
    for (let i = 0; i < baseVerticesLocal.length; i += 1) {
      const vertex = baseVerticesLocal[i];
      const key = `${Math.round(vertex.x * precision)}|${Math.round(vertex.y * precision)}|${Math.round(vertex.z * precision)}`;
      let weldedIndex = keyToWelded.get(key);
      if (weldedIndex === undefined) {
        weldedIndex = weldedVertices.length;
        keyToWelded.set(key, weldedIndex);
        weldedVertices.push(vertex);
        weldedToVertices.push([]);
      }
      vertexToWelded[i] = weldedIndex;
      weldedToVertices[weldedIndex].push(i);
    }
    const weldedTriangles: Array<[number, number, number]> = [];
    for (const [a, b, c] of triangles) {
      const wa = vertexToWelded[a];
      const wb = vertexToWelded[b];
      const wc = vertexToWelded[c];
      if (wa === wb || wb === wc || wa === wc) continue;
      weldedTriangles.push([wa, wb, wc]);
    }
    return { vertexToWelded, weldedToVertices, weldedVertices, weldedTriangles };
  }, [baseVerticesLocal, triangles]);

  const weldedNeighbors = useMemo(
    () => buildVertexNeighbors(weldData.weldedVertices.length, weldData.weldedTriangles),
    [weldData],
  );
  const deltaMushDetailOffsets = useMemo(() => {
    const iterations = Math.max(0, Math.floor(deltaMushSettings.iterations));
    const strength = Math.max(0, Math.min(1, deltaMushSettings.strength));
    return buildDeltaMushDetailOffsets(weldData.weldedVertices, weldedNeighbors, iterations, strength);
  }, [deltaMushSettings.iterations, deltaMushSettings.strength, weldData.weldedVertices, weldedNeighbors]);

  const baseVerticesWorld = useMemo(() => {
    const v = new Vector3();
    const out = new Vector3();
    return baseVerticesLocal.map((vertex) => {
      v.set(vertex.x * importScale, vertex.y * importScale, vertex.z * importScale);
      out.copy(v).applyQuaternion(combinedRotation);
      return {
        x: positionOffset.x + out.x,
        y: positionOffset.y + out.y,
        z: positionOffset.z + out.z,
      };
    });
  }, [baseVerticesLocal, importScale, positionOffset.x, positionOffset.y, positionOffset.z, combinedRotation]);

  const meshHash = useMemo(
    () => (baseGeometry === null ? null : `mesh:${baseVerticesLocal.length}:${triangles.length}`),
    [baseGeometry, baseVerticesLocal.length, triangles.length],
  );

  const [runtimeBindings, setRuntimeBindings] = useState<RuntimeVertexBinding[] | null>(null);
  const [bindingsRevision, setBindingsRevision] = useState(0);
  const skinningJobTokenRef = useRef(0);

  useEffect(() => {
    const shouldRunRigCompute = appMode === "Rig" && skinningRevision !== bindingsRevision;
    const shouldRunPoseRecoveryCompute = pendingPoseRevision === null && appMode === "Pose" && skinningEnabled && runtimeBindings === null;
    if (isTransformDragging) {
      skinningJobTokenRef.current += 1;
      onSkinningComputationStatus({
        busy: false,
        revision: skinningRevision,
        completed: false,
        bindingHash: null,
        meshHash,
      });
      return;
    }
    if (!shouldRunRigCompute && !shouldRunPoseRecoveryCompute) {
      skinningJobTokenRef.current += 1;
      onSkinningComputationStatus({
        busy: false,
        revision: skinningRevision,
        completed: false,
        bindingHash: null,
        meshHash,
      });
      return;
    }
    if (baseVerticesWorld.length === 0 || meshHash === null) {
      setRuntimeBindings(null);
      setBindingsRevision(skinningRevision);
      onSkinningStats({ vertexCount: 0, capsuleCount: 0, averageWeight: 0 });
      onSkinningComputationStatus({
        busy: false,
        revision: skinningRevision,
        completed: false,
        bindingHash: null,
        meshHash: null,
      });
      return;
    }
    const revision = skinningRevision;
    const currentToken = skinningJobTokenRef.current + 1;
    skinningJobTokenRef.current = currentToken;
    onSkinningComputationStatus({
      busy: true,
      revision,
      completed: false,
      bindingHash: null,
      meshHash,
    });
    const run = async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (skinningJobTokenRef.current !== currentToken) return;
      const capsules: Capsule[] = actuators
        .filter((actuator) => actuator.shape === "capsule")
        .map((actuator) => {
          const rotation = new Quaternion(
            actuator.transform.rotation.x,
            actuator.transform.rotation.y,
            actuator.transform.rotation.z,
            actuator.transform.rotation.w,
          );
          const halfHeight = getCapsuleHalfAxis(actuator.size);
          const up = new Vector3(0, 1, 0).applyQuaternion(rotation);
          const center = getActuatorPrimitiveCenter(actuator);
          const start = center.clone().addScaledVector(up, -halfHeight);
          const end = center.clone().addScaledVector(up, halfHeight);
          return {
            id: actuator.id,
            start: { x: start.x, y: start.y, z: start.z },
            end: { x: end.x, y: end.y, z: end.z },
            radius: getActuatorRadius(actuator),
          };
        });
      const rootCapsuleIds = actuators
        .filter((actuator) => actuator.parentId === null && actuator.shape === "capsule")
        .map((actuator) => actuator.id);
      if (capsules.length === 0) {
        setRuntimeBindings([]);
        setBindingsRevision(revision);
        onSkinningStats({ vertexCount: baseVerticesWorld.length, capsuleCount: 0, averageWeight: 0 });
        onSkinningComputationStatus({
          busy: false,
          revision,
          completed: true,
          bindingHash: `bind:${revision}:empty`,
          meshHash,
        });
        return;
      }
      const nearest = bindVerticesToClosestCapsule(baseVerticesWorld, capsules, {
        rootCapsuleIds,
        falloffMultiplier: 2,
      });
      if (skinningJobTokenRef.current !== currentToken) return;
      const actuatorById = new Map(
        actuators.map((actuator) => [
          actuator.id,
          {
            rigId: actuator.rigId,
            position: getActuatorPrimitiveCenter(actuator),
            rotation: new Quaternion(
              actuator.transform.rotation.x,
              actuator.transform.rotation.y,
              actuator.transform.rotation.z,
              actuator.transform.rotation.w,
            ),
          },
        ]),
      );
      const rootIdByRig = new Map<string, string>();
      for (const actuator of actuators) {
        if (actuator.parentId !== null || actuator.shape !== "capsule") continue;
        rootIdByRig.set(actuator.rigId, actuator.id);
      }
      const fallbackRootCapsuleId = rootCapsuleIds[0] ?? null;
      const nextBindings: RuntimeVertexBinding[] = nearest.map((binding, index) => {
        const bindWorld = baseVerticesWorld[index];
        const influenceActuator = actuatorById.get(binding.capsuleId);
        const rigScopedRootId =
          influenceActuator === undefined
            ? null
            : (rootIdByRig.get(influenceActuator.rigId) ?? fallbackRootCapsuleId);
        const rootCapsuleId = rigScopedRootId ?? fallbackRootCapsuleId;
        const rootActuator = rootCapsuleId === null ? undefined : actuatorById.get(rootCapsuleId);
        const rootLocalOffset =
          rootActuator === undefined
            ? { x: 0, y: 0, z: 0 }
            : (() => {
                const offset = new Vector3(bindWorld.x, bindWorld.y, bindWorld.z)
                  .sub(rootActuator.position)
                  .applyQuaternion(rootActuator.rotation.clone().invert());
                return { x: offset.x, y: offset.y, z: offset.z };
              })();
        const rootBindRotation =
          rootActuator === undefined
            ? { x: 0, y: 0, z: 0, w: 1 }
            : {
                x: rootActuator.rotation.x,
                y: rootActuator.rotation.y,
                z: rootActuator.rotation.z,
                w: rootActuator.rotation.w,
              };
        if (influenceActuator === undefined) {
          return {
            capsuleId: binding.capsuleId,
            rootCapsuleId,
            bindWorld,
            localOffset: { x: 0, y: 0, z: 0 },
            rootLocalOffset,
            rootBindRotation,
            capsuleBindRotation: null,
            weight: 0,
          };
        }
        const localOffset = new Vector3(bindWorld.x, bindWorld.y, bindWorld.z)
          .sub(influenceActuator.position)
          .applyQuaternion(influenceActuator.rotation.clone().invert());
        const capsuleBindRotation = {
          x: influenceActuator.rotation.x,
          y: influenceActuator.rotation.y,
          z: influenceActuator.rotation.z,
          w: influenceActuator.rotation.w,
        };
        return {
          capsuleId: binding.capsuleId,
          rootCapsuleId,
          bindWorld,
          localOffset: { x: localOffset.x, y: localOffset.y, z: localOffset.z },
          rootLocalOffset,
          rootBindRotation,
          capsuleBindRotation,
          weight: binding.weight,
        };
      });
      const averageWeight = nextBindings.reduce((sum, binding) => sum + binding.weight, 0) / Math.max(nextBindings.length, 1);
      const bindingHash = `bind:${revision}:${nextBindings.length}:${capsules.length}:${averageWeight.toFixed(6)}`;
      setRuntimeBindings(nextBindings);
      setBindingsRevision(revision);
      onSkinningStats({
        vertexCount: baseVerticesWorld.length,
        capsuleCount: capsules.length,
        averageWeight,
      });
      onSkinningComputationStatus({
        busy: false,
        revision,
        completed: true,
        bindingHash,
        meshHash,
      });
    };
    void run();
  }, [
    actuators,
    appMode,
    baseVerticesWorld,
    bindingsRevision,
    isTransformDragging,
    meshHash,
    onSkinningComputationStatus,
    onSkinningStats,
    pendingPoseRevision,
    runtimeBindings,
    skinningEnabled,
    skinningRevision,
  ]);

  useFrame((_, delta) => {
    const targetOpacity = gizmoMode === "draw" ? 1 : 1;
    const damped = smoothDampScalar(meshOpacityRef.current, targetOpacity, meshOpacityVelocityRef.current, 0.18, delta);
    meshOpacityRef.current = damped.value;
    meshOpacityVelocityRef.current = damped.velocity;
    if (materialRef.current !== null) {
      materialRef.current.transparent = false;
      materialRef.current.opacity = meshOpacityRef.current;
    }
    if (displayGeometry === null) return;
    const position = displayGeometry.getAttribute("position");
    if (position === undefined) return;
    const simulationSamples = simulationSamplesRef.current;
    const actuatorById = new Map(
      actuators.map((actuator) => [
        actuator.id,
        (() => {
          const sample = appMode === "Pose" ? simulationSamples?.[actuator.id] : undefined;
          if (sample !== undefined) {
            return {
              position: new Vector3(sample.position.x, sample.position.y, sample.position.z),
              rotation: new Quaternion(sample.rotation.x, sample.rotation.y, sample.rotation.z, sample.rotation.w),
            };
          }
          return {
            position: getActuatorPrimitiveCenter(actuator),
            rotation: new Quaternion(
              actuator.transform.rotation.x,
              actuator.transform.rotation.y,
              actuator.transform.rotation.z,
              actuator.transform.rotation.w,
            ),
          };
        })(),
      ]),
    );
    const shouldDeformInPose =
      skinningEnabled &&
      (appMode === "Pose" || pendingPoseRevision !== null) &&
      runtimeBindings !== null &&
      runtimeBindings.length === baseVerticesLocal.length &&
      bindingsRevision > 0;
    const deformed = baseVerticesLocal.map((bindLocal, index) => {
      if (!shouldDeformInPose) return bindLocal;
      const binding = runtimeBindings![index];
      if (binding === undefined) return bindLocal;
      const actuator = actuatorById.get(binding.capsuleId);
      const rootActuator = binding.rootCapsuleId === null ? undefined : actuatorById.get(binding.rootCapsuleId);
      const bindWorld = new Vector3(binding.bindWorld.x, binding.bindWorld.y, binding.bindWorld.z);
      const rootTransformedWorld =
        rootActuator === undefined
          ? bindWorld.clone()
          : new Vector3(binding.rootLocalOffset.x, binding.rootLocalOffset.y, binding.rootLocalOffset.z)
              .applyQuaternion(rootActuator.rotation)
              .add(rootActuator.position);
      const transformedWorld =
        actuator === undefined
          ? rootTransformedWorld.clone()
          : new Vector3(binding.localOffset.x, binding.localOffset.y, binding.localOffset.z)
              .applyQuaternion(actuator.rotation)
              .add(actuator.position);
      const weight = Math.max(0, Math.min(1, binding.weight));
      const weightedWorld = new Vector3(
        rootTransformedWorld.x + (transformedWorld.x - rootTransformedWorld.x) * weight,
        rootTransformedWorld.y + (transformedWorld.y - rootTransformedWorld.y) * weight,
        rootTransformedWorld.z + (transformedWorld.z - rootTransformedWorld.z) * weight,
      );
      const s = scratchWorldRef.current;
      s.set(
        weightedWorld.x - positionOffset.x,
        weightedWorld.y - positionOffset.y,
        weightedWorld.z - positionOffset.z,
      ).applyQuaternion(inverseRotation);
      return {
        x: s.x / importScale,
        y: s.y / importScale,
        z: s.z / importScale,
      };
    });
    let finalVertices = deformed;
    if (shouldDeformInPose && deltaMushEnabled) {
      const deltaMushIterations = Math.max(0, Math.floor(deltaMushSettings.iterations));
      const deltaMushStrength = Math.max(0, Math.min(1, deltaMushSettings.strength));
      const weldedCurrent = weldData.weldedVertices.map((_, weldedIndex) => {
        const members = weldData.weldedToVertices[weldedIndex] ?? [];
        if (members.length === 0) return { x: 0, y: 0, z: 0 };
        let sx = 0, sy = 0, sz = 0;
        for (const vertexIndex of members) {
          sx += deformed[vertexIndex].x;
          sy += deformed[vertexIndex].y;
          sz += deformed[vertexIndex].z;
        }
        const inv = 1 / members.length;
        return { x: sx * inv, y: sy * inv, z: sz * inv };
      });
      const smoothedWelded = applyDeltaMush(
        weldedCurrent,
        weldedNeighbors,
        deltaMushIterations,
        deltaMushStrength,
      );
      const scratchQuat = new Quaternion();
      const rotatedDetailOffsets = weldData.weldedVertices.map((_, weldedIndex) => {
        const detailOffset = deltaMushDetailOffsets[weldedIndex] ?? { x: 0, y: 0, z: 0 };
        const members = weldData.weldedToVertices[weldedIndex];
        if (members === undefined || members.length === 0) return detailOffset;
        const binding = runtimeBindings![members[0]];
        if (binding === undefined || binding.rootCapsuleId === null) return detailOffset;
        const rootActuator = actuatorById.get(binding.rootCapsuleId);
        if (rootActuator === undefined) return detailOffset;
        const bindRootRotation = new Quaternion(
          binding.rootBindRotation.x,
          binding.rootBindRotation.y,
          binding.rootBindRotation.z,
          binding.rootBindRotation.w,
        ).normalize();
        const rootRotationDelta = rootActuator.rotation.clone().multiply(bindRootRotation.invert()).normalize();
        let effectiveRotation = rootRotationDelta;
        if (
          binding.capsuleBindRotation !== null &&
          binding.weight > 0 &&
          binding.weight < 1
        ) {
          const actuator = actuatorById.get(binding.capsuleId);
          if (actuator !== undefined) {
            const bindCapsuleRotation = new Quaternion(
              binding.capsuleBindRotation.x,
              binding.capsuleBindRotation.y,
              binding.capsuleBindRotation.z,
              binding.capsuleBindRotation.w,
            ).normalize();
            const capsuleRotationDelta = actuator.rotation
              .clone()
              .multiply(bindCapsuleRotation.invert())
              .normalize();
            if (rootRotationDelta.dot(capsuleRotationDelta) < 0) capsuleRotationDelta.negate();
            scratchQuat.slerpQuaternions(rootRotationDelta, capsuleRotationDelta, binding.weight);
            effectiveRotation = scratchQuat;
          }
        } else if (binding.capsuleBindRotation !== null && binding.weight >= 1) {
          const actuator = actuatorById.get(binding.capsuleId);
          if (actuator !== undefined) {
            const bindCapsuleRotation = new Quaternion(
              binding.capsuleBindRotation.x,
              binding.capsuleBindRotation.y,
              binding.capsuleBindRotation.z,
              binding.capsuleBindRotation.w,
            ).normalize();
            effectiveRotation = actuator.rotation.clone().multiply(bindCapsuleRotation.invert()).normalize();
          }
        }
        const rotatedDetail = new Vector3(detailOffset.x, detailOffset.y, detailOffset.z).applyQuaternion(effectiveRotation);
        return { x: rotatedDetail.x, y: rotatedDetail.y, z: rotatedDetail.z };
      });
      const restoredWelded = smoothedWelded.map((value, weldedIndex) => {
        const detail = rotatedDetailOffsets[weldedIndex] ?? { x: 0, y: 0, z: 0 };
        return {
          x: value.x + detail.x,
          y: value.y + detail.y,
          z: value.z + detail.z,
        };
      });
      finalVertices = deformed.map((_, vertexIndex) => {
        const weldedIndex = weldData.vertexToWelded[vertexIndex];
        return restoredWelded[weldedIndex];
      });
    }
    for (let i = 0; i < finalVertices.length; i += 1) {
      position.setXYZ(i, finalVertices[i].x, finalVertices[i].y, finalVertices[i].z);
    }
    position.needsUpdate = true;
    displayGeometry.computeVertexNormals();
  });

  if (displayGeometry === null) return null;
  return (
    <group
      position={[positionOffset.x, positionOffset.y, positionOffset.z]}
      quaternion={combinedRotation}
      scale={[importScale, importScale, importScale]}
    >
      <mesh
        ref={(object) => onDrawSurfaceRef?.(meshSource.id, object)}
        geometry={displayGeometry}
        position={[0, 0, 0]}
        scale={[1, 1, 1]}
        castShadow
        receiveShadow
      >
        <primitive object={material} attach="material" />
      </mesh>
    </group>
  );
}
