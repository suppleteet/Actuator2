import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { BufferGeometry, Mesh, MeshStandardMaterial, Object3D, Quaternion, SRGBColorSpace, SkinnedMesh, TextureLoader, Vector3 } from "three";
import { smoothDampScalar } from "../smoothDamp";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { bindVerticesToClosestCapsule, type Capsule, type Vec3 as SkinVec3 } from "../../skinning/closestCapsuleBinding";
import { applyDeltaMushWithDetailRestore, buildDeltaMushDetailOffsets, buildVertexNeighbors } from "../../skinning/deltaMush";
import { getActuatorPrimitiveCenter, getActuatorRadius, getCapsuleHalfAxis } from "../../runtime/physicsAuthoring";
import type {
  ActiveMeshSource,
  ActuatorEntity,
  AppMode,
  DeltaMushSettings,
  GizmoMode,
  SkinningComputationStatus,
  SkinningStats,
} from "../types";

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
};

type RuntimeVertexBinding = {
  capsuleId: string;
  rootCapsuleId: string | null;
  bindWorld: SkinVec3;
  localOffset: SkinVec3;
  rootLocalOffset: SkinVec3;
  weight: number;
};

export function ActiveSkinnedMesh({
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
}: ActiveSkinnedMeshProps) {
  const meshAsset = useLoader(FBXLoader, meshSource.meshUri);
  const colorMap = useLoader(TextureLoader, meshSource.colorMapUri);
  const normalMap = useLoader(TextureLoader, meshSource.normalMapUri);
  const roughnessMap = useLoader(TextureLoader, meshSource.roughnessMapUri);
  const meshScale = meshSource.worldScale;
  const meshYOffset = meshSource.worldYOffset;
  const materialRef = useRef<MeshStandardMaterial>(null);
  const meshOpacityRef = useRef(1);
  const meshOpacityVelocityRef = useRef(0);

  const baseGeometry: BufferGeometry | null = useMemo(() => {
    let foundGeometry: BufferGeometry | null = null;
    meshAsset.traverse((object) => {
      if (foundGeometry !== null) return;
      if ((object as SkinnedMesh).isSkinnedMesh) {
        foundGeometry = (object as SkinnedMesh).geometry.clone();
        return;
      }
      if ((object as Mesh).isMesh) {
        foundGeometry = (object as Mesh).geometry.clone();
      }
    });
    const resolved = foundGeometry as BufferGeometry | null;
    if (resolved === null) return null;
    if (resolved.getAttribute("normal") === undefined) {
      resolved.computeVertexNormals();
    }
    return resolved;
  }, [meshAsset]);

  const displayGeometry: BufferGeometry | null = useMemo(() => baseGeometry?.clone() ?? null, [baseGeometry]);

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

  const baseVerticesWorld = useMemo(
    () =>
      baseVerticesLocal.map((vertex) => ({
        x: vertex.x * meshScale,
        y: vertex.y * meshScale + meshYOffset,
        z: vertex.z * meshScale,
      })),
    [baseVerticesLocal],
  );

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

        if (influenceActuator === undefined) {
          return {
            capsuleId: binding.capsuleId,
            rootCapsuleId,
            bindWorld,
            localOffset: { x: 0, y: 0, z: 0 },
            rootLocalOffset,
            weight: 0,
          };
        }

        const localOffset = new Vector3(bindWorld.x, bindWorld.y, bindWorld.z)
          .sub(influenceActuator.position)
          .applyQuaternion(influenceActuator.rotation.clone().invert());
        return {
          capsuleId: binding.capsuleId,
          rootCapsuleId,
          bindWorld,
          localOffset: { x: localOffset.x, y: localOffset.y, z: localOffset.z },
          rootLocalOffset,
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

      return {
        x: weightedWorld.x / meshScale,
        y: (weightedWorld.y - meshYOffset) / meshScale,
        z: weightedWorld.z / meshScale,
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

      const smoothedWelded = applyDeltaMushWithDetailRestore(
        weldedCurrent,
        weldedNeighbors,
        deltaMushDetailOffsets,
        deltaMushIterations,
        deltaMushStrength,
      );
      finalVertices = deformed.map((_, vertexIndex) => {
        const weldedIndex = weldData.vertexToWelded[vertexIndex];
        return smoothedWelded[weldedIndex];
      });
    }

    for (let i = 0; i < finalVertices.length; i += 1) {
      position.setXYZ(i, finalVertices[i].x, finalVertices[i].y, finalVertices[i].z);
    }
    position.needsUpdate = true;
  });

  if (displayGeometry === null) return null;

  return (
    <mesh
      ref={(object) => onDrawSurfaceRef?.(meshSource.id, object)}
      geometry={displayGeometry}
      scale={[meshScale, meshScale, meshScale]}
      position={[0, meshYOffset, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial ref={materialRef} map={colorMap} normalMap={normalMap} roughnessMap={roughnessMap} roughness={1} metalness={0} />
    </mesh>
  );
}
