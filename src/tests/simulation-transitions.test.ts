import { describe, expect, it } from "vitest";
import { transitionSimulationEnabled, type SimulationTransitionState } from "../runtime/simulationTransitions";

type TinyEditorState = {
  actuators: Array<{ id: string; position: number }>;
};

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("Simulation mode transitions", () => {
  it("captures a deterministic snapshot when simulation starts", () => {
    const initial: SimulationTransitionState<TinyEditorState> = {
      physicsEnabled: false,
      appMode: "Pose",
      skinningEnabled: true,
      pendingPoseRevision: 12,
      editorState: {
        actuators: [{ id: "root", position: 1 }],
      },
      simulationStartSnapshot: null,
    };

    const started = transitionSimulationEnabled(initial, true, cloneState);
    expect(started.physicsEnabled).toBe(true);
    expect(started.appMode).toBe("Rig");
    expect(started.skinningEnabled).toBe(false);
    expect(started.pendingPoseRevision).toBeNull();
    expect(started.simulationStartSnapshot).toEqual(initial.editorState);
    expect(started.simulationStartSnapshot).not.toBe(initial.editorState);
  });

  it("restores authoring state deterministically when simulation stops", () => {
    const baselineState: TinyEditorState = {
      actuators: [{ id: "root", position: 1 }],
    };
    const baseline: SimulationTransitionState<TinyEditorState> = {
      physicsEnabled: false,
      appMode: "Rig",
      skinningEnabled: false,
      pendingPoseRevision: null,
      editorState: baselineState,
      simulationStartSnapshot: null,
    };

    const started = transitionSimulationEnabled(baseline, true, cloneState);
    const runtimeMutated = {
      ...started,
      editorState: {
        actuators: [{ id: "root", position: 99 }],
      },
    };
    const stoppedA = transitionSimulationEnabled(runtimeMutated, false, cloneState);

    const startedAgain = transitionSimulationEnabled(stoppedA, true, cloneState);
    const runtimeMutatedAgain = {
      ...startedAgain,
      editorState: {
        actuators: [{ id: "root", position: -25 }],
      },
    };
    const stoppedB = transitionSimulationEnabled(runtimeMutatedAgain, false, cloneState);

    expect(stoppedA.physicsEnabled).toBe(false);
    expect(stoppedA.editorState).toEqual(baselineState);
    expect(stoppedB.editorState).toEqual(baselineState);
  });
});
