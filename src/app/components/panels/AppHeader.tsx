import type { AppMode } from "../../types";
import type { WorkflowMode, WorkflowTool } from "../../../runtime/workflow";

export type AppHeaderProps = {
  workflowMode: WorkflowMode;
  appMode: AppMode;
  physicsEnabled: boolean;
  workflowTool: WorkflowTool;
  skinningBusy: boolean;
  completedSkinningRevision: number;
  xrMode: XRSessionMode | null;
  vrSupported: boolean;
  xrBusy: boolean;
  onRequestWorkflowMode: (mode: WorkflowMode) => void;
  onEnterVr: () => void;
  onExitVr: () => void;
};

export function AppHeader({
  workflowMode,
  appMode,
  physicsEnabled,
  workflowTool,
  skinningBusy,
  completedSkinningRevision,
  xrMode,
  vrSupported,
  xrBusy,
  onRequestWorkflowMode,
  onEnterVr,
  onExitVr,
}: AppHeaderProps) {
  return (
    <header className="app__header">
      <div className="app__header-top">
        <h1>Actuator2</h1>
        <span className="app__header-status">
          {workflowMode} workflow | {appMode} runtime{physicsEnabled ? " | sim on" : ""} | tool {workflowTool} | skin{" "}
          {skinningBusy ? "rebuilding..." : `ready (rev ${completedSkinningRevision})`}
        </span>
      </div>
      <div className="app__actions">
        <button
          type="button"
          onClick={() => onRequestWorkflowMode("Rigging")}
          disabled={workflowMode === "Rigging"}
        >
          Rigging
        </button>
        <button
          type="button"
          onClick={() => onRequestWorkflowMode("Animation")}
          disabled={workflowMode === "Animation"}
        >
          Animation
        </button>
        <button
          type="button"
          onClick={() => onRequestWorkflowMode("Puppeteering")}
          disabled={workflowMode === "Puppeteering" || skinningBusy}
        >
          Puppeteering
        </button>
        <button
          type="button"
          onClick={xrMode === null ? onEnterVr : onExitVr}
          disabled={xrBusy || (xrMode === null && !vrSupported)}
          title={xrMode === null && !vrSupported ? "WebXR immersive VR is not available on this device/browser." : undefined}
        >
          {xrMode === null ? "Enter VR" : "Exit VR"}
        </button>
        <span className="app__header-hint">Alt+LMB orbit | MMB pan | RMB zoom | Shift+wheel draw radius</span>
      </div>
    </header>
  );
}
