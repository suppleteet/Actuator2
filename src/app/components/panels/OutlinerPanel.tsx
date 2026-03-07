import { useEffect, useRef, useState } from "react";
import type { ActuatorEntity } from "../../types";
import type { ActiveMeshSource } from "../../types";

export type OutlinerEntry =
  | { kind: "rig"; rigId: string; collapsed: boolean }
  | { kind: "mesh"; rigId: string; meshSource: ActiveMeshSource; depth: number }
  | { kind: "node"; actuator: ActuatorEntity; depth: number; hasChildren: boolean };

export type OutlinerPanelProps = {
  entries: OutlinerEntry[];
  selectedActuatorIds: string[];
  selectedMeshSourceId: string | null;
  collapsedNodeIds: ReadonlySet<string>;
  outlinerParentDragSourceId: string | null;
  outlinerParentDropTargetId: string | null;
  onToggleNode: (key: string) => void;
  onBeginParentDrag: (event: React.PointerEvent<HTMLLIElement>, sourceId: string) => void;
  onUpdateParentDropTarget: (targetId: string) => void;
  onClearParentDropTarget: (targetId: string) => void;
  onCompleteParentDrag: (event: React.PointerEvent<HTMLLIElement>, targetId: string) => void;
  onSelectActuator: (id: string, options?: { additive?: boolean; toggle?: boolean }) => void;
  onSelectMesh: (meshId: string) => void;
};

export function OutlinerPanel({
  entries,
  selectedActuatorIds,
  selectedMeshSourceId,
  collapsedNodeIds,
  outlinerParentDragSourceId,
  outlinerParentDropTargetId,
  onToggleNode,
  onBeginParentDrag,
  onUpdateParentDropTarget,
  onClearParentDropTarget,
  onCompleteParentDrag,
  onSelectActuator,
  onSelectMesh,
}: OutlinerPanelProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [scrollHeight, setScrollHeight] = useState<number | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const header = headerRef.current;
    if (!wrap || !header) return;
    const measure = () => {
      const wrapRect = wrap.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const available = Math.max(0, wrapRect.height - headerRect.height);
      setScrollHeight(available);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    ro.observe(header);
    measure();
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="app__outliner-fill">
      <details className="app__panel-section app__panel-section--fill" open>
        <summary ref={headerRef} className="app__panel-section-header">Outliner</summary>
        <div
          className="app__panel-section-body app__panel-section-body--fill"
          style={scrollHeight !== null ? { height: scrollHeight, minHeight: scrollHeight } : undefined}
        >
          <ul className="app__outliner">
          {entries.map((entry) => {
            if (entry.kind === "rig") {
              return (
                <li key={`rig:${entry.rigId}`} className="app__outliner-rig">
                  <button
                    type="button"
                    className="app__outliner-toggle"
                    onClick={() => onToggleNode(`rig:${entry.rigId}`)}
                    aria-label={entry.collapsed ? "Expand rig" : "Collapse rig"}
                  >
                    {entry.collapsed ? ">" : "v"}
                  </button>
                  <span className="app__outliner-icon app__outliner-icon--rig" />
                  <span className="app__outliner-rig-label">{entry.rigId}</span>
                </li>
              );
            }
            if (entry.kind === "mesh") {
              const { meshSource, depth, rigId } = entry;
              const isMeshSelected = selectedMeshSourceId === meshSource.id;
              return (
                <li
                  key={`mesh:${rigId}:${meshSource.id}`}
                  className={`app__outliner-item app__outliner-item--mesh${isMeshSelected ? " is-selected" : ""}`}
                >
                  <span className="app__outliner-indent" style={{ width: depth * 16 + 4 }} />
                  <button type="button" className="app__outliner-toggle" disabled tabIndex={-1} aria-hidden>
                    {" "}
                  </button>
                  <span className="app__outliner-icon app__outliner-icon--mesh" />
                  <button
                    type="button"
                    className="app__outliner-label"
                    onClick={() => onSelectMesh(meshSource.id)}
                  >
                    {meshSource.id}
                  </button>
                </li>
              );
            }
            const { actuator, depth, hasChildren } = entry;
            const isSelected = selectedActuatorIds.includes(actuator.id);
            const isParentDragSource = outlinerParentDragSourceId === actuator.id;
            const isParentDropTarget = outlinerParentDropTargetId === actuator.id;
            return (
              <li
                key={actuator.id}
                className={
                  `app__outliner-item${isSelected ? " is-selected" : ""}` +
                  `${isParentDragSource ? " is-parent-drag-source" : ""}` +
                  `${isParentDropTarget ? " is-parent-drop-target" : ""}`
                }
                onPointerDown={(event) => onBeginParentDrag(event, actuator.id)}
                onPointerEnter={() => onUpdateParentDropTarget(actuator.id)}
                onPointerLeave={() => onClearParentDropTarget(actuator.id)}
                onPointerUp={(event) => onCompleteParentDrag(event, actuator.id)}
              >
                <span className="app__outliner-indent" style={{ width: depth * 16 + 4 }} />
                <button
                  type="button"
                  className="app__outliner-toggle"
                  onClick={() => onToggleNode(actuator.id)}
                  disabled={!hasChildren}
                  tabIndex={-1}
                  aria-label={collapsedNodeIds.has(actuator.id) ? "Expand" : "Collapse"}
                >
                  {hasChildren ? (collapsedNodeIds.has(actuator.id) ? ">" : "v") : ""}
                </button>
                <span
                  className={`app__outliner-icon app__outliner-icon--${actuator.type === "root" ? "root" : actuator.shape}`}
                />
                <button
                  type="button"
                  className="app__outliner-label"
                  onClick={(event) =>
                    onSelectActuator(actuator.id, {
                      additive: event.shiftKey,
                      toggle: event.ctrlKey || event.metaKey,
                    })
                  }
                >
                  {actuator.id}
                </button>
              </li>
            );
          })}
          </ul>
        </div>
      </details>
    </div>
  );
}
