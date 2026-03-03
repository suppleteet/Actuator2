import type { RefObject } from "react";
import type { ActuatorEntity } from "../../types";

export type ActionsPanelProps = {
  workflowAllowsRigAuthoring: boolean;
  physicsEnabled: boolean;
  appMode: "Rig" | "Pose";
  actuators: ActuatorEntity[];
  selectedActuatorIds: string[];
  undoStackLength: number;
  redoStackLength: number;
  ioStatus: string;
  meshImportStatus: string;
  sceneLoadInputRef: RefObject<HTMLInputElement | null>;
  meshImportInputRef: RefObject<HTMLInputElement | null>;
  onCreateRig: () => void;
  onCreateActuator: () => void;
  onDeleteSelected: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSaveScene: () => void;
  onRequestLoadScene: () => void;
  onRequestImportMesh: () => void;
  onSceneFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onMeshFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export function ActionsPanel({
  workflowAllowsRigAuthoring,
  physicsEnabled,
  appMode,
  actuators,
  selectedActuatorIds,
  undoStackLength,
  redoStackLength,
  ioStatus,
  meshImportStatus,
  sceneLoadInputRef,
  meshImportInputRef,
  onCreateRig,
  onCreateActuator,
  onDeleteSelected,
  onUndo,
  onRedo,
  onSaveScene,
  onRequestLoadScene,
  onRequestImportMesh,
  onSceneFileChange,
  onMeshFileChange,
}: ActionsPanelProps) {
  const canDelete =
    workflowAllowsRigAuthoring &&
    !physicsEnabled &&
    selectedActuatorIds.length > 0 &&
    !selectedActuatorIds.every((id) => actuators.find((a) => a.id === id)?.parentId === null);

  return (
    <details className="app__panel-section" open>
      <summary className="app__panel-section-header">Actions</summary>
      <div className="app__panel-section-body">
        <div className="app__panel-actions">
          <button type="button" onClick={onCreateRig} disabled={!workflowAllowsRigAuthoring || physicsEnabled}>
            Create Rig
          </button>
          <button type="button" onClick={onCreateActuator} disabled={!workflowAllowsRigAuthoring || physicsEnabled}>
            Create Actuator
          </button>
          <button type="button" onClick={onDeleteSelected} disabled={!canDelete}>
            Delete Selected
          </button>
          <button
            type="button"
            onClick={onUndo}
            disabled={(appMode === "Rig" && physicsEnabled) || (appMode === "Rig" && undoStackLength === 0)}
          >
            Undo
          </button>
          <button type="button" onClick={onRedo} disabled={physicsEnabled || redoStackLength === 0}>
            Redo
          </button>
          <button type="button" onClick={onSaveScene}>
            Save Scene
          </button>
          <button type="button" onClick={onRequestLoadScene}>
            Load Scene
          </button>
          <button type="button" onClick={onRequestImportMesh}>
            Import Mesh
          </button>
          <input
            ref={sceneLoadInputRef}
            type="file"
            accept=".json,.a2scene"
            style={{ display: "none" }}
            onChange={onSceneFileChange}
          />
          <input
            ref={meshImportInputRef}
            type="file"
            accept=".fbx,.glb,.gltf,.obj"
            style={{ display: "none" }}
            onChange={onMeshFileChange}
          />
        </div>
        <div className="app__tool-separator" />
        <div className="app__panel-status">
          <strong>IO:</strong> {ioStatus}
          <br />
          <strong>Import:</strong> {meshImportStatus}
        </div>
      </div>
    </details>
  );
}
