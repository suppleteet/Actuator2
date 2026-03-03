export type RuntimeMode = "Rig" | "Pose";

export type SimulationTransitionState<TState> = {
  physicsEnabled: boolean;
  appMode: RuntimeMode;
  skinningEnabled: boolean;
  pendingPoseRevision: number | null;
  editorState: TState;
  simulationStartSnapshot: TState | null;
};

export function transitionSimulationEnabled<TState>(
  state: SimulationTransitionState<TState>,
  enabled: boolean,
  cloneState: (value: TState) => TState,
): SimulationTransitionState<TState> {
  if (enabled === state.physicsEnabled) return state;

  if (enabled) {
    return {
      ...state,
      physicsEnabled: true,
      appMode: "Rig",
      skinningEnabled: false,
      pendingPoseRevision: null,
      simulationStartSnapshot: cloneState(state.editorState),
    };
  }

  return {
    ...state,
    physicsEnabled: false,
    editorState: state.simulationStartSnapshot === null ? state.editorState : cloneState(state.simulationStartSnapshot),
    simulationStartSnapshot: null,
  };
}
