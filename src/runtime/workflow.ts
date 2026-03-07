export type WorkflowMode = "Rigging" | "Animation" | "Puppeteering";
export type RuntimeMode = "Rig" | "Pose";
export type WorkflowTool = "select" | "translate" | "rotate" | "scale" | "draw" | "grab";

export type WorkflowTransitionRejectionReason = "SkinningBusy";

export type WorkflowState = {
  workflowMode: WorkflowMode;
  runtimeMode: RuntimeMode;
  physicsEnabled: boolean;
  activeTool: WorkflowTool;
};

export type WorkflowTransitionResult =
  | {
      accepted: true;
      state: WorkflowState;
    }
  | {
      accepted: false;
      reason: WorkflowTransitionRejectionReason;
      state: WorkflowState;
    };

const TOOL_GATING: Record<WorkflowMode, readonly WorkflowTool[]> = {
  Rigging: ["select", "translate", "rotate", "scale", "draw", "grab"],
  Animation: ["select", "grab"],
  Puppeteering: ["grab"],
};

const DEFAULT_TOOL_BY_WORKFLOW: Record<WorkflowMode, WorkflowTool> = {
  Rigging: "translate",
  Animation: "select",
  Puppeteering: "grab",
};

const RUNTIME_MODE_BY_WORKFLOW: Record<WorkflowMode, RuntimeMode> = {
  Rigging: "Rig",
  Animation: "Rig",
  Puppeteering: "Pose",
};

const PHYSICS_BY_WORKFLOW: Record<WorkflowMode, boolean> = {
  Rigging: false,
  Animation: false,
  Puppeteering: true,
};

export function allowedToolsForWorkflow(workflowMode: WorkflowMode): readonly WorkflowTool[] {
  return TOOL_GATING[workflowMode];
}

export function isToolAllowedForWorkflow(workflowMode: WorkflowMode, tool: WorkflowTool): boolean {
  return TOOL_GATING[workflowMode].includes(tool);
}

export function clampToolToWorkflow(workflowMode: WorkflowMode, tool: WorkflowTool): WorkflowTool {
  return isToolAllowedForWorkflow(workflowMode, tool) ? tool : DEFAULT_TOOL_BY_WORKFLOW[workflowMode];
}

export function transitionWorkflowState(
  current: WorkflowState,
  requestedMode: WorkflowMode,
  options?: {
    skinningBusy?: boolean;
  },
): WorkflowTransitionResult {
  if (requestedMode === "Puppeteering" && options?.skinningBusy === true) {
    return {
      accepted: false,
      reason: "SkinningBusy",
      state: current,
    };
  }

  const nextState: WorkflowState = {
    workflowMode: requestedMode,
    runtimeMode: RUNTIME_MODE_BY_WORKFLOW[requestedMode],
    physicsEnabled: PHYSICS_BY_WORKFLOW[requestedMode],
    activeTool: clampToolToWorkflow(requestedMode, current.activeTool),
  };

  return {
    accepted: true,
    state: nextState,
  };
}
