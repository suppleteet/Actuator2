import { describe, expect, it } from "vitest";
import {
  allowedToolsForWorkflow,
  isToolAllowedForWorkflow,
  transitionWorkflowState,
  type WorkflowState,
} from "../runtime/workflow";

describe("Workflow mode transitions", () => {
  it("clamps disallowed tools when entering Animation", () => {
    const initial: WorkflowState = {
      workflowMode: "Rigging",
      runtimeMode: "Rig",
      physicsEnabled: false,
      activeTool: "draw",
    };

    const result = transitionWorkflowState(initial, "Animation");
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.state.workflowMode).toBe("Animation");
    expect(result.state.runtimeMode).toBe("Rig");
    expect(result.state.physicsEnabled).toBe(false);
    expect(result.state.activeTool).toBe("select");
  });

  it("rejects Puppeteering transitions while skinning is busy", () => {
    const initial: WorkflowState = {
      workflowMode: "Animation",
      runtimeMode: "Rig",
      physicsEnabled: false,
      activeTool: "select",
    };

    const result = transitionWorkflowState(initial, "Puppeteering", { skinningBusy: true });
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reason).toBe("SkinningBusy");
    expect(result.state).toEqual(initial);
  });

  it("is deterministic for equal event sequences", () => {
    const run = () => {
      let state: WorkflowState = {
        workflowMode: "Rigging",
        runtimeMode: "Rig",
        physicsEnabled: false,
        activeTool: "translate",
      };

      const sequence = ["Animation", "Puppeteering", "Rigging"] as const;
      for (const nextMode of sequence) {
        const result = transitionWorkflowState(state, nextMode, { skinningBusy: false });
        expect(result.accepted).toBe(true);
        if (!result.accepted) continue;
        state = result.state;
      }
      return state;
    };

    expect(run()).toEqual(run());
  });

  it("reports expected tool gates per workflow", () => {
    expect(allowedToolsForWorkflow("Rigging")).toContain("draw");
    expect(isToolAllowedForWorkflow("Animation", "draw")).toBe(false);
    expect(isToolAllowedForWorkflow("Puppeteering", "grab")).toBe(true);
    expect(isToolAllowedForWorkflow("Puppeteering", "select")).toBe(false);
  });
});
