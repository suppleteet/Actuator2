import { Quaternion, Vector3 } from "three";

export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };

export type TransformSample = {
  time: number;
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
};

export type TransformTrack = {
  actuatorId: string;
  samples: TransformSample[];
};

export type SyntheticClip = {
  clipId: string;
  fps: number;
  durationSec: number;
  tracks: TransformTrack[];
};

type ActuatorLike = {
  id: string;
  transform: {
    position: Vec3;
    rotation: Quat;
    scale: Vec3;
  };
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function toQuat(value: Quaternion): Quat {
  return { x: value.x, y: value.y, z: value.z, w: value.w };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function createSyntheticRecording(
  actuators: ActuatorLike[],
  options?: { fps?: number; durationSec?: number; clipId?: string },
): SyntheticClip {
  const fps = options?.fps ?? 30;
  const durationSec = options?.durationSec ?? 4;
  const clipId = options?.clipId ?? "clip_synthetic_001";
  const frameCount = Math.max(2, Math.floor(durationSec * fps) + 1);

  const tracks: TransformTrack[] = actuators.map((actuator) => {
    const hash = hashString(actuator.id);
    const phase = ((hash % 360) * Math.PI) / 180;
    const frequency = 0.65 + (hash % 5) * 0.08;
    const amplitude = actuator.id === "act_root" ? 0 : 0.03 + (hash % 7) * 0.01;
    const yawAmplitude = actuator.id === "act_root" ? 0 : 0.07 + (hash % 4) * 0.01;

    const basePosition = actuator.transform.position;
    const baseScale = actuator.transform.scale;
    const baseRotation = new Quaternion(
      actuator.transform.rotation.x,
      actuator.transform.rotation.y,
      actuator.transform.rotation.z,
      actuator.transform.rotation.w,
    );

    const samples: TransformSample[] = [];
    for (let frame = 0; frame < frameCount; frame += 1) {
      const time = frame / fps;
      const wave = Math.sin(time * Math.PI * 2 * frequency + phase);
      const xWave = Math.cos(time * Math.PI * 2 * frequency + phase * 0.7);

      const rotationDelta = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), wave * yawAmplitude);
      const rotation = baseRotation.clone().multiply(rotationDelta);

      samples.push({
        time,
        position: {
          x: basePosition.x + xWave * amplitude * 0.4,
          y: basePosition.y + wave * amplitude,
          z: basePosition.z,
        },
        rotation: toQuat(rotation),
        scale: { ...baseScale },
      });
    }

    return { actuatorId: actuator.id, samples };
  });

  return { clipId, fps, durationSec, tracks };
}

export function evaluateClipAtTime(clip: SyntheticClip, time: number): Map<string, TransformSample> {
  const t = clamp01(time / Math.max(clip.durationSec, 0.0001)) * clip.durationSec;
  const result = new Map<string, TransformSample>();

  for (const track of clip.tracks) {
    if (track.samples.length === 0) continue;
    if (track.samples.length === 1 || t <= track.samples[0].time) {
      result.set(track.actuatorId, track.samples[0]);
      continue;
    }

    const last = track.samples[track.samples.length - 1];
    if (t >= last.time) {
      result.set(track.actuatorId, last);
      continue;
    }

    let idx = 0;
    while (idx + 1 < track.samples.length && track.samples[idx + 1].time < t) idx += 1;
    const a = track.samples[idx];
    const b = track.samples[idx + 1];
    const range = Math.max(b.time - a.time, 0.000001);
    const localT = clamp01((t - a.time) / range);

    const qa = new Quaternion(a.rotation.x, a.rotation.y, a.rotation.z, a.rotation.w);
    const qb = new Quaternion(b.rotation.x, b.rotation.y, b.rotation.z, b.rotation.w);
    const q = qa.slerp(qb, localT);

    result.set(track.actuatorId, {
      time: t,
      position: {
        x: lerp(a.position.x, b.position.x, localT),
        y: lerp(a.position.y, b.position.y, localT),
        z: lerp(a.position.z, b.position.z, localT),
      },
      rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
      scale: {
        x: lerp(a.scale.x, b.scale.x, localT),
        y: lerp(a.scale.y, b.scale.y, localT),
        z: lerp(a.scale.z, b.scale.z, localT),
      },
    });
  }

  return result;
}

export class PlaybackClock {
  private readonly stepSec: number;
  private readonly durationSec: number;
  private accumulatorSec = 0;
  private timeSec = 0;
  private playing = false;

  constructor(fps: number, durationSec: number) {
    this.stepSec = 1 / Math.max(fps, 1);
    this.durationSec = Math.max(durationSec, this.stepSec);
  }

  start() {
    this.playing = true;
    this.accumulatorSec = 0;
    this.timeSec = 0;
  }

  stop() {
    this.playing = false;
    this.accumulatorSec = 0;
    this.timeSec = 0;
  }

  getTimeSec() {
    return this.timeSec;
  }

  isPlaying() {
    return this.playing;
  }

  tick(deltaSec: number): number[] {
    if (!this.playing) return [];

    this.accumulatorSec += deltaSec;
    const emittedTimes: number[] = [];

    while (this.accumulatorSec >= this.stepSec) {
      this.accumulatorSec -= this.stepSec;
      this.timeSec += this.stepSec;
      if (this.timeSec > this.durationSec) {
        this.timeSec = this.durationSec;
      }
      emittedTimes.push(this.timeSec);

      if (this.timeSec >= this.durationSec) {
        this.playing = false;
        this.accumulatorSec = 0;
        break;
      }
    }

    return emittedTimes;
  }
}
