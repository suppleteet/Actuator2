import { createContext, useContext, type ReactNode } from "react";
import type { EditorState } from "./types";
import type { WorkflowMode } from "../runtime/workflow";

/**
 * Minimal editor context for optional consumption by deep components.
 * Panels currently receive state/actions as props; use this when prop drilling is not practical.
 */
export type EditorContextState = {
  editorState: EditorState;
  workflowMode: WorkflowMode;
  selectedActuatorIds: string[];
};

export type EditorContextValue = {
  state: EditorContextState;
};

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({
  value,
  children,
}: {
  value: EditorContextValue;
  children: ReactNode;
}) {
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditorContext(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (ctx === null) throw new Error("useEditorContext must be used within EditorProvider");
  return ctx;
}
