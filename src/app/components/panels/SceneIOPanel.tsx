import type { BakeCache } from "../../../animation/bakeCache";
import type { ExportFormatId } from "../../../animation/exportPipeline";

export type ExportCapability = { format: string; label: string; status: string };

export type SceneIOPanelProps = {
  workflowMode: string;
  workflowAllowsAnimationLane: boolean;
  bakeStartFrame: number;
  bakeEndFrame: number;
  exportFormat: ExportFormatId;
  exportCapabilities: ExportCapability[];
  lastBakeCache: BakeCache | null;
  exportStatus: string;
  onBakeStartFrameChange: (value: number) => void;
  onBakeEndFrameChange: (value: number) => void;
  onCaptureBake: () => void;
  onExportFormatChange: (format: ExportFormatId) => void;
  onExportBake: () => void;
};

export function SceneIOPanel({
  workflowMode,
  workflowAllowsAnimationLane,
  bakeStartFrame,
  bakeEndFrame,
  exportFormat,
  exportCapabilities,
  lastBakeCache,
  exportStatus,
  onBakeStartFrameChange,
  onBakeEndFrameChange,
  onCaptureBake,
  onExportFormatChange,
  onExportBake,
}: SceneIOPanelProps) {
  return (
    <details className="app__panel-section" open>
      <summary className="app__panel-section-header">Scene IO + Export</summary>
      <div className="app__panel-section-body">
        <div className="app__tool-row app__tool-row--dual">
          <label htmlFor="bake-start-frame">Bake Start</label>
          <input
            id="bake-start-frame"
            type="number"
            step={1}
            value={bakeStartFrame}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (!Number.isFinite(parsed)) return;
              onBakeStartFrameChange(Math.max(0, Math.round(parsed)));
            }}
          />
          <label htmlFor="bake-end-frame">Bake End</label>
          <input
            id="bake-end-frame"
            type="number"
            step={1}
            value={bakeEndFrame}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (!Number.isFinite(parsed)) return;
              onBakeEndFrameChange(Math.max(0, Math.round(parsed)));
            }}
          />
        </div>
        <div className="app__panel-actions">
          <button
            type="button"
            onClick={onCaptureBake}
            disabled={!workflowAllowsAnimationLane && workflowMode !== "Puppeteering"}
          >
            Capture Bake
          </button>
          <label htmlFor="export-format">Export Format</label>
          <select
            id="export-format"
            value={exportFormat}
            onChange={(event) => onExportFormatChange(event.target.value as ExportFormatId)}
          >
            {exportCapabilities.map((capability) => (
              <option key={capability.format} value={capability.format}>
                {capability.label} ({capability.status})
              </option>
            ))}
          </select>
          <button type="button" onClick={onExportBake} disabled={lastBakeCache === null}>
            Export Bake
          </button>
        </div>
        <div className="app__panel-status">
          <strong>Export:</strong> {exportStatus}
        </div>
      </div>
    </details>
  );
}
