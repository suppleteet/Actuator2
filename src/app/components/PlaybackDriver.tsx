import { useFrame } from "@react-three/fiber";

type PlaybackDriverProps = {
  onStep: (deltaSec: number) => void;
};

export function PlaybackDriver({ onStep }: PlaybackDriverProps) {
  useFrame((_, delta) => {
    onStep(delta);
  });
  return null;
}
