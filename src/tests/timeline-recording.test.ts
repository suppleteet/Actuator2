import { describe, expect, it } from "vitest";
import { PlaybackClock, createSyntheticRecording, evaluateClipAtTime } from "../animation/recorder";

const ACTUATORS = [
  {
    id: "act_root",
    transform: {
      position: { x: 0, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    },
  },
  {
    id: "act_0001",
    transform: {
      position: { x: 0.2, y: 1.3, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    },
  },
];

describe("Timeline + recording contract baseline", () => {
  it("synthetic recorder is deterministic for equal input", () => {
    const a = createSyntheticRecording(ACTUATORS, { fps: 24, durationSec: 3 });
    const b = createSyntheticRecording(ACTUATORS, { fps: 24, durationSec: 3 });
    expect(a).toEqual(b);
  });

  it("fixed-step playback clock is deterministic across different delta chunking", () => {
    const clockA = new PlaybackClock(30, 1);
    const clockB = new PlaybackClock(30, 1);
    clockA.start();
    clockB.start();

    const timesA: number[] = [];
    const timesB: number[] = [];

    for (let i = 0; i < 60; i += 1) {
      timesA.push(...clockA.tick(1 / 60));
    }

    const chunks = [0.05, 0.01, 0.07, 0.04, 0.03, 0.12, 0.08, 0.1, 0.04, 0.46];
    for (const delta of chunks) {
      timesB.push(...clockB.tick(delta));
    }

    expect(timesA).toEqual(timesB);
  });

  it("clip evaluation returns stable sampled values for known time", () => {
    const clip = createSyntheticRecording(ACTUATORS, { fps: 20, durationSec: 2 });
    const samples = evaluateClipAtTime(clip, 0.8);
    const first = samples.get("act_0001");
    expect(first).toBeDefined();
    expect(Number.isFinite(first!.position.x)).toBe(true);
    expect(Number.isFinite(first!.rotation.w)).toBe(true);
  });
});
