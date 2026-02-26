# Timeline + Recording Contract v0

## Capture Targets
- Actuator local transforms
- Expression channels (look, blink, custom)

## Concepts
- Track: owns keys for one target channel.
- Clip: bounded time region referencing one or more tracks.
- Layer: additive or override composition group.

## Rules
- Recording never mutates bind pose data.
- Playback is deterministic for equal input data.
- Layer blend order is explicit and serialized.

## Deterministic Timing
- Clip sampling time domain is `[0, durationSec]`.
- Runtime playback uses fixed-step tick size `1 / fps`.
- `play` from stopped starts at `t=0`.
- `stop` resets timeline time to `t=0`.
- `scrub(t)` clamps to `[0, durationSec]` before evaluation.

## Playback Actions
- `record`: capture live actuator transform edits over time into clip tracks.
- `play`: evaluate tracks over deterministic playback clock.
- `stop`: halt playback and reset to start pose.
- `scrub`: evaluate exact pose at requested timeline time without advancing clock.

## Determinism Validation Baseline
- Equal capture input sequence must generate equal clip data.
- Equal clip + equal scrub time must generate equal sampled pose.
- Equal clip + equal play event sequence must generate equal per-step sampled pose sequence.
