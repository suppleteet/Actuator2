import type { AppMode, GizmoMode } from "./types";
import type { WorkflowTool } from "../runtime/workflow";

export function workflowToolFromGizmoMode(
  gizmoMode: GizmoMode,
  appMode: AppMode,
): WorkflowTool {
  if (appMode === "Pose") return "grab";
  if (gizmoMode === "translate") return "translate";
  if (gizmoMode === "rotate") return "rotate";
  if (gizmoMode === "scale") return "scale";
  if (gizmoMode === "draw") return "draw";
  return "select";
}

export function gizmoModeFromWorkflowTool(tool: WorkflowTool): GizmoMode {
  if (tool === "grab") return "translate";
  if (tool === "translate") return "translate";
  if (tool === "rotate") return "rotate";
  if (tool === "scale") return "scale";
  if (tool === "draw") return "draw";
  return "select";
}

export function extractNumericSuffix(value: string): number {
  const match = value.match(/(\d+)$/);
  if (match === null) return 0;
  return Number.parseInt(match[1] ?? "0", 10) || 0;
}

export function extractActuatorIndex(value: string): number {
  const match = value.match(/_act_(\d+)$/i);
  if (match === null) return 0;
  return Number.parseInt(match[1] ?? "0", 10) || 0;
}

export function downloadTextFile(
  fileName: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
