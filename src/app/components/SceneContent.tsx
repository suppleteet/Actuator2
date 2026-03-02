import { createRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import {
  useAfterPhysicsStep,
  BallCollider,
  CapsuleCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  useBeforePhysicsStep,
  useFilterContactPair,
  useRapier,
  useSphericalJoint,
  type RapierCollider,
  type RapierRigidBody,
} from "@react-three/rapier";
import type { ImpulseJoint, RigidBody as RawRigidBody } from "@dimforge/rapier3d-compat";
import { useXR } from "@react-three/xr";
import { Color, Matrix4, MeshStandardMaterial, NormalBlending, Object3D, Plane, Quaternion, Vector3 } from "three";
import {
  getActuatorPivotWorldPosition,
  getActuatorPrimitiveCenter,
  getActuatorRadius,
  getCapsuleHalfAxis,
  worldPointToActuatorLocal,
} from "../../runtime/physicsAuthoring";
import {
  defaultPresetForActuatorType,
  getActuatorMassFromPreset,
  getActuatorPresetSettings,
  getRuntimeDriveFromPreset,
} from "../../runtime/physicsPresets";
import { smoothDampScalar } from "../smoothDamp";
import type {
  ActiveMeshSource,
  ActuatorEntity,
  ActuatorPreset,
  AppMode,
  DeltaMushSettings,
  GizmoMode,
  PhysicsTuning,
  PivotMode,
  Quat,
  SkinningComputationStatus,
  SkinningStats,
  Vec3,
} from "../types";
import { ActiveSkinnedMesh } from "./ActiveSkinnedMesh";

export type SceneContentProps = {
  meshSources: ActiveMeshSource[];
  actuators: ActuatorEntity[];
  appMode: AppMode;
  pendingPoseRevision: number | null;
  poseTargetActuators: ActuatorEntity[] | null;
  selectedActuatorId: string | null;
  selectedActuatorIds: string[];
  physicsEnabled: boolean;
  skinningEnabled: boolean;
  skinningRevision: number;
  deltaMushEnabled: boolean;
  deltaMushSettings: DeltaMushSettings;
  physicsTuning: PhysicsTuning;
  onSkinningStats: (stats: SkinningStats) => void;
  onSkinningComputationStatus: (status: SkinningComputationStatus) => void;
  gizmoMode: GizmoMode;
  gizmoSpace: "world" | "local";
  pivotMode: PivotMode;
  isTransformDragging: boolean;
  onSelectActuator: (id: string, options?: { additive?: boolean; toggle?: boolean }) => void;
  onClearSelection: () => void;
  onActuatorRef: (id: string, object: Object3D | null) => void;
  onTransformStart: () => void;
  onTransformChange: (
    id: string,
    worldDelta: Matrix4,
    localDelta: Matrix4,
    worldOffset: Vec3,
    options?: { includeDescendants?: boolean },
  ) => void;
  onTransformEnd: () => void;
  onPosePullDraggingChange: (active: boolean) => void;
  onDrawSurfaceRef: (id: string, object: Object3D | null) => void;
  drawHoverActuatorId: string | null;
};

type ActuatorSphericalJointProps = {
  bodyA: RefObject<RapierRigidBody>;
  bodyB: RefObject<RapierRigidBody>;
  anchorA: [number, number, number];
  anchorB: [number, number, number];
};

type SimulationOverlapFilterProps = {
  physicsEnabled: boolean;
  actuators: ActuatorEntity[];
  colliderRefs: Record<string, RefObject<RapierCollider>>;
};

type PosePhysicsBridgeProps = {
  physicsEnabled: boolean;
  appMode: AppMode;
  actuators: ActuatorEntity[];
  targetActuators: ActuatorEntity[] | null;
  bodyRefs: Record<string, RefObject<RapierRigidBody>>;
  physicsTuning: PhysicsTuning;
  posePullStateRef: MutableRefObject<PosePullState | null>;
  targetPoseRef: MutableRefObject<Record<string, { position: Vec3; rotation: Quat }>>;
  simulationSamplesRef: MutableRefObject<Record<string, { position: Vec3; rotation: Quat }> | null>;
};

type RapierAccessBridgeProps = {
  onReady: (rapier: ReturnType<typeof useRapier>["rapier"], world: ReturnType<typeof useRapier>["world"]) => void;
};

type PosePullState = {
  actuatorId: string;
  pointerId: number;
  dragPlaneNormal: Vec3;
  dragPlaneConstant: number;
};

function isFiniteVec3(value: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function isFiniteQuat(value: { x: number; y: number; z: number; w: number }): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z) && Number.isFinite(value.w);
}

function makeColliderPairKey(handleA: number, handleB: number): string {
  const low = Math.min(handleA, handleB);
  const high = Math.max(handleA, handleB);
  return `${low}:${high}`;
}

function buildTargetPoseFromActuators(actuators: ActuatorEntity[]): Record<string, { position: Vec3; rotation: Quat }> {
  const nextTargets: Record<string, { position: Vec3; rotation: Quat }> = {};
  for (const actuator of actuators) {
    const center = getActuatorPrimitiveCenter(actuator);
    nextTargets[actuator.id] = {
      position: { x: center.x, y: center.y, z: center.z },
      rotation: {
        x: actuator.transform.rotation.x,
        y: actuator.transform.rotation.y,
        z: actuator.transform.rotation.z,
        w: actuator.transform.rotation.w,
      },
    };
  }
  return nextTargets;
}

function SimulationOverlapFilter({ physicsEnabled, actuators, colliderRefs }: SimulationOverlapFilterProps) {
  const { rapier } = useRapier();
  const disabledPairKeysRef = useRef<Set<string>>(new Set());
  const pendingBootstrapRef = useRef(false);
  const bootstrapAttemptRef = useRef(0);
  const wasPhysicsEnabledRef = useRef(false);

  useEffect(() => {
    if (physicsEnabled && !wasPhysicsEnabledRef.current) {
      pendingBootstrapRef.current = true;
      bootstrapAttemptRef.current = 0;
    } else if (physicsEnabled) {
      pendingBootstrapRef.current = true;
      bootstrapAttemptRef.current = 0;
    } else if (!physicsEnabled) {
      pendingBootstrapRef.current = false;
      bootstrapAttemptRef.current = 0;
      disabledPairKeysRef.current.clear();
    }
    wasPhysicsEnabledRef.current = physicsEnabled;
  }, [physicsEnabled, actuators]);

  useBeforePhysicsStep(() => {
    if (!physicsEnabled || !pendingBootstrapRef.current) return;

    const colliderEntries: Array<{ collider: RapierCollider; actuator: ActuatorEntity }> = [];
    const colliderByActuatorId = new Map<string, RapierCollider>();
    for (const actuator of actuators) {
      const collider = colliderRefs[actuator.id]?.current;
      if (collider === undefined || collider === null || !collider.isValid()) continue;
      collider.setActiveHooks(rapier.ActiveHooks.FILTER_CONTACT_PAIRS);
      colliderEntries.push({ collider, actuator });
      colliderByActuatorId.set(actuator.id, collider);
    }
    if (colliderEntries.length < actuators.length) {
      bootstrapAttemptRef.current += 1;
      if (bootstrapAttemptRef.current < 120) {
        return;
      }
    }
    pendingBootstrapRef.current = false;
    bootstrapAttemptRef.current = 0;

    const nextDisabledPairs = new Set<string>();
    for (const actuator of actuators) {
      if (actuator.parentId === null) continue;
      const childCollider = colliderByActuatorId.get(actuator.id);
      const parentCollider = colliderByActuatorId.get(actuator.parentId);
      if (childCollider === undefined || parentCollider === undefined) continue;
      nextDisabledPairs.add(makeColliderPairKey(childCollider.handle, parentCollider.handle));
    }

    for (let i = 0; i < colliderEntries.length; i += 1) {
      for (let j = i + 1; j < colliderEntries.length; j += 1) {
        const entryA = colliderEntries[i];
        const entryB = colliderEntries[j];
        if (entryA.actuator.rigId === entryB.actuator.rigId) {
          nextDisabledPairs.add(makeColliderPairKey(entryA.collider.handle, entryB.collider.handle));
          continue;
        }
        const contact = entryA.collider.contactCollider(entryB.collider, 0);
        if (contact !== null && contact.distance < 0) {
          nextDisabledPairs.add(makeColliderPairKey(entryA.collider.handle, entryB.collider.handle));
        }
      }
    }
    disabledPairKeysRef.current = nextDisabledPairs;
  });

  useFilterContactPair((collider1, collider2) => {
    if (!physicsEnabled) return null;
    if (pendingBootstrapRef.current) return rapier.SolverFlags.EMPTY;
    return disabledPairKeysRef.current.has(makeColliderPairKey(collider1, collider2)) ? rapier.SolverFlags.EMPTY : null;
  });

  return null;
}

function PosePhysicsBridge({
  physicsEnabled,
  appMode,
  targetActuators,
  actuators,
  bodyRefs,
  physicsTuning,
  posePullStateRef,
  targetPoseRef,
  simulationSamplesRef,
}: PosePhysicsBridgeProps) {
  const wasActiveRef = useRef(false);

  useBeforePhysicsStep(() => {
    const isActive = physicsEnabled && appMode === "Pose";
    if (!isActive) {
      wasActiveRef.current = false;
      return;
    }

    const maxDistance = 200;
    const isEnteringSimulation = !wasActiveRef.current;
    wasActiveRef.current = true;
    const grabbedActuatorId = posePullStateRef.current?.actuatorId ?? null;
    if (isEnteringSimulation && Object.keys(targetPoseRef.current).length === 0) {
      targetPoseRef.current = buildTargetPoseFromActuators(targetActuators ?? actuators);
    }

    for (const actuator of actuators) {
      const body = bodyRefs[actuator.id]?.current;
      const target = targetPoseRef.current[actuator.id];
      if (body === undefined || body === null || target === undefined) continue;

      if (isEnteringSimulation) {
        body.setTranslation(target.position, true);
        body.setRotation(target.rotation, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }

      const linearVelocity = body.linvel();
      const safeLinearVelocity = isFiniteVec3(linearVelocity) ? linearVelocity : ({ x: 0, y: 0, z: 0 } as const);
      if (!isFiniteVec3(linearVelocity)) {
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }

      let sampledPosition = body.translation();
      if (
        !isFiniteVec3(sampledPosition) ||
        Math.abs(sampledPosition.x) > maxDistance ||
        Math.abs(sampledPosition.y) > maxDistance ||
        Math.abs(sampledPosition.z) > maxDistance
      ) {
        body.setTranslation(target.position, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        sampledPosition = target.position;
      }

      const currentRotation = body.rotation();
      if (!isFiniteQuat(currentRotation)) {
        body.setRotation(target.rotation, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        continue;
      }
      const angularVelocity = body.angvel();
      if (!isFiniteVec3(angularVelocity)) {
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        continue;
      }
      const drive = getRuntimeDriveFromPreset(actuator);
      const positionSpring = {
        // Pose recovery should always provide some positional return force,
        // even for presets with zero authored position spring.
        stiffness: Math.max(8, drive.positionStiffness),
        damping: Math.max(1.2, drive.positionDamping),
        maxLinearSpeed: Math.max(1, drive.positionStiffness * 0.04),
        deadband: 0.0006,
      };
      const rotationSpring = {
        stiffness: Math.max(0.45, drive.rotationStiffness * Math.max(0, physicsTuning.rotationStiffness)),
        velocityBlend: Math.max(
          0.08,
          Math.min(1, drive.rotationVelocityBlend * Math.max(0, physicsTuning.rotationVelocityBlend)),
        ),
        maxAngularSpeed: Math.max(0.8, drive.maxAngularSpeed * Math.max(0.1, physicsTuning.maxAngularSpeed)),
        deadband: 0.0006,
      };
      if (actuator.parentId === null) {
        if (actuator.id === grabbedActuatorId) continue;

        const rootError = new Vector3(
          target.position.x - sampledPosition.x,
          target.position.y - sampledPosition.y,
          target.position.z - sampledPosition.z,
        );
        const rootDistance = rootError.length();
        const rootCurrentVelocity = new Vector3(safeLinearVelocity.x, safeLinearVelocity.y, safeLinearVelocity.z);
        const rootPositionGain = Math.max(2.8, Math.min(26, positionSpring.stiffness * 0.09));
        const rootVelocityDamping = Math.max(1.4, Math.min(9, positionSpring.damping * 0.11));
        const desiredRootVelocity =
          rootDistance <= positionSpring.deadband
            ? rootCurrentVelocity.multiplyScalar(0.4)
            : rootError.multiplyScalar(rootPositionGain).addScaledVector(rootCurrentVelocity, -rootVelocityDamping);
        const maxRootSpeed = Math.max(0.35, Math.min(4.2, positionSpring.maxLinearSpeed * 0.95));
        const desiredRootSpeed = desiredRootVelocity.length();
        if (desiredRootSpeed > maxRootSpeed) {
          desiredRootVelocity.multiplyScalar(maxRootSpeed / desiredRootSpeed);
        }

        const rootCurrentQ = new Quaternion(currentRotation.x, currentRotation.y, currentRotation.z, currentRotation.w);
        const rootTargetQ = new Quaternion(target.rotation.x, target.rotation.y, target.rotation.z, target.rotation.w);
        const rootDeltaQ = rootTargetQ.clone().multiply(rootCurrentQ.clone().invert()).normalize();
        if (rootDeltaQ.w < 0) {
          rootDeltaQ.x = -rootDeltaQ.x;
          rootDeltaQ.y = -rootDeltaQ.y;
          rootDeltaQ.z = -rootDeltaQ.z;
          rootDeltaQ.w = -rootDeltaQ.w;
        }
        const rootAngularVelocity = new Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z);
        const rootSinHalfAngle = Math.sqrt(
          rootDeltaQ.x * rootDeltaQ.x +
          rootDeltaQ.y * rootDeltaQ.y +
          rootDeltaQ.z * rootDeltaQ.z,
        );
        let desiredRootAngularVelocity = rootAngularVelocity.clone().multiplyScalar(0.7);
        if (rootSinHalfAngle >= 1e-6) {
          const rootAxisScale = 1 / rootSinHalfAngle;
          const rootAngle = 2 * Math.atan2(rootSinHalfAngle, Math.max(-1, Math.min(1, rootDeltaQ.w)));
          const rootErrorAxis = new Vector3(
            rootDeltaQ.x * rootAxisScale,
            rootDeltaQ.y * rootAxisScale,
            rootDeltaQ.z * rootAxisScale,
          ).multiplyScalar(rootAngle);
          const rootRotationGain = Math.max(0.5, Math.min(3.8, rotationSpring.stiffness * 0.24));
          const rootAngularDamping = Math.max(2.2, Math.min(7, 2 + rotationSpring.velocityBlend * 5.5));
          desiredRootAngularVelocity = rootErrorAxis.addScaledVector(rootAngularVelocity, -rootAngularDamping);
          desiredRootAngularVelocity.multiplyScalar(rootRotationGain);
        }
        const maxRootAngularSpeed = Math.max(0.35, Math.min(3, rotationSpring.maxAngularSpeed * 0.36));
        const desiredRootAngularSpeed = desiredRootAngularVelocity.length();
        if (desiredRootAngularSpeed > maxRootAngularSpeed) {
          desiredRootAngularVelocity.multiplyScalar(maxRootAngularSpeed / desiredRootAngularSpeed);
        }

        body.setLinvel({ x: desiredRootVelocity.x, y: desiredRootVelocity.y, z: desiredRootVelocity.z }, true);
        body.setAngvel(
          { x: desiredRootAngularVelocity.x, y: desiredRootAngularVelocity.y, z: desiredRootAngularVelocity.z },
          true,
        );
        continue;
      }
      if (actuator.id === grabbedActuatorId) continue;
      const parentBody = bodyRefs[actuator.parentId]?.current;
      const parentTarget = targetPoseRef.current[actuator.parentId];
      if (parentBody === undefined || parentBody === null || parentTarget === undefined) continue;

      const childPositionError = new Vector3(
        target.position.x - sampledPosition.x,
        target.position.y - sampledPosition.y,
        target.position.z - sampledPosition.z,
      );
      const childDistance = childPositionError.length();
      const childCurrentVelocity = new Vector3(safeLinearVelocity.x, safeLinearVelocity.y, safeLinearVelocity.z);
      const childPositionGain = Math.max(1.3, Math.min(14, positionSpring.stiffness * 0.07));
      const childVelocityDamping = Math.max(0.5, Math.min(6, positionSpring.damping * 0.09));
      const desiredChildVelocity =
        childDistance <= positionSpring.deadband
          ? childCurrentVelocity.multiplyScalar(0.5)
          : childPositionError.multiplyScalar(childPositionGain).addScaledVector(childCurrentVelocity, -childVelocityDamping);
      const maxChildSpeed = Math.max(0.35, Math.min(3.4, positionSpring.maxLinearSpeed * 0.75));
      const desiredChildSpeed = desiredChildVelocity.length();
      if (desiredChildSpeed > maxChildSpeed) {
        desiredChildVelocity.multiplyScalar(maxChildSpeed / desiredChildSpeed);
      }
      body.setLinvel({ x: desiredChildVelocity.x, y: desiredChildVelocity.y, z: desiredChildVelocity.z }, true);

      const parentRotation = parentBody.rotation();
      if (!isFiniteQuat(parentRotation)) continue;

      const currentParentQ = new Quaternion(parentRotation.x, parentRotation.y, parentRotation.z, parentRotation.w);
      const currentChildQ = new Quaternion(currentRotation.x, currentRotation.y, currentRotation.z, currentRotation.w);
      const currentLocalQ = currentParentQ.clone().invert().multiply(currentChildQ).normalize();

      const targetParentQ = new Quaternion(
        parentTarget.rotation.x,
        parentTarget.rotation.y,
        parentTarget.rotation.z,
        parentTarget.rotation.w,
      );
      const targetChildQ = new Quaternion(target.rotation.x, target.rotation.y, target.rotation.z, target.rotation.w);
      const targetLocalQ = targetParentQ.clone().invert().multiply(targetChildQ).normalize();

      const deltaQ = targetLocalQ.clone().multiply(currentLocalQ.invert()).normalize();
      if (deltaQ.w < 0) {
        deltaQ.x = -deltaQ.x;
        deltaQ.y = -deltaQ.y;
        deltaQ.z = -deltaQ.z;
        deltaQ.w = -deltaQ.w;
      }

      const parentAngularVelocity = parentBody.angvel();
      const parentAngularVelocitySafe =
        isFiniteVec3(parentAngularVelocity) ? parentAngularVelocity : ({ x: 0, y: 0, z: 0 } as const);
      const relativeAngularVelocity = {
        x: angularVelocity.x - parentAngularVelocitySafe.x,
        y: angularVelocity.y - parentAngularVelocitySafe.y,
        z: angularVelocity.z - parentAngularVelocitySafe.z,
      };

      const sinHalfAngle = Math.sqrt(deltaQ.x * deltaQ.x + deltaQ.y * deltaQ.y + deltaQ.z * deltaQ.z);
      if (sinHalfAngle < 1e-6) {
        continue;
      }
      const axisScale = 1 / sinHalfAngle;
      const angle = 2 * Math.atan2(sinHalfAngle, Math.max(-1, Math.min(1, deltaQ.w)));
      const localErrorAxis = new Vector3(deltaQ.x * axisScale, deltaQ.y * axisScale, deltaQ.z * axisScale).multiplyScalar(
        angle,
      );
      const worldErrorAxis = localErrorAxis.applyQuaternion(currentParentQ);
      const rotationErrorMagnitude = worldErrorAxis.length();
      const relativeAngularSpeed = Math.hypot(relativeAngularVelocity.x, relativeAngularVelocity.y, relativeAngularVelocity.z);
      if (rotationErrorMagnitude >= rotationSpring.deadband || relativeAngularSpeed >= 0.02) {
        const currentAngularVelocity = new Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z);
        const desiredAngularVelocity = new Vector3(
          parentAngularVelocitySafe.x,
          parentAngularVelocitySafe.y,
          parentAngularVelocitySafe.z,
        ).addScaledVector(worldErrorAxis, rotationSpring.stiffness);
        const blendedAngularVelocity = currentAngularVelocity.lerp(desiredAngularVelocity, rotationSpring.velocityBlend);
        const angularSpeed = blendedAngularVelocity.length();
        if (angularSpeed > rotationSpring.maxAngularSpeed) {
          blendedAngularVelocity.multiplyScalar(rotationSpring.maxAngularSpeed / angularSpeed);
        }
        body.setAngvel(
          { x: blendedAngularVelocity.x, y: blendedAngularVelocity.y, z: blendedAngularVelocity.z },
          true,
        );
      }
    }

  });

  useAfterPhysicsStep(() => {
    if (!physicsEnabled || appMode !== "Pose") {
      simulationSamplesRef.current = null;
      return;
    }

    const samples: Record<string, { position: Vec3; rotation: Quat }> = {};
    let count = 0;
    for (const actuator of actuators) {
      const body = bodyRefs[actuator.id]?.current;
      if (body === null || body === undefined) continue;
      const position = body.translation();
      const rotation = body.rotation();
      if (!isFiniteVec3(position) || !isFiniteQuat(rotation)) continue;
      samples[actuator.id] = {
        position: { x: position.x, y: position.y, z: position.z },
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
      };
      count += 1;
    }
    const nextSamples = count > 0 ? samples : null;
    simulationSamplesRef.current = nextSamples;
  });

  return null;
}

function ActuatorSphericalJoint({ bodyA, bodyB, anchorA, anchorB }: ActuatorSphericalJointProps) {
  useSphericalJoint(bodyA, bodyB, [anchorA, anchorB]);
  return null;
}

function RapierAccessBridge({ onReady }: RapierAccessBridgeProps) {
  const { rapier, world } = useRapier();
  useEffect(() => {
    onReady(rapier, world);
  }, [onReady, rapier, world]);
  return null;
}

function getGeometry(shape: ActuatorEntity["shape"], size: ActuatorEntity["size"]) {
  if (shape === "sphere") return <sphereGeometry args={[Math.max(size.x, size.y, size.z) * 0.5, 18, 14]} />;
  if (shape === "capsule") return <capsuleGeometry args={[Math.max(size.x, size.z) * 0.5, size.y, 8, 14]} />;
  return <boxGeometry args={[size.x, size.y, size.z]} />;
}

type ActuatorVisualState = "Enabled" | "Hovering" | "Selected" | "Disabled";

const UNITY_ACTUATOR_PRESET_COLORS: Record<ActuatorPreset, { r: number; g: number; b: number }> = {
  Default: { r: 0.625, g: 0.65, b: 0.8 },
  Root: { r: 0.71, g: 0.71, b: 0.34 },
  SpinePelvis: { r: 0.438, g: 0.66, b: 0.295 },
  NeckHead: { r: 0.294, g: 0.658, b: 0.535 },
  ArmLeg: { r: 0.294, g: 0.572, b: 0.658 },
  ElbowKnee: { r: 0.43, g: 0.67, b: 0.73 },
  Finger: { r: 0.632, g: 0.294, b: 0.658 },
  MuscleJiggle: { r: 0.725, g: 0.5, b: 0.675 },
  FatJiggle: { r: 0.7, g: 0.5, b: 0.3 },
  Dangly: { r: 0.5, g: 0.5, b: 0.5 },
  Floppy: { r: 0.3, g: 0.5, b: 0.7 },
};

const UNITY_ACTUATOR_STATE_ALPHA: Record<ActuatorVisualState, number> = {
  Enabled: 0.16,
  Hovering: 0.42,
  Selected: 0.95,
  Disabled: 0.025,
};

function getActuatorVisualState(isSelected: boolean, isHovered: boolean): ActuatorVisualState {
  if (isSelected) return "Selected";
  if (isHovered) return "Hovering";
  return "Enabled";
}

function getUnityActuatorVisual(
  actuator: Pick<ActuatorEntity, "preset" | "type">,
  state: ActuatorVisualState,
) {
  const preset = actuator.preset ?? defaultPresetForActuatorType(actuator.type);
  const baseColor = UNITY_ACTUATOR_PRESET_COLORS[preset];
  const alpha = UNITY_ACTUATOR_STATE_ALPHA[state];
  const highlight = state === "Selected" ? 0.34 : state === "Hovering" ? 0.16 : 0;
  const lift = state === "Selected" ? 0.08 : state === "Hovering" ? 0.04 : 0.015;
  const r = Math.min(1, baseColor.r + (1 - baseColor.r) * highlight + lift);
  const g = Math.min(1, baseColor.g + (1 - baseColor.g) * highlight + lift);
  const b = Math.min(1, baseColor.b + (1 - baseColor.b) * highlight + lift);
  return {
    r,
    g,
    b,
    alpha,
  };
}

export function SceneContent({
  meshSources,
  actuators,
  appMode,
  pendingPoseRevision,
  poseTargetActuators,
  selectedActuatorId,
  selectedActuatorIds,
  physicsEnabled,
  skinningEnabled,
  skinningRevision,
  deltaMushEnabled,
  deltaMushSettings,
  physicsTuning,
  onSkinningStats,
  onSkinningComputationStatus,
  gizmoMode,
  gizmoSpace,
  pivotMode,
  isTransformDragging,
  onSelectActuator,
  onClearSelection,
  onActuatorRef,
  onTransformStart,
  onTransformChange,
  onTransformEnd,
  onPosePullDraggingChange,
  onDrawSurfaceRef,
  drawHoverActuatorId,
}: SceneContentProps) {
  const { scene } = useThree();
  const xrMode = useXR((state) => state.mode);
  const isInXR = xrMode !== null;
  const selectedIdSet = useMemo(() => {
    const resolved = new Set(selectedActuatorIds);
    if (selectedActuatorId !== null) resolved.add(selectedActuatorId);
    return resolved;
  }, [selectedActuatorId, selectedActuatorIds]);
  const actuatorById = useMemo(() => new Map(actuators.map((actuator) => [actuator.id, actuator])), [actuators]);
  const pivotObjectRef = useRef<Object3D>(new Object3D());
  const transformControlsRef = useRef<any>(null);
  const rigidBodyRefsRef = useRef<Record<string, RefObject<RapierRigidBody>>>({});
  const colliderRefsRef = useRef<Record<string, RefObject<RapierCollider>>>({});
  const dragStartPivotMatrixRef = useRef(new Matrix4());
  const dragStartPivotPositionRef = useRef(new Vector3());
  const dragActuatorIdRef = useRef<string | null>(null);
  const isDragActiveRef = useRef(false);
  const hasAcceptedDragFrameRef = useRef(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const isShiftPressedRef = useRef(false);
  const materialRefs = useRef<Record<string, MeshStandardMaterial | null>>({});
  const opacityRef = useRef(appMode === "Pose" ? 0.32 : 1);
  const opacityVelocityRef = useRef(0);
  const backgroundBlendRef = useRef(appMode === "Pose" ? 1 : 0);
  const backgroundBlendVelocityRef = useRef(0);
  const blendedBackgroundRef = useRef(new Color("#111a26"));
  const lightBackground = useMemo(() => new Color("#111a26"), []);
  const darkBackground = useMemo(() => new Color("#1d2230"), []);
  const meshStatsByIdRef = useRef<Record<string, SkinningStats>>({});
  const meshStatusByIdRef = useRef<Record<string, SkinningComputationStatus>>({});
  const targetPoseRef = useRef<Record<string, { position: Vec3; rotation: Quat }>>({});
  const simulationSamplesRef = useRef<Record<string, { position: Vec3; rotation: Quat }> | null>(null);
  const posePullStateRef = useRef<PosePullState | null>(null);
  const rapierRef = useRef<ReturnType<typeof useRapier>["rapier"] | null>(null);
  const worldRef = useRef<ReturnType<typeof useRapier>["world"] | null>(null);
  const posePullAnchorBodyRef = useRef<RawRigidBody | null>(null);
  const posePullJointRef = useRef<ImpulseJoint | null>(null);
  const posePullPlaneRef = useRef(new Plane());
  const posePullPlaneNormalRef = useRef(new Vector3());
  const posePullHitPointRef = useRef(new Vector3());
  const suppressSelectionClickUntilRef = useRef(0);
  const clearPosePullBodyMotion = useCallback(() => {
    const posePull = posePullStateRef.current;
    if (posePull === null) return;
    const body = rigidBodyRefsRef.current[posePull.actuatorId]?.current;
    if (body === undefined || body === null) return;
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }, []);

  const clearPosePullState = useCallback(() => {
    if (posePullJointRef.current !== null && worldRef.current !== null) {
      worldRef.current.removeImpulseJoint(posePullJointRef.current, true);
      posePullJointRef.current = null;
    }
    if (posePullAnchorBodyRef.current !== null && worldRef.current !== null) {
      worldRef.current.removeRigidBody(posePullAnchorBodyRef.current);
      posePullAnchorBodyRef.current = null;
    }
    if (posePullStateRef.current !== null) {
      clearPosePullBodyMotion();
      posePullStateRef.current = null;
      onPosePullDraggingChange(false);
    }
  }, [clearPosePullBodyMotion, onPosePullDraggingChange]);

  const emitAggregatedSkinningStats = useCallback(() => {
    if (meshSources.length === 0) {
      onSkinningStats({ vertexCount: 0, capsuleCount: 0, averageWeight: 0 });
      return;
    }

    let vertexCount = 0;
    let weightedWeightSum = 0;
    let capsuleCount = 0;

    for (const meshSource of meshSources) {
      const stats = meshStatsByIdRef.current[meshSource.id] ?? { vertexCount: 0, capsuleCount: 0, averageWeight: 0 };
      vertexCount += stats.vertexCount;
      weightedWeightSum += stats.averageWeight * stats.vertexCount;
      capsuleCount = Math.max(capsuleCount, stats.capsuleCount);
    }

    onSkinningStats({
      vertexCount,
      capsuleCount,
      averageWeight: vertexCount === 0 ? 0 : weightedWeightSum / vertexCount,
    });
  }, [meshSources, onSkinningStats]);

  const emitAggregatedSkinningStatus = useCallback(() => {
    if (meshSources.length === 0) {
      onSkinningComputationStatus({
        busy: false,
        revision: 0,
        completed: false,
        bindingHash: null,
        meshHash: null,
      });
      return;
    }

    const statuses = meshSources.map((meshSource) => {
      return (
        meshStatusByIdRef.current[meshSource.id] ?? {
          busy: false,
          revision: 0,
          completed: false,
          bindingHash: null,
          meshHash: null,
        }
      );
    });
    const revision = statuses.reduce((current, status) => Math.max(current, status.revision), 0);
    const busy = statuses.some((status) => status.busy);
    const completed = statuses.length > 0 && statuses.every((status) => status.completed && status.revision >= revision);
    const meshHashes = statuses.map((status, index) =>
      status.meshHash === null ? null : `${meshSources[index].id}:${status.meshHash}`,
    );
    const bindingHashes = statuses.map((status, index) =>
      status.bindingHash === null ? null : `${meshSources[index].id}:${status.bindingHash}`,
    );
    const hasAllMeshHashes = meshHashes.every((value): value is string => value !== null);
    const hasAllBindingHashes = bindingHashes.every((value): value is string => value !== null);

    onSkinningComputationStatus({
      busy,
      revision,
      completed,
      meshHash: completed && hasAllMeshHashes ? meshHashes.join("|") : null,
      bindingHash: completed && hasAllBindingHashes ? bindingHashes.join("|") : null,
    });
  }, [meshSources, onSkinningComputationStatus]);

  useEffect(() => {
    const activeIds = new Set(meshSources.map((meshSource) => meshSource.id));
    for (const meshId of Object.keys(meshStatsByIdRef.current)) {
      if (!activeIds.has(meshId)) {
        delete meshStatsByIdRef.current[meshId];
      }
    }
    for (const meshId of Object.keys(meshStatusByIdRef.current)) {
      if (!activeIds.has(meshId)) {
        delete meshStatusByIdRef.current[meshId];
      }
    }

    for (const meshSource of meshSources) {
      if (meshStatsByIdRef.current[meshSource.id] === undefined) {
        meshStatsByIdRef.current[meshSource.id] = { vertexCount: 0, capsuleCount: 0, averageWeight: 0 };
      }
      if (meshStatusByIdRef.current[meshSource.id] === undefined) {
        meshStatusByIdRef.current[meshSource.id] = {
          busy: false,
          revision: 0,
          completed: false,
          bindingHash: null,
          meshHash: null,
        };
      }
    }

    emitAggregatedSkinningStats();
    emitAggregatedSkinningStatus();
  }, [emitAggregatedSkinningStats, emitAggregatedSkinningStatus, meshSources]);

  const onMeshSkinningStats = useCallback(
    (meshId: string, stats: SkinningStats) => {
      meshStatsByIdRef.current[meshId] = stats;
      emitAggregatedSkinningStats();
    },
    [emitAggregatedSkinningStats],
  );

  const onMeshSkinningComputationStatus = useCallback(
    (meshId: string, status: SkinningComputationStatus) => {
      meshStatusByIdRef.current[meshId] = status;
      emitAggregatedSkinningStatus();
    },
    [emitAggregatedSkinningStatus],
  );

  const bodyRefById = rigidBodyRefsRef.current;
  const colliderRefById = colliderRefsRef.current;
  const activeActuatorIds = new Set<string>();
  for (const actuator of actuators) {
    activeActuatorIds.add(actuator.id);
    if (bodyRefById[actuator.id] === undefined) {
      bodyRefById[actuator.id] = createRef<RapierRigidBody>() as RefObject<RapierRigidBody>;
    }
    if (colliderRefById[actuator.id] === undefined) {
      colliderRefById[actuator.id] = createRef<RapierCollider>() as RefObject<RapierCollider>;
    }
  }
  for (const actuatorId of Object.keys(bodyRefById)) {
    if (!activeActuatorIds.has(actuatorId)) {
      delete bodyRefById[actuatorId];
    }
  }
  for (const actuatorId of Object.keys(colliderRefById)) {
    if (!activeActuatorIds.has(actuatorId)) {
      delete colliderRefById[actuatorId];
    }
  }

  useEffect(() => {
    if (!physicsEnabled || appMode !== "Pose") {
      clearPosePullState();
    }
  }, [appMode, clearPosePullState, physicsEnabled]);

  useEffect(() => {
    if (!physicsEnabled || appMode !== "Pose") {
      targetPoseRef.current = {};
      return;
    }
    if (poseTargetActuators !== null) {
      targetPoseRef.current = buildTargetPoseFromActuators(poseTargetActuators);
      return;
    }
    targetPoseRef.current = buildTargetPoseFromActuators(actuators);
  }, [actuators, appMode, physicsEnabled, poseTargetActuators]);

  useEffect(() => {
    const onWindowPointerRelease = (_event: PointerEvent) => {
      const posePull = posePullStateRef.current;
      if (posePull === null) return;
      clearPosePullState();
    };

    window.addEventListener("pointerup", onWindowPointerRelease);
    window.addEventListener("pointercancel", onWindowPointerRelease);
    return () => {
      window.removeEventListener("pointerup", onWindowPointerRelease);
      window.removeEventListener("pointercancel", onWindowPointerRelease);
    };
  }, [clearPosePullState]);

  useEffect(() => clearPosePullState, [clearPosePullState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Alt") setIsAltPressed(true);
      if (event.key === "Shift") isShiftPressedRef.current = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") setIsAltPressed(false);
      if (event.key === "Shift") isShiftPressedRef.current = false;
    };
    const onBlur = () => {
      setIsAltPressed(false);
      isShiftPressedRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    if (!isAltPressed || !isDragActiveRef.current) return;
    isDragActiveRef.current = false;
    hasAcceptedDragFrameRef.current = false;
    dragActuatorIdRef.current = null;
    onTransformEnd();
  }, [isAltPressed, onTransformEnd]);

  useEffect(() => {
    const isTransformMode = gizmoMode === "translate" || gizmoMode === "rotate" || gizmoMode === "scale";
    if (isTransformMode) return;
    if (!isDragActiveRef.current && dragActuatorIdRef.current === null) return;
    isDragActiveRef.current = false;
    hasAcceptedDragFrameRef.current = false;
    dragActuatorIdRef.current = null;
    onTransformEnd();
  }, [gizmoMode, onTransformEnd]);

  useEffect(() => {
    setHoveredId(null);
  }, [appMode, gizmoMode, physicsEnabled, selectedActuatorId]);

  useEffect(() => {
    const targetOpacity = appMode === "Pose" ? 0.32 : 1;
    opacityRef.current = targetOpacity;
    opacityVelocityRef.current = 0;
    const targetBlend = appMode === "Pose" ? 1 : 0;
    backgroundBlendRef.current = targetBlend;
    backgroundBlendVelocityRef.current = 0;
  }, [appMode]);

  function syncPivotFromSelection() {
    const pivotObject = pivotObjectRef.current;
    if (isDragActiveRef.current) return;

    if (pivotMode === "world") {
      pivotObject.position.set(0, 0, 0);
      pivotObject.quaternion.set(0, 0, 0, 1);
      pivotObject.scale.set(1, 1, 1);
      pivotObject.updateMatrixWorld(true);
      return;
    }

    const primarySelectionId = selectedActuatorId ?? selectedActuatorIds[0] ?? null;
    if (primarySelectionId !== null) {
      const selectedActuator =
        actuators.find((actuator) => actuator.id === primarySelectionId) ??
        actuators.find((actuator) => selectedIdSet.has(actuator.id));
      if (selectedActuator === undefined) return;
      const pivotWorld = getActuatorPivotWorldPosition(selectedActuator);
      pivotObject.position.set(pivotWorld.x, pivotWorld.y, pivotWorld.z);
      pivotObject.quaternion.set(
        selectedActuator.transform.rotation.x,
        selectedActuator.transform.rotation.y,
        selectedActuator.transform.rotation.z,
        selectedActuator.transform.rotation.w,
      );
      pivotObject.scale.set(1, 1, 1);
      pivotObject.updateMatrixWorld(true);
    }
  }

  useEffect(() => {
    syncPivotFromSelection();
  }, [actuators, isTransformDragging, pivotMode, selectedActuatorId, selectedActuatorIds, selectedIdSet]);

  const applyActuatorVisuals = useCallback(() => {
    for (const actuator of actuators) {
      const mat = materialRefs.current[actuator.id];
      if (mat === null || mat === undefined) continue;
      mat.transparent = true;
      mat.depthWrite = false;
      mat.depthTest = true;
      mat.blending = NormalBlending;
      const isSelected = selectedIdSet.has(actuator.id);
      const pointerHovered = gizmoMode !== "draw" && hoveredId === actuator.id;
      const drawHovered = gizmoMode === "draw" && drawHoverActuatorId === actuator.id;
      const state = getActuatorVisualState(isSelected, pointerHovered || drawHovered);
      const visual = getUnityActuatorVisual(actuator, state);
      const modeOpacity = appMode === "Pose" && isSelected ? 1 : opacityRef.current;
      mat.color.setRGB(visual.r, visual.g, visual.b);
      mat.opacity = visual.alpha * modeOpacity;
      mat.needsUpdate = true;
    }
  }, [actuators, appMode, drawHoverActuatorId, gizmoMode, hoveredId, selectedIdSet]);

  useLayoutEffect(() => {
    applyActuatorVisuals();
  }, [applyActuatorVisuals]);

  useFrame((_, delta) => {
    // Rig mode must snap to full visibility immediately to avoid stale pose ghosting.
    if (appMode === "Pose") {
      const dampedOpacity = smoothDampScalar(opacityRef.current, 0.32, opacityVelocityRef.current, 0.22, delta);
      opacityRef.current = dampedOpacity.value;
      opacityVelocityRef.current = dampedOpacity.velocity;
    } else {
      opacityRef.current = 1;
      opacityVelocityRef.current = 0;
    }

    // Keep visuals deterministically synced to selection/hover/preset every frame.
    applyActuatorVisuals();

    if (appMode === "Pose") {
      const blended = smoothDampScalar(
        backgroundBlendRef.current,
        1,
        backgroundBlendVelocityRef.current,
        0.15,
        delta,
      );
      backgroundBlendRef.current = blended.value;
      backgroundBlendVelocityRef.current = blended.velocity;
    } else {
      backgroundBlendRef.current = 0;
      backgroundBlendVelocityRef.current = 0;
    }
    const t = backgroundBlendRef.current;
    blendedBackgroundRef.current.setRGB(
      lightBackground.r + (darkBackground.r - lightBackground.r) * t,
      lightBackground.g + (darkBackground.g - lightBackground.g) * t,
      lightBackground.b + (darkBackground.b - lightBackground.b) * t,
    );
    scene.background = blendedBackgroundRef.current;

    syncPivotFromSelection();
    const controls = transformControlsRef.current;
    if (controls !== null && controls !== undefined) {
      const helper = (controls as any).getHelper?.() ?? controls;
      helper.traverse((object: Object3D) => {
        if (object.name.length === 0) return;
        // Keep gizmo visuals locked to positive axis orientation by
        // removing camera-side sign flips applied via negative scales.
        object.scale.set(
          Math.abs(object.scale.x),
          Math.abs(object.scale.y),
          Math.abs(object.scale.z),
        );
      });
    }

  });

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} />
      <primitive object={pivotObjectRef.current} visible={false} />
      {meshSources.map((meshSource) => (
        <ActiveSkinnedMesh
          key={meshSource.id}
          meshSource={meshSource}
          actuators={actuators}
          appMode={appMode}
          gizmoMode={gizmoMode}
          pendingPoseRevision={pendingPoseRevision}
          simulationSamplesRef={simulationSamplesRef}
          isTransformDragging={isTransformDragging}
          skinningEnabled={skinningEnabled}
          skinningRevision={skinningRevision}
          deltaMushEnabled={deltaMushEnabled}
          deltaMushSettings={deltaMushSettings}
          onSkinningStats={(stats) => onMeshSkinningStats(meshSource.id, stats)}
          onSkinningComputationStatus={(status) => onMeshSkinningComputationStatus(meshSource.id, status)}
          onDrawSurfaceRef={onDrawSurfaceRef}
        />
      ))}

      <Physics
        gravity={[0, -9.81, 0]}
        timeStep={1 / 60}
        interpolate
        numSolverIterations={Math.max(1, Math.round(physicsTuning.solverIterations))}
        numInternalPgsIterations={Math.max(1, Math.round(physicsTuning.internalPgsIterations))}
        paused={!physicsEnabled}
      >
        <RapierAccessBridge
          onReady={(rapier, world) => {
            rapierRef.current = rapier;
            worldRef.current = world;
          }}
        />
        <PosePhysicsBridge
          physicsEnabled={physicsEnabled}
          appMode={appMode}
          actuators={actuators}
          targetActuators={poseTargetActuators}
          bodyRefs={bodyRefById}
          physicsTuning={physicsTuning}
          posePullStateRef={posePullStateRef}
          targetPoseRef={targetPoseRef}
          simulationSamplesRef={simulationSamplesRef}
        />
        <SimulationOverlapFilter physicsEnabled={physicsEnabled} actuators={actuators} colliderRefs={colliderRefById} />
        {actuators.map((actuator) => {
          const isSelected = selectedIdSet.has(actuator.id);
          const pointerHovered = gizmoMode !== "draw" && hoveredId === actuator.id;
          const drawHovered = gizmoMode === "draw" && drawHoverActuatorId === actuator.id;
          const isHovered = pointerHovered || drawHovered;
          const isRoot = actuator.parentId === null;
          const visualState = getActuatorVisualState(isSelected, isHovered);
          const visual = getUnityActuatorVisual(actuator, visualState);
          const center = getActuatorPrimitiveCenter(actuator);
          const capsuleHalfAxis = getCapsuleHalfAxis(actuator.size);
          const radius = getActuatorRadius(actuator);
          const presetSettings = getActuatorPresetSettings(actuator);
          const bodyMass = getActuatorMassFromPreset(actuator);
          const isPoseRoot = physicsEnabled && appMode === "Pose" && isRoot;
          const poseRootMass = isPoseRoot ? Math.max(bodyMass, 40) : bodyMass;
          const bodyType =
            physicsEnabled && appMode === "Pose"
              ? "dynamic"
              : physicsEnabled
                ? (isRoot ? "kinematicPosition" : "dynamic")
                : "kinematicPosition";
          const bodyRef = bodyRefById[actuator.id];

          return (
            <RigidBody
              ref={bodyRef}
              key={`${actuator.id}:${physicsEnabled ? "sim" : "rig"}`}
              type={bodyType}
              colliders={false}
              canSleep={false}
              additionalSolverIterations={
                physicsEnabled
                  ? Math.max(
                      isPoseRoot ? 18 : 0,
                      Math.round(physicsTuning.additionalSolverIterations),
                    )
                  : 0
              }
              linearDamping={
                physicsEnabled
                  ? Math.max(
                      isPoseRoot ? 10 : 0,
                      presetSettings.drag * Math.max(0, physicsTuning.bodyLinearDamping),
                    )
                  : 0
              }
              angularDamping={
                physicsEnabled
                  ? Math.max(
                      isPoseRoot ? 8 : 0,
                      presetSettings.angularDrag * Math.max(0, physicsTuning.bodyAngularDamping),
                    )
                  : 0
              }
              gravityScale={physicsEnabled && isRoot ? 0 : 1}
              enabledRotations={[true, true, true]}
              mass={poseRootMass}
              position={[center.x, center.y, center.z]}
              quaternion={[
                actuator.transform.rotation.x,
                actuator.transform.rotation.y,
                actuator.transform.rotation.z,
                actuator.transform.rotation.w,
              ]}
            >
              <mesh
                ref={(object) => onActuatorRef(actuator.id, object)}
                renderOrder={isSelected ? 2 : isHovered ? 1 : 0}
                onClick={(event) => {
                  if (event.altKey) {
                    event.stopPropagation();
                    return;
                  }
                  if (gizmoMode === "draw") {
                    event.stopPropagation();
                    return;
                  }
                  if (Date.now() < suppressSelectionClickUntilRef.current) {
                    event.stopPropagation();
                    return;
                  }
                  event.stopPropagation();
                  onSelectActuator(actuator.id, {
                    additive: event.shiftKey,
                    toggle: event.ctrlKey || event.metaKey,
                  });
                }}
                onPointerDown={(event) => {
                  if (event.altKey) return;
                  if (gizmoMode === "draw") return;
                  event.stopPropagation();
                  if (!physicsEnabled || appMode !== "Pose") return;
                  if (rapierRef.current === null || worldRef.current === null) return;

                  const body = bodyRefById[actuator.id]?.current;
                  if (body === undefined || body === null) return;

                  const bodyPosition = body.translation();
                  const bodyRotation = body.rotation();
                  if (!isFiniteVec3(bodyPosition) || !isFiniteQuat(bodyRotation)) return;

                  const bodyQ = new Quaternion(bodyRotation.x, bodyRotation.y, bodyRotation.z, bodyRotation.w);
                  const inverseBodyQ = bodyQ.clone().invert();
                  const localGrabPoint = new Vector3(
                    event.point.x - bodyPosition.x,
                    event.point.y - bodyPosition.y,
                    event.point.z - bodyPosition.z,
                  ).applyQuaternion(inverseBodyQ);

                  event.camera.getWorldDirection(posePullPlaneNormalRef.current);
                  if (posePullPlaneNormalRef.current.lengthSq() < 1e-6) {
                    posePullPlaneNormalRef.current.set(0, 0, -1);
                  }
                  posePullPlaneRef.current.setFromNormalAndCoplanarPoint(
                    posePullPlaneNormalRef.current.normalize(),
                    event.point,
                  );

                  const anchorDesc = rapierRef.current.RigidBodyDesc.kinematicPositionBased()
                    .setTranslation(event.point.x, event.point.y, event.point.z)
                    .setCanSleep(false);
                  const anchorBody = worldRef.current.createRigidBody(anchorDesc);
                  anchorBody.setNextKinematicTranslation({ x: event.point.x, y: event.point.y, z: event.point.z });

                  const springJointData = rapierRef.current.JointData.spring(
                    0,
                    Math.max(1, physicsTuning.pullStiffness),
                    Math.max(0, physicsTuning.pullDamping),
                    { x: 0, y: 0, z: 0 },
                    { x: localGrabPoint.x, y: localGrabPoint.y, z: localGrabPoint.z },
                  );
                  const springJoint = worldRef.current.createImpulseJoint(springJointData, anchorBody, body, true);

                  if (posePullJointRef.current !== null && worldRef.current !== null) {
                    worldRef.current.removeImpulseJoint(posePullJointRef.current, true);
                  }
                  if (posePullAnchorBodyRef.current !== null && worldRef.current !== null) {
                    worldRef.current.removeRigidBody(posePullAnchorBodyRef.current);
                  }
                  posePullJointRef.current = springJoint;
                  posePullAnchorBodyRef.current = anchorBody;

                  posePullStateRef.current = {
                    actuatorId: actuator.id,
                    pointerId: event.pointerId,
                    dragPlaneNormal: {
                      x: posePullPlaneRef.current.normal.x,
                      y: posePullPlaneRef.current.normal.y,
                      z: posePullPlaneRef.current.normal.z,
                    },
                    dragPlaneConstant: posePullPlaneRef.current.constant,
                  };
                  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
                  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
                  onPosePullDraggingChange(true);
                  onSelectActuator(actuator.id, {
                    additive: event.shiftKey,
                    toggle: event.ctrlKey || event.metaKey,
                  });

                  const targetElement = event.target as Element;
                  if ("setPointerCapture" in targetElement) {
                    targetElement.setPointerCapture(event.pointerId);
                  }
                }}
                onPointerMove={(event) => {
                  const posePull = posePullStateRef.current;
                  if (
                    posePull === null ||
                    posePull.actuatorId !== actuator.id ||
                    posePull.pointerId !== event.pointerId
                  ) {
                    return;
                  }
                  event.stopPropagation();
                  if (event.altKey) {
                    clearPosePullState();
                    return;
                  }
                  if (event.buttons === 0) {
                    clearPosePullState();
                    return;
                  }

                  posePullPlaneRef.current.set(
                    new Vector3(posePull.dragPlaneNormal.x, posePull.dragPlaneNormal.y, posePull.dragPlaneNormal.z),
                    posePull.dragPlaneConstant,
                  );
                  const hit = event.ray.intersectPlane(posePullPlaneRef.current, posePullHitPointRef.current);
                  if (hit !== null && posePullAnchorBodyRef.current !== null) {
                    posePullAnchorBodyRef.current.setNextKinematicTranslation({ x: hit.x, y: hit.y, z: hit.z });
                  }
                }}
                onPointerUp={(event) => {
                  const posePull = posePullStateRef.current;
                  if (
                    posePull === null ||
                    posePull.actuatorId !== actuator.id ||
                    posePull.pointerId !== event.pointerId
                  ) {
                    return;
                  }
                  event.stopPropagation();
                  const targetElement = event.target as Element;
                  if ("hasPointerCapture" in targetElement && targetElement.hasPointerCapture(event.pointerId)) {
                    targetElement.releasePointerCapture(event.pointerId);
                  }
                  clearPosePullState();
                }}
                onPointerCancel={(event) => {
                  const posePull = posePullStateRef.current;
                  if (
                    posePull === null ||
                    posePull.actuatorId !== actuator.id ||
                    posePull.pointerId !== event.pointerId
                  ) {
                    return;
                  }
                  event.stopPropagation();
                  clearPosePullState();
                }}
                onPointerEnter={(event) => {
                  if (gizmoMode === "draw") return;
                  if (event.altKey) return;
                  event.stopPropagation();
                  setHoveredId(actuator.id);
                }}
                onPointerLeave={() => {
                  if (gizmoMode === "draw") return;
                  setHoveredId((prev) => (prev === actuator.id ? null : prev));
                }}
              >
                {getGeometry(actuator.shape, actuator.size)}
                <meshStandardMaterial
                  ref={(mat) => { materialRefs.current[actuator.id] = mat; }}
                  transparent
                  depthWrite={false}
                  depthTest
                  toneMapped={false}
                  color={new Color(visual.r, visual.g, visual.b)}
                  opacity={visual.alpha * opacityRef.current}
                  roughness={0.58}
                  metalness={0.03}
                />
              </mesh>
              {actuator.shape === "capsule" ? <CapsuleCollider ref={colliderRefById[actuator.id]} args={[capsuleHalfAxis, radius]} /> : null}
              {actuator.shape === "sphere" ? <BallCollider ref={colliderRefById[actuator.id]} args={[radius]} /> : null}
              {actuator.shape === "box" ? (
                <CuboidCollider
                  ref={colliderRefById[actuator.id]}
                  args={[actuator.size.x * 0.5, actuator.size.y * 0.5, actuator.size.z * 0.5]}
                />
              ) : null}
            </RigidBody>
          );
        })}
        {physicsEnabled
          ? actuators.map((actuator) => {
              if (actuator.parentId === null) return null;
              const parent = actuatorById.get(actuator.parentId);
              if (parent === undefined) return null;

              const parentBodyRef = bodyRefById[parent.id];
              const childBodyRef = bodyRefById[actuator.id];
              if (parentBodyRef === undefined || childBodyRef === undefined) return null;

              const anchorWorld = getActuatorPivotWorldPosition(actuator);
              const parentCenter = getActuatorPrimitiveCenter(parent);
              const childCenter = getActuatorPrimitiveCenter(actuator);
              const parentAnchorLocal = worldPointToActuatorLocal(anchorWorld, parentCenter, parent.transform.rotation);
              const childAnchorLocal = worldPointToActuatorLocal(anchorWorld, childCenter, actuator.transform.rotation);

              return (
                <ActuatorSphericalJoint
                  key={`joint:${actuator.id}`}
                  bodyA={parentBodyRef}
                  bodyB={childBodyRef}
                  anchorA={[parentAnchorLocal.x, parentAnchorLocal.y, parentAnchorLocal.z]}
                  anchorB={[childAnchorLocal.x, childAnchorLocal.y, childAnchorLocal.z]}
                />
              );
            })
          : null}

        {selectedActuatorId !== null &&
        !isInXR &&
        !physicsEnabled &&
        (gizmoMode === "translate" || gizmoMode === "rotate" || gizmoMode === "scale") ? (
          <TransformControls
            ref={transformControlsRef}
            mode={gizmoMode}
            space={gizmoSpace}
            size={0.75}
            enabled={!isAltPressed}
            object={pivotObjectRef.current}
            onMouseDown={() => {
              if (isAltPressed) return;
              suppressSelectionClickUntilRef.current = Date.now() + 220;
              hasAcceptedDragFrameRef.current = false;
              syncPivotFromSelection();
              isDragActiveRef.current = true;
              dragActuatorIdRef.current = selectedActuatorId;
              const pivotTarget = pivotObjectRef.current;
              pivotTarget.updateMatrixWorld(true);
              dragStartPivotMatrixRef.current.copy(pivotTarget.matrixWorld);
              dragStartPivotPositionRef.current.setFromMatrixPosition(dragStartPivotMatrixRef.current);
              onTransformStart();
            }}
            onMouseUp={() => {
              suppressSelectionClickUntilRef.current = Date.now() + 220;
              isDragActiveRef.current = false;
              hasAcceptedDragFrameRef.current = false;
              dragActuatorIdRef.current = null;
              onTransformEnd();
            }}
            onObjectChange={() => {
              if (!isDragActiveRef.current) return;
              const actuatorId = dragActuatorIdRef.current;
              if (actuatorId === null) return;

              const pivotObject = pivotObjectRef.current;
              pivotObject.updateMatrixWorld(true);

              const startPivotInverse = dragStartPivotMatrixRef.current.clone().invert();
              const worldDelta = pivotObject.matrixWorld.clone().multiply(startPivotInverse);
              const localDelta = startPivotInverse.clone().multiply(pivotObject.matrixWorld.clone());
              const currentPivotPosition = new Vector3().setFromMatrixPosition(pivotObject.matrixWorld);
              const worldOffset = currentPivotPosition.sub(dragStartPivotPositionRef.current);

              if (!hasAcceptedDragFrameRef.current) {
                // Guard against TransformControls first-frame matrix jump.
                if (worldOffset.length() > 1) {
                  dragStartPivotMatrixRef.current.copy(pivotObject.matrixWorld);
                  dragStartPivotPositionRef.current.setFromMatrixPosition(pivotObject.matrixWorld);
                  return;
                }
                hasAcceptedDragFrameRef.current = true;
              }

              onTransformChange(actuatorId, worldDelta, localDelta, {
                x: worldOffset.x,
                y: worldOffset.y,
                z: worldOffset.z,
              }, {
                includeDescendants: !isShiftPressedRef.current,
              });
            }}
          />
        ) : null}

        <RigidBody type="fixed" colliders="cuboid">
          <mesh
            position={[0, -0.1, 0]}
            receiveShadow
            onClick={(event) => {
              if (event.altKey) return;
              if (gizmoMode === "draw") {
                event.stopPropagation();
                return;
              }
              event.stopPropagation();
              onClearSelection();
            }}
          >
            <boxGeometry args={[200, 0.2, 200]} />
            <meshStandardMaterial color="#4a5563" />
          </mesh>
        </RigidBody>
      </Physics>
    </>
  );
}
