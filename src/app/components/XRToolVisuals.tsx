import { useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { useXRInputSourceState } from "@react-three/xr";
import { Color, Group, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import type { XRHandedness, XRToolId } from "../../interaction/xrTools";
import { resolvePublicAssetUrl } from "../../runtime/assetPaths";

export type XRToolVisualsProps = {
  visible: boolean;
  activeToolByHand: Record<XRHandedness, XRToolId>;
  altModeByHand: Record<XRHandedness, boolean>;
};

const TOOL_OFFSET_Z = 0.025;
const TOOL_DRAW_ALT_OFFSET_Z = -0.135;
const TOOL_SCALE = 0.01;

const TOOL_TINT_BY_ID: Record<XRToolId, string> = {
  drawActuator: "#7ba8ff",
  grab: "#7dd2ff",
  adjust: "#ffd082",
  select: "#95e0a4",
};

function cloneToolModel(source: Object3D, tintHex: string): Object3D {
  const tint = new Color(tintHex);
  const clone = source.clone(true);
  clone.traverse((object) => {
    if (!(object as Mesh).isMesh) return;
    const mesh = object as Mesh;
    const current = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const sourceColor = (current as { color?: Color } | null)?.color;
    const baseColor = sourceColor === undefined ? tint : sourceColor;
    mesh.material = new MeshStandardMaterial({
      color: baseColor,
      roughness: 0.55,
      metalness: 0.08,
    });
    mesh.castShadow = true;
    mesh.receiveShadow = false;
  });
  return clone;
}

function buildToolVariants(assets: Record<XRToolId, Object3D>): Record<XRToolId, Object3D> {
  return {
    drawActuator: cloneToolModel(assets.drawActuator, TOOL_TINT_BY_ID.drawActuator),
    grab: cloneToolModel(assets.grab, TOOL_TINT_BY_ID.grab),
    adjust: cloneToolModel(assets.adjust, TOOL_TINT_BY_ID.adjust),
    select: cloneToolModel(assets.select, TOOL_TINT_BY_ID.select),
  };
}

function syncToolAnchor(anchor: Group | null, sourceObject: Object3D | undefined, visible: boolean) {
  if (anchor === null) return;
  if (!visible || sourceObject === undefined) {
    anchor.visible = false;
    return;
  }
  const worldPosition = new Vector3();
  const worldQuaternion = new Quaternion();
  sourceObject.getWorldPosition(worldPosition);
  sourceObject.getWorldQuaternion(worldQuaternion);
  anchor.visible = true;
  anchor.position.copy(worldPosition);
  anchor.quaternion.copy(worldQuaternion);
}

export function XRToolVisuals({ visible, activeToolByHand, altModeByHand }: XRToolVisualsProps) {
  const leftController = useXRInputSourceState("controller", "left");
  const rightController = useXRInputSourceState("controller", "right");

  const drawToolAsset = useLoader(FBXLoader, resolvePublicAssetUrl("assets/tools/DrawActuatorTool.fbx"));
  const grabToolAsset = useLoader(FBXLoader, resolvePublicAssetUrl("assets/tools/GrabTool.fbx"));
  const adjustToolAsset = useLoader(FBXLoader, resolvePublicAssetUrl("assets/tools/AdjustTool.fbx"));
  const selectToolAsset = useLoader(FBXLoader, resolvePublicAssetUrl("assets/tools/SelectTool.fbx"));

  const leftVariants = useMemo(
    () =>
      buildToolVariants({
        drawActuator: drawToolAsset,
        grab: grabToolAsset,
        adjust: adjustToolAsset,
        select: selectToolAsset,
      }),
    [adjustToolAsset, drawToolAsset, grabToolAsset, selectToolAsset],
  );

  const rightVariants = useMemo(
    () =>
      buildToolVariants({
        drawActuator: drawToolAsset,
        grab: grabToolAsset,
        adjust: adjustToolAsset,
        select: selectToolAsset,
      }),
    [adjustToolAsset, drawToolAsset, grabToolAsset, selectToolAsset],
  );

  const leftAnchorRef = useRef<Group>(null);
  const rightAnchorRef = useRef<Group>(null);

  useFrame(() => {
    syncToolAnchor(leftAnchorRef.current, leftController?.object, visible);
    syncToolAnchor(rightAnchorRef.current, rightController?.object, visible);
  });

  const leftDrawAlt = activeToolByHand.left === "drawActuator" && altModeByHand.left;
  const rightDrawAlt = activeToolByHand.right === "drawActuator" && altModeByHand.right;

  const leftOffsetZ = leftDrawAlt ? TOOL_DRAW_ALT_OFFSET_Z : TOOL_OFFSET_Z;
  const rightOffsetZ = rightDrawAlt ? TOOL_DRAW_ALT_OFFSET_Z : TOOL_OFFSET_Z;
  const leftRotationY = leftDrawAlt ? Math.PI : 0;
  const rightRotationY = rightDrawAlt ? Math.PI : 0;

  const leftScale = altModeByHand.left && !leftDrawAlt ? TOOL_SCALE * 1.08 : TOOL_SCALE;
  const rightScale = altModeByHand.right && !rightDrawAlt ? TOOL_SCALE * 1.08 : TOOL_SCALE;

  const toolIds = ["drawActuator", "grab", "adjust", "select"] as const;

  return (
    <>
      <group ref={leftAnchorRef} visible={false}>
        <group position={[0, 0, leftOffsetZ]} rotation={[0, leftRotationY, 0]} scale={leftScale}>
          {toolIds.map((toolId) => (
            <primitive
              key={`left-${toolId}`}
              object={leftVariants[toolId]}
              visible={visible && activeToolByHand.left === toolId}
            />
          ))}
        </group>
      </group>

      <group ref={rightAnchorRef} visible={false}>
        <group position={[0, 0, rightOffsetZ]} rotation={[0, rightRotationY, 0]} scale={rightScale}>
          {toolIds.map((toolId) => (
            <primitive
              key={`right-${toolId}`}
              object={rightVariants[toolId]}
              visible={visible && activeToolByHand.right === toolId}
            />
          ))}
        </group>
      </group>
    </>
  );
}
