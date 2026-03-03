import {
  ACTUATOR_PRESET_OPTIONS,
  DEFAULT_DELTA_MUSH_SETTINGS,
  MIXED_PRESET_VALUE,
} from "../../constants";
import type {
  ActuatorPreset,
  ActuatorShape,
  DeltaMushSettings,
  GizmoMode,
  PivotMode,
} from "../../types";
import type { WorkflowMode } from "../../../runtime/workflow";
import { isToolAllowedForWorkflow } from "../../../runtime/workflow";

export type ToolsPanelProps = {
  appMode: "Rig" | "Pose";
  workflowMode: WorkflowMode;
  workflowAllowsRigAuthoring: boolean;
  workflowAllowsDraw: boolean;
  gizmoMode: GizmoMode;
  gizmoSpace: "world" | "local";
  pivotMode: PivotMode;
  newActuatorShape: ActuatorShape;
  presetSelectValue: string;
  drawRadius: number;
  drawMirrorEnabled: boolean;
  drawSnapEnabled: boolean;
  deltaMushEnabled: boolean;
  deltaMushSettings: DeltaMushSettings;
  onSetGizmoMode: (mode: GizmoMode) => void;
  onSetGizmoSpace: (space: "world" | "local") => void;
  onSetPivotMode: (mode: PivotMode) => void;
  onSetNewActuatorShape: (shape: ActuatorShape) => void;
  onPresetChange: (preset: ActuatorPreset) => void;
  onSetDrawRadius: (value: number) => void;
  onSetDrawMirrorEnabled: (enabled: boolean) => void;
  onSetDrawSnapEnabled: (enabled: boolean) => void;
  onSetDeltaMushEnabled: (enabled: boolean) => void;
  onSetDeltaMushSettings: (settings: DeltaMushSettings | ((prev: DeltaMushSettings) => DeltaMushSettings)) => void;
};

export function ToolsPanel({
  appMode,
  workflowMode,
  workflowAllowsRigAuthoring,
  workflowAllowsDraw,
  gizmoMode,
  gizmoSpace,
  pivotMode,
  newActuatorShape,
  presetSelectValue,
  drawRadius,
  drawMirrorEnabled,
  drawSnapEnabled,
  deltaMushEnabled,
  deltaMushSettings,
  onSetGizmoMode,
  onSetGizmoSpace,
  onSetPivotMode,
  onSetNewActuatorShape,
  onPresetChange,
  onSetDrawRadius,
  onSetDrawMirrorEnabled,
  onSetDrawSnapEnabled,
  onSetDeltaMushEnabled,
  onSetDeltaMushSettings,
}: ToolsPanelProps) {
  return (
    <details className="app__panel-section" open>
      <summary className="app__panel-section-header">Tools</summary>
      <div className="app__panel-section-body">
        <div className="app__panel-tools">
          <div className="app__tool-buttons">
            {appMode === "Pose" ? (
              <button
                type="button"
                className={gizmoMode === "translate" ? "is-selected" : ""}
                onClick={() => onSetGizmoMode("translate")}
                disabled={!isToolAllowedForWorkflow(workflowMode, "grab")}
              >
                Grab (W)
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={gizmoMode === "select" ? "is-selected" : ""}
                  onClick={() => onSetGizmoMode("select")}
                  disabled={!isToolAllowedForWorkflow(workflowMode, "select")}
                >
                  Select (Q)
                </button>
                <button
                  type="button"
                  className={gizmoMode === "translate" ? "is-selected" : ""}
                  onClick={() => onSetGizmoMode("translate")}
                  disabled={!isToolAllowedForWorkflow(workflowMode, "translate")}
                >
                  Move (W)
                </button>
                <button
                  type="button"
                  className={gizmoMode === "rotate" ? "is-selected" : ""}
                  onClick={() => onSetGizmoMode("rotate")}
                  disabled={!isToolAllowedForWorkflow(workflowMode, "rotate")}
                >
                  Rotate (E)
                </button>
                <button
                  type="button"
                  className={gizmoMode === "scale" ? "is-selected" : ""}
                  onClick={() => onSetGizmoMode("scale")}
                  disabled={!isToolAllowedForWorkflow(workflowMode, "scale")}
                >
                  Scale (R)
                </button>
                <button
                  type="button"
                  className={gizmoMode === "draw" ? "is-selected" : ""}
                  onClick={() => onSetGizmoMode("draw")}
                  disabled={!isToolAllowedForWorkflow(workflowMode, "draw")}
                >
                  Draw (D)
                </button>
              </>
            )}
          </div>
          {appMode === "Rig" && workflowAllowsRigAuthoring ? (
            <>
              <div className="app__tool-row app__tool-row--dual">
                <label htmlFor="space-select">Orientation</label>
                <select
                  id="space-select"
                  value={gizmoSpace}
                  onChange={(e) => onSetGizmoSpace(e.target.value as "world" | "local")}
                >
                  <option value="world">World</option>
                  <option value="local">Local</option>
                </select>
                <label htmlFor="pivot-select">Pivot</label>
                <select
                  id="pivot-select"
                  value={pivotMode}
                  onChange={(e) => onSetPivotMode(e.target.value as PivotMode)}
                >
                  <option value="object">Object Center</option>
                  <option value="world">World Origin</option>
                </select>
              </div>
              <div className="app__tool-separator" />
            </>
          ) : null}
          {appMode === "Rig" && workflowAllowsRigAuthoring ? (
            <div className="app__tool-row">
              <label htmlFor="new-actuator-shape">New Actuator</label>
              <select
                id="new-actuator-shape"
                value={newActuatorShape}
                onChange={(e) => onSetNewActuatorShape(e.target.value as ActuatorShape)}
              >
                <option value="capsule">Capsule (Default)</option>
                <option value="sphere">Sphere</option>
                <option value="box">Box</option>
              </select>
            </div>
          ) : null}
          <div className="app__tool-row">
            <label htmlFor="new-actuator-preset">Preset</label>
            <select
              id="new-actuator-preset"
              value={presetSelectValue}
              disabled={!workflowAllowsRigAuthoring}
              onChange={(event) => {
                if (event.target.value === MIXED_PRESET_VALUE) return;
                onPresetChange(event.target.value as ActuatorPreset);
              }}
            >
              {presetSelectValue === MIXED_PRESET_VALUE ? (
                <option value={MIXED_PRESET_VALUE}>Mixed (multi-select)</option>
              ) : null}
              {ACTUATOR_PRESET_OPTIONS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
          </div>
          <div className="app__tool-separator" />
          {appMode === "Rig" && workflowAllowsDraw && gizmoMode === "draw" ? (
            <>
              <div className="app__tool-row">
                <label htmlFor="draw-radius">Draw Radius</label>
                <input
                  id="draw-radius"
                  type="number"
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={drawRadius}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (!Number.isFinite(parsed)) return;
                    onSetDrawRadius(Math.max(0.01, Math.min(1, parsed)));
                  }}
                />
              </div>
              <div className="app__tool-row">
                <label htmlFor="draw-mirror-toggle">Draw Mirror</label>
                <select
                  id="draw-mirror-toggle"
                  value={drawMirrorEnabled ? "on" : "off"}
                  onChange={(e) => onSetDrawMirrorEnabled(e.target.value === "on")}
                >
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </div>
              <div className="app__tool-row">
                <label htmlFor="draw-snap-toggle">Draw Center Snap</label>
                <select
                  id="draw-snap-toggle"
                  value={drawSnapEnabled ? "on" : "off"}
                  onChange={(e) => onSetDrawSnapEnabled(e.target.value === "on")}
                >
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </div>
            </>
          ) : null}
          <details className="app__nested-settings">
            <summary className="app__nested-settings-header">Delta Mush Settings</summary>
            <div className="app__nested-settings-body">
              <div className="app__tool-row">
                <label htmlFor="delta-mush-toggle">Delta Mush</label>
                <select
                  id="delta-mush-toggle"
                  value={deltaMushEnabled ? "on" : "off"}
                  onChange={(e) => onSetDeltaMushEnabled(e.target.value === "on")}
                >
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </div>
              <div className="app__tool-row">
                <label htmlFor="delta-mush-iterations">Mush Iterations</label>
                <input
                  id="delta-mush-iterations"
                  type="number"
                  min={0}
                  max={12}
                  step={1}
                  value={deltaMushSettings.iterations}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    const nextIterations = Number.isFinite(parsed)
                      ? Math.max(0, Math.min(12, Math.round(parsed)))
                      : DEFAULT_DELTA_MUSH_SETTINGS.iterations;
                    onSetDeltaMushSettings((prev) => ({ ...prev, iterations: nextIterations }));
                  }}
                />
              </div>
              <div className="app__tool-row">
                <label htmlFor="delta-mush-strength">Mush Strength</label>
                <input
                  id="delta-mush-strength"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={deltaMushSettings.strength}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    const nextStrength = Number.isFinite(parsed)
                      ? Math.max(0, Math.min(1, parsed))
                      : DEFAULT_DELTA_MUSH_SETTINGS.strength;
                    onSetDeltaMushSettings((prev) => ({ ...prev, strength: nextStrength }));
                  }}
                />
              </div>
            </div>
          </details>
        </div>
      </div>
    </details>
  );
}
