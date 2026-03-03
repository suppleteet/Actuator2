import type { BakeCache } from "../../../animation/bakeCache";
import type { SkinningStats } from "../../types";
import type { WorkflowMode } from "../../../runtime/workflow";

export type StatusPanelProps = {
  sceneId: string;
  workflowMode: WorkflowMode;
  selectedRigId: string;
  selectedActuatorId: string | null;
  selectedActuatorIds: string[];
  skinningStats: SkinningStats;
  lastBakeCache: BakeCache | null;
};

export function StatusPanel({
  sceneId,
  workflowMode,
  selectedRigId,
  selectedActuatorId,
  selectedActuatorIds,
  skinningStats,
  lastBakeCache,
}: StatusPanelProps) {
  return (
    <details className="app__panel-section app__panel-section--status" open>
      <summary className="app__panel-section-header">Status</summary>
      <div className="app__panel-section-body">
        <div className="app__panel-status">
          <strong>Scene:</strong> {sceneId} | <strong>Workflow:</strong> {workflowMode} | <strong>Rig:</strong>{" "}
          {selectedRigId} | <strong>Selected:</strong>{" "}
          {selectedActuatorIds.length === 0
            ? "none"
            : `${selectedActuatorIds.length} (active: ${selectedActuatorId})`}
          <br />
          <strong>Skin:</strong> {skinningStats.vertexCount} verts | {skinningStats.capsuleCount} capsules | avg w{" "}
          {skinningStats.averageWeight.toFixed(3)} | <strong>Bake:</strong>{" "}
          {lastBakeCache === null ? "none" : `${lastBakeCache.cacheId} (${lastBakeCache.frames.length} frames)`}
        </div>
      </div>
    </details>
  );
}
