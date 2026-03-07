import { useMemo, useState } from "react";
import type { ImportedMeshDocument } from "../../../runtime/scenePersistence";
import type { ActuatorEntity, ActuatorPhysicsOverrides, Quat, Vec3 } from "../../types";
import {
  getActuatorMass,
  getActuatorPresetSettings,
  type ActuatorPresetSettings,
} from "../../../runtime/physicsPresets";
import { getActuatorColliderVolume } from "../../../runtime/physicsAuthoring";

const MIXED = "\u2014"; // em dash for mixed values

function quatToEulerDegrees(q: Quat): Vec3 {
  const { x, y, z, w } = q;
  const siny = 2 * (w * y - z * x);
  const yaw = Math.abs(siny) >= 1 ? Math.sign(siny) * (Math.PI / 2) : Math.asin(siny);
  const pitch =
    Math.abs(w * x + y * z) >= 0.5
      ? Math.sign(w * x + y * z) * (Math.PI / 2)
      : Math.atan2(2 * (w * x - y * z), 1 - 2 * (x * x + y * y));
  const roll =
    Math.abs(w * z + x * y) >= 0.5
      ? Math.sign(w * z + x * y) * (Math.PI / 2)
      : Math.atan2(2 * (w * z - x * y), 1 - 2 * (y * y + z * z));
  return {
    x: (pitch * 180) / Math.PI,
    y: (yaw * 180) / Math.PI,
    z: (roll * 180) / Math.PI,
  };
}

function eulerDegreesToQuat(e: Vec3): Quat {
  const x = (e.x * Math.PI) / 180;
  const y = (e.y * Math.PI) / 180;
  const z = (e.z * Math.PI) / 180;
  const cy = Math.cos(y * 0.5);
  const sy = Math.sin(y * 0.5);
  const cp = Math.cos(x * 0.5);
  const sp = Math.sin(x * 0.5);
  const cr = Math.cos(z * 0.5);
  const sr = Math.sin(z * 0.5);
  return {
    w: cr * cp * cy + sr * sp * sy,
    x: sr * cp * cy - cr * sp * sy,
    y: cr * sp * cy + sr * cp * sy,
    z: cr * cp * sy - sr * sp * cy,
  };
}

function formatNum(v: number, decimals = 3): string {
  if (!Number.isFinite(v)) return "";
  return v.toFixed(decimals);
}

function parseNum(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Slider with optional number input; when multi-select and values differ, show mixed and don't commit until user edits. */
function SliderRow({
  label,
  value,
  mixed,
  min,
  max,
  step = 0.01,
  onChange,
  title,
}: {
  label: string;
  value: number;
  mixed: boolean;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  title?: string;
}) {
  const [local, setLocal] = useState<string | null>(null);
  const display = local !== null ? local : (mixed ? MIXED : formatNum(value));
  return (
    <div className="app__properties-row" title={title}>
      <label className="app__properties-label">{label}</label>
      <div className="app__properties-slider-wrap">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={mixed ? min : value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="app__properties-slider"
        />
        <input
          type="text"
          className="app__properties-input"
          value={display}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => {
            if (local !== null) {
              const n = parseNum(local);
              onChange(Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : value);
              setLocal(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && local !== null) {
              const n = parseNum(local);
              onChange(Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : value);
              setLocal(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>
    </div>
  );
}

function NumRow({
  label,
  value,
  mixed,
  onChange,
  step: _step = 0.01,
  decimals = 3,
}: {
  label: string;
  value: number;
  mixed: boolean;
  onChange: (v: number) => void;
  step?: number;
  decimals?: number;
}) {
  const [local, setLocal] = useState<string | null>(null);
  const display = local !== null ? local : (mixed ? MIXED : formatNum(value, decimals));
  return (
    <div className="app__properties-row">
      <label className="app__properties-label">{label}</label>
      <input
        type="text"
        className="app__properties-input"
        value={display}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== null) {
            const n = parseNum(local);
            onChange(Number.isFinite(n) ? n : value);
            setLocal(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && local !== null) {
            const n = parseNum(local);
            onChange(Number.isFinite(n) ? n : value);
            setLocal(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

function Vec3Row({
  label,
  value,
  mixed,
  onChange,
  decimals = 3,
}: {
  label: string;
  value: Vec3;
  mixed: boolean;
  onChange: (v: Vec3) => void;
  decimals?: number;
}) {
  const dx = mixed ? MIXED : formatNum(value.x, decimals);
  const dy = mixed ? MIXED : formatNum(value.y, decimals);
  const dz = mixed ? MIXED : formatNum(value.z, decimals);
  return (
    <div className="app__properties-row app__properties-row--vec3">
      <label className="app__properties-label">{label}</label>
      <div className="app__properties-vec3">
        <input
          type="text"
          className="app__properties-input"
          placeholder="X"
          value={dx}
          onChange={(e) => {
            if (e.target.value === MIXED) return;
            const n = parseNum(e.target.value);
            if (Number.isFinite(n)) onChange({ ...value, x: n });
          }}
        />
        <input
          type="text"
          className="app__properties-input"
          placeholder="Y"
          value={dy}
          onChange={(e) => {
            if (e.target.value === MIXED) return;
            const n = parseNum(e.target.value);
            if (Number.isFinite(n)) onChange({ ...value, y: n });
          }}
        />
        <input
          type="text"
          className="app__properties-input"
          placeholder="Z"
          value={dz}
          onChange={(e) => {
            if (e.target.value === MIXED) return;
            const n = parseNum(e.target.value);
            if (Number.isFinite(n)) onChange({ ...value, z: n });
          }}
        />
      </div>
    </div>
  );
}

export type PropertiesPanelProps = {
  actuators: ActuatorEntity[];
  selectedActuatorIds: string[];
  selectedMeshSourceId: string | null;
  importedMeshes: ImportedMeshDocument[];
  worldGravityY: number;
  onWorldGravityYChange: (y: number) => void;
  onTransformChange: (ids: string[], transform: Partial<{ position: Vec3; rotation: Quat; scale: Vec3; size: Vec3 }>) => void;
  onPhysicsOverridesChange: (ids: string[], overrides: ActuatorPhysicsOverrides) => void;
  onMeshImportSettingsChange: (
    meshId: string,
    patch: Partial<{ upAxis: ImportedMeshDocument["upAxis"]; importScale: number; positionOffset: Vec3; rotationOffset: Vec3; flipNormals: boolean }>,
  ) => void;
};

export function PropertiesPanel({
  actuators,
  selectedActuatorIds,
  selectedMeshSourceId,
  importedMeshes,
  worldGravityY,
  onWorldGravityYChange,
  onTransformChange,
  onPhysicsOverridesChange,
  onMeshImportSettingsChange,
}: PropertiesPanelProps) {
  const selectedMesh = useMemo(
    () => (selectedMeshSourceId ? importedMeshes.find((m) => m.id === selectedMeshSourceId) ?? null : null),
    [importedMeshes, selectedMeshSourceId],
  );

  const selected = useMemo(() => {
    const set = new Set(selectedActuatorIds);
    return actuators.filter((a) => set.has(a.id));
  }, [actuators, selectedActuatorIds]);

  const single = selected.length === 1 ? selected[0] : null;
  const multi = selected.length > 1;

  const same = useMemo(() => {
    if (selected.length <= 1) return { position: true, rotation: true, scale: true, size: true };
    const f = selected[0];
    let position = true,
      rotation = true,
      scale = true,
      size = true;
    for (let i = 1; i < selected.length; i++) {
      const a = selected[i];
      if (a.transform.position.x !== f.transform.position.x || a.transform.position.y !== f.transform.position.y || a.transform.position.z !== f.transform.position.z) position = false;
      if (a.transform.rotation.x !== f.transform.rotation.x || a.transform.rotation.y !== f.transform.rotation.y || a.transform.rotation.z !== f.transform.rotation.z || a.transform.rotation.w !== f.transform.rotation.w) rotation = false;
      if (a.transform.scale.x !== f.transform.scale.x || a.transform.scale.y !== f.transform.scale.y || a.transform.scale.z !== f.transform.scale.z) scale = false;
      if (a.size.x !== f.size.x || a.size.y !== f.size.y || a.size.z !== f.size.z) size = false;
    }
    return { position, rotation, scale, size };
  }, [selected]);

  const effectiveSettings = useMemo(() => {
    const map = new Map<string, ActuatorPresetSettings>();
    selected.forEach((a) => map.set(a.id, getActuatorPresetSettings(a)));
    return map;
  }, [selected]);

  const massByActuator = useMemo(() => {
    const map = new Map<string, number>();
    selected.forEach((a) => map.set(a.id, getActuatorMass(a, getActuatorColliderVolume)));
    return map;
  }, [selected]);

  const samePhysics = useMemo(() => {
    if (selected.length <= 1) return true;
    const first = effectiveSettings.get(selected[0].id);
    if (!first) return true;
    const keys: (keyof ActuatorPresetSettings)[] = [
      "mass",
      "drag",
      "angularDrag",
      "driveRotationSpring",
      "driveRotationDamper",
      "angularXLowLimit",
      "angularXHighLimit",
      "angularYLimit",
      "angularZLimit",
    ];
    for (let i = 1; i < selected.length; i++) {
      const s = effectiveSettings.get(selected[i].id);
      if (!s) return false;
      for (const k of keys) {
        if ((first as any)[k] !== (s as any)[k]) return false;
      }
    }
    return true;
  }, [selected, effectiveSettings]);

  const applyTransform = (patch: Partial<{ position: Vec3; rotation: Quat; scale: Vec3; size: Vec3 }>) => {
    if (selectedActuatorIds.length === 0) return;
    onTransformChange(selectedActuatorIds, patch);
  };

  const applyPhysics = (overrides: ActuatorPhysicsOverrides) => {
    if (selectedActuatorIds.length === 0) return;
    onPhysicsOverridesChange(selectedActuatorIds, overrides);
  };

  if (selected.length === 0 && selectedMesh === null) {
    return (
      <div className="app__properties-panel">
        <div className="app__properties-empty">Select an actuator or mesh</div>
        <details className="app__panel-section" open>
          <summary className="app__panel-section-header">Scene</summary>
          <div className="app__panel-section-body">
            <SliderRow
              label="Gravity (Y)"
              value={worldGravityY}
              mixed={false}
              min={-30}
              max={0}
              step={0.5}
              onChange={onWorldGravityYChange}
              title="World gravity (m/s²)"
            />
          </div>
        </details>
      </div>
    );
  }

  if (selectedMesh !== null) {
    const upAxis = selectedMesh.upAxis === "Z" ? "Z" : "Y";
    const importScale = Number.isFinite(selectedMesh.importScale) ? selectedMesh.importScale! : 1;
    const positionOffset = selectedMesh.positionOffset ?? { x: 0, y: 0, z: 0 };
    const rotationOffset = selectedMesh.rotationOffset ?? { x: 0, y: 0, z: 0 };
    const flipNormals = selectedMesh.flipNormals === true;
    return (
      <div className="app__properties-panel">
        <div className="app__properties-header">{selectedMesh.id}</div>
        <details className="app__panel-section" open>
          <summary className="app__panel-section-header">Import</summary>
          <div className="app__panel-section-body">
            <div className="app__properties-row">
              <label className="app__properties-label">Up axis</label>
              <select
                className="app__properties-input"
                value={upAxis}
                onChange={(e) => onMeshImportSettingsChange(selectedMesh.id, { upAxis: e.target.value === "Z" ? "Z" : "Y" })}
              >
                <option value="Y">Y up</option>
                <option value="Z">Z up</option>
              </select>
            </div>
            <NumRow
              label="Import scale"
              value={importScale}
              mixed={false}
              onChange={(v) => onMeshImportSettingsChange(selectedMesh.id, { importScale: v })}
              decimals={4}
            />
            <Vec3Row
              label="Position offset"
              value={positionOffset}
              mixed={false}
              onChange={(v) => onMeshImportSettingsChange(selectedMesh.id, { positionOffset: v })}
            />
            <Vec3Row
              label="Rotation offset (°)"
              value={rotationOffset}
              mixed={false}
              onChange={(v) => onMeshImportSettingsChange(selectedMesh.id, { rotationOffset: v })}
            />
            <div className="app__properties-row">
              <label className="app__properties-label">Flip normals</label>
              <input
                type="checkbox"
                className="app__properties-checkbox"
                checked={flipNormals}
                onChange={(e) => onMeshImportSettingsChange(selectedMesh.id, { flipNormals: e.target.checked })}
                title="Fix inside-out meshes"
              />
            </div>
          </div>
        </details>
        <details className="app__panel-section" open>
          <summary className="app__panel-section-header">Scene</summary>
          <div className="app__panel-section-body">
            <SliderRow
              label="Gravity (Y)"
              value={worldGravityY}
              mixed={false}
              min={-30}
              max={0}
              step={0.5}
              onChange={onWorldGravityYChange}
              title="World gravity (m/s²)"
            />
          </div>
        </details>
      </div>
    );
  }

  const pos = single ? single.transform.position : selected[0].transform.position;
  const rotEuler = single ? quatToEulerDegrees(single.transform.rotation) : quatToEulerDegrees(selected[0].transform.rotation);
  const scl = single ? single.transform.scale : selected[0].transform.scale;
  const size = single ? single.size : selected[0].size;
  const settings = single ? effectiveSettings.get(single.id)! : effectiveSettings.get(selected[0].id)!;
  const mass = single ? massByActuator.get(single.id)! : massByActuator.get(selected[0].id)!;

  return (
    <div className="app__properties-panel">
      <div className="app__properties-header">
        {selected.length === 1 ? selected[0].id : `${selected.length} selected`}
      </div>

      <details className="app__panel-section" open>
        <summary className="app__panel-section-header">Transform</summary>
        <div className="app__panel-section-body">
          <Vec3Row
            label="Position"
            value={pos}
            mixed={multi && !same.position}
            onChange={(v) => applyTransform({ position: v })}
          />
          <Vec3Row
            label="Rotation (°)"
            value={rotEuler}
            mixed={multi && !same.rotation}
            onChange={(v) => applyTransform({ rotation: eulerDegreesToQuat(v) })}
          />
          <Vec3Row
            label="Scale"
            value={scl}
            mixed={multi && !same.scale}
            onChange={(v) => applyTransform({ scale: v })}
          />
        </div>
      </details>

      <details className="app__panel-section" open>
        <summary className="app__panel-section-header">Rigidbody</summary>
        <div className="app__panel-section-body">
          <SliderRow
            label="Mass"
            value={mass}
            mixed={multi && !samePhysics}
            min={0.01}
            max={100}
            step={0.1}
            onChange={(v) => applyPhysics({ mass: v })}
            title="Mass (kg); scaled by collider volume when from preset"
          />
          <SliderRow
            label="Linear damping"
            value={settings.drag}
            mixed={multi && !samePhysics}
            min={0}
            max={10}
            step={0.05}
            onChange={(v) => applyPhysics({ drag: v })}
          />
          <SliderRow
            label="Angular damping"
            value={settings.angularDrag}
            mixed={multi && !samePhysics}
            min={0}
            max={5}
            step={0.01}
            onChange={(v) => applyPhysics({ angularDrag: v })}
          />
          <SliderRow
            label="Gravity (world Y)"
            value={worldGravityY}
            mixed={false}
            min={-30}
            max={0}
            step={0.5}
            onChange={onWorldGravityYChange}
            title="World gravity (m/s²)"
          />
        </div>
      </details>

      <details className="app__panel-section" open>
        <summary className="app__panel-section-header">Joint</summary>
        <div className="app__panel-section-body">
          <SliderRow
            label="Rotation stiffness"
            value={settings.driveRotationSpring}
            mixed={multi && !samePhysics}
            min={0}
            max={20000}
            step={100}
            onChange={(v) => applyPhysics({ driveRotationSpring: v })}
            title="Drive rotation spring (stiffness)"
          />
          <SliderRow
            label="Rotation damping"
            value={settings.driveRotationDamper}
            mixed={multi && !samePhysics}
            min={0}
            max={200}
            step={1}
            onChange={(v) => applyPhysics({ driveRotationDamper: v })}
          />
          <NumRow
            label="Angular X low (°)"
            value={settings.angularXLowLimit}
            mixed={multi && !samePhysics}
            onChange={(v) => applyPhysics({ angularXLowLimit: v })}
          />
          <NumRow
            label="Angular X high (°)"
            value={settings.angularXHighLimit}
            mixed={multi && !samePhysics}
            onChange={(v) => applyPhysics({ angularXHighLimit: v })}
          />
          <NumRow
            label="Angular Y limit (°)"
            value={settings.angularYLimit}
            mixed={multi && !samePhysics}
            onChange={(v) => applyPhysics({ angularYLimit: v })}
          />
          <NumRow
            label="Angular Z limit (°)"
            value={settings.angularZLimit}
            mixed={multi && !samePhysics}
            onChange={(v) => applyPhysics({ angularZLimit: v })}
          />
        </div>
      </details>

      <details className="app__panel-section" open>
        <summary className="app__panel-section-header">Collider</summary>
        <div className="app__panel-section-body">
          <div className="app__properties-row">
            <label className="app__properties-label">Shape</label>
            <span className="app__properties-readonly">{single ? single.shape : (selected.every((a) => a.shape === selected[0].shape) ? selected[0].shape : MIXED)}</span>
          </div>
          <Vec3Row
            label="Size"
            value={size}
            mixed={multi && !same.size}
            onChange={(v) => applyTransform({ size: v })}
            decimals={4}
          />
        </div>
      </details>
    </div>
  );
}
