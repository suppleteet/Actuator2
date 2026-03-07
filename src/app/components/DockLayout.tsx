import { useCallback, useEffect, useRef } from "react";
import { DockviewReact } from "dockview";
import type { DockviewReadyEvent, IDockviewPanelProps } from "dockview";
import type { SerializedDockview } from "dockview-core";
import { DockPanelProvider, useDockPanelContext } from "./DockPanelContext";
import { UI_LAYOUT_STORAGE_KEY } from "../constants";
import { ActionsPanel } from "./panels/ActionsPanel";
import { ToolsPanel } from "./panels/ToolsPanel";
import { SceneIOPanel } from "./panels/SceneIOPanel";
import { OutlinerPanel } from "./panels/OutlinerPanel";
import { StatusPanel } from "./panels/StatusPanel";
import { PropertiesPanel } from "./panels/PropertiesPanel";

const PANEL_IDS = {
  scene: "scene",
  actions: "actions",
  tools: "tools",
  sceneIO: "sceneIO",
  outliner: "outliner",
  status: "status",
  properties: "properties",
} as const;

function ActionsPanelWrapper(_props: IDockviewPanelProps) {
  const ctx = useDockPanelContext();
  return (
    <div className="app__dock-panel-content">
      <ActionsPanel {...ctx.actions} />
    </div>
  );
}

function ToolsPanelWrapper(_props: IDockviewPanelProps) {
  const ctx = useDockPanelContext();
  return (
    <div className="app__dock-panel-content">
      <ToolsPanel {...ctx.tools} />
    </div>
  );
}

function SceneIOPanelWrapper(_props: IDockviewPanelProps) {
  const ctx = useDockPanelContext();
  return (
    <div className="app__dock-panel-content">
      <SceneIOPanel {...ctx.sceneIO} />
    </div>
  );
}

function OutlinerPanelWrapper(_props: IDockviewPanelProps) {
  const ctx = useDockPanelContext();
  return (
    <div className="app__dock-panel-content app__dock-panel-content--outliner">
      <OutlinerPanel {...ctx.outliner} />
    </div>
  );
}

function StatusPanelWrapper(_props: IDockviewPanelProps) {
  const ctx = useDockPanelContext();
  return (
    <div className="app__dock-panel-content">
      <StatusPanel {...ctx.status} />
    </div>
  );
}

function PropertiesPanelWrapper(_props: IDockviewPanelProps) {
  const ctx = useDockPanelContext();
  return (
    <div className="app__dock-panel-content">
      <PropertiesPanel {...ctx.properties} />
    </div>
  );
}

function ScenePanelWrapper(_props: IDockviewPanelProps) {
  const ctx = useDockPanelContext();
  return <div className="app__dock-panel-content app__dock-panel-scene">{ctx.sceneContent}</div>;
}

const components = {
  [PANEL_IDS.actions]: ActionsPanelWrapper,
  [PANEL_IDS.tools]: ToolsPanelWrapper,
  [PANEL_IDS.sceneIO]: SceneIOPanelWrapper,
  [PANEL_IDS.outliner]: OutlinerPanelWrapper,
  [PANEL_IDS.status]: StatusPanelWrapper,
  [PANEL_IDS.properties]: PropertiesPanelWrapper,
  [PANEL_IDS.scene]: ScenePanelWrapper,
};

export type DockLayoutProps = {
  panelContextValue: import("./DockPanelContext").DockPanelContextValue;
};

function DockLayoutInner({ panelContextValue }: DockLayoutProps) {
  const layoutBuiltRef = useRef(false);
  const layoutDisposableRef = useRef<{ dispose: () => void } | null>(null);

  useEffect(() => {
    return () => {
      layoutBuiltRef.current = false;
      layoutDisposableRef.current?.dispose();
      layoutDisposableRef.current = null;
    };
  }, []);

  const buildDefaultLayout = useCallback((api: DockviewReadyEvent["api"]) => {
    api.addPanel({
      id: PANEL_IDS.scene,
      component: PANEL_IDS.scene,
      title: "Scene",
    });

    api.addPanel({
      id: PANEL_IDS.actions,
      component: PANEL_IDS.actions,
      title: "Actions",
      position: { referencePanel: PANEL_IDS.scene, direction: "left" },
    });

    api.addPanel({
      id: PANEL_IDS.tools,
      component: PANEL_IDS.tools,
      title: "Tools",
      position: { referencePanel: PANEL_IDS.actions, direction: "below" },
    });

    api.addPanel({
      id: PANEL_IDS.sceneIO,
      component: PANEL_IDS.sceneIO,
      title: "Scene IO",
      position: { referencePanel: PANEL_IDS.tools, direction: "below" },
    });

    api.addPanel({
      id: PANEL_IDS.outliner,
      component: PANEL_IDS.outliner,
      title: "Hierarchy",
      position: { referencePanel: PANEL_IDS.sceneIO, direction: "below" },
    });

    api.addPanel({
      id: PANEL_IDS.status,
      component: PANEL_IDS.status,
      title: "Status",
      position: { referencePanel: PANEL_IDS.outliner, direction: "below" },
    });

    api.addPanel({
      id: PANEL_IDS.properties,
      component: PANEL_IDS.properties,
      title: "Properties",
      position: { referencePanel: PANEL_IDS.scene, direction: "right" },
    });
  }, []);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    if (layoutBuiltRef.current) return;
    layoutBuiltRef.current = true;

    let restored = false;
    try {
      const raw = localStorage.getItem(UI_LAYOUT_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as unknown;
        if (
          saved &&
          typeof saved === "object" &&
          "grid" in saved &&
          "panels" in saved
        ) {
          api.fromJSON(saved as SerializedDockview);
          restored = true;
        }
      }
    } catch {
      // Invalid or missing layout: use default
    }
    if (!restored) {
      buildDefaultLayout(api);
    }

    layoutDisposableRef.current?.dispose();
    layoutDisposableRef.current = api.onDidLayoutChange(() => {
      try {
        const serialized = api.toJSON();
        localStorage.setItem(UI_LAYOUT_STORAGE_KEY, JSON.stringify(serialized));
      } catch {
        // Ignore save errors (e.g. private window)
      }
    });
  }, [buildDefaultLayout]);

  return (
    <DockPanelProvider value={panelContextValue}>
      <div className="dockview-theme-dark app__dockview-wrap">
        <DockviewReact
          components={components}
          onReady={onReady}
          className="app__dockview"
        />
      </div>
    </DockPanelProvider>
  );
}

export function DockLayout(props: DockLayoutProps) {
  return <DockLayoutInner {...props} />;
}
