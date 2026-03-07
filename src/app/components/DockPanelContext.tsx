import { createContext, useContext, type ReactNode } from "react";
import type { ActionsPanelProps } from "./panels/ActionsPanel";
import type { ToolsPanelProps } from "./panels/ToolsPanel";
import type { SceneIOPanelProps } from "./panels/SceneIOPanel";
import type { OutlinerPanelProps } from "./panels/OutlinerPanel";
import type { StatusPanelProps } from "./panels/StatusPanel";
import type { PropertiesPanelProps } from "./panels/PropertiesPanel";

export type DockPanelContextValue = {
  actions: ActionsPanelProps;
  tools: ToolsPanelProps;
  sceneIO: SceneIOPanelProps;
  outliner: OutlinerPanelProps;
  status: StatusPanelProps;
  properties: PropertiesPanelProps;
  /** Scene (canvas) panel: content to render inside the dock panel. */
  sceneContent: ReactNode;
};

const DockPanelContext = createContext<DockPanelContextValue | null>(null);

export function DockPanelProvider({
  value,
  children,
}: {
  value: DockPanelContextValue;
  children: ReactNode;
}) {
  return (
    <DockPanelContext.Provider value={value}>
      {children}
    </DockPanelContext.Provider>
  );
}

export function useDockPanelContext(): DockPanelContextValue {
  const ctx = useContext(DockPanelContext);
  if (ctx === null) throw new Error("useDockPanelContext must be used within DockPanelProvider");
  return ctx;
}
