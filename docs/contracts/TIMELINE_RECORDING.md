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
