import * as React from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { HeadLockedUI } from "./common/HeadLockedUI";
import { GradientBackground } from "./common/PanelElements";
import { AlignmentLines } from "./AlignmentLines";

interface HeadTrackingAlignmentProps {
  enabled: boolean;
  targetCornerPosition: THREE.Vector3 | null;
  instruction: string;
  onConfirm: (position: THREE.Vector3, depth: number) => void;
  onCancel?: () => void;
}

export function HeadTrackingAlignment({
  enabled,
  targetCornerPosition,
  instruction,
  onConfirm,
  onCancel,
}: HeadTrackingAlignmentProps) {
  const camera = useThree((state) => state.camera);
  const [currentPosition, setCurrentPosition] = React.useState<THREE.Vector3 | null>(null);
  const [currentDepth, setCurrentDepth] = React.useState<number>(0);
  const [gazeStartTime, setGazeStartTime] = React.useState<number | null>(null);
  const gazeThreshold = 2000; // 2 seconds of looking at target
  const selectionDistance = 0.15; // Distance threshold for selection

  useFrame(() => {
    if (!enabled || !targetCornerPosition) {
      setGazeStartTime(null);
      return;
    }

    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);

    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    // Calculate where the user is looking (raycast forward)
    const rayLength = 5.0; // Maximum ray length
    const lookAtPoint = new THREE.Vector3()
      .addVectors(cameraPosition, cameraDirection.multiplyScalar(rayLength));

    // Project target corner onto the camera's view direction
    const toTarget = new THREE.Vector3().subVectors(targetCornerPosition, cameraPosition);
    const distance = toTarget.length();
    const targetDirection = toTarget.normalize();
    const dot = cameraDirection.dot(targetDirection);

    // Check if user is looking at the target
    const isLookingAtTarget = dot > 0.9 && distance < 3.0;

    // Update current position based on where user is looking
    // Use the depth of the target corner
    const depth = distance;
    const alignedPosition = lookAtPoint.clone();
    
    // Adjust position to match the depth of the target corner
    const depthAdjustedPosition = new THREE.Vector3()
      .addVectors(cameraPosition, cameraDirection.multiplyScalar(depth));

    setCurrentPosition(depthAdjustedPosition);
    setCurrentDepth(depth);

    // Check if user has been looking at target for threshold time
    if (isLookingAtTarget) {
      const now = Date.now();
      if (gazeStartTime === null) {
        setGazeStartTime(now);
      } else if (now - gazeStartTime >= gazeThreshold) {
        // User has been looking at target long enough, confirm alignment
        onConfirm(depthAdjustedPosition, depth);
        setGazeStartTime(null);
      }
    } else {
      setGazeStartTime(null);
    }
  });

  if (!enabled || !targetCornerPosition) return null;

  const progress = gazeStartTime
    ? Math.min(1, (Date.now() - gazeStartTime) / gazeThreshold)
    : 0;

  return (
    <>
      {/* Alignment Lines - positioned at current gaze position */}
      <AlignmentLines
        enabled={enabled}
        cornerPosition={currentPosition}
        onPositionUpdate={(pos, depth) => {
          setCurrentPosition(pos);
          setCurrentDepth(depth);
        }}
        lineColor="#00ff00"
      />

      {/* Instruction Panel */}
      <HeadLockedUI distance={1.5} verticalOffset={0.2}>
        <group>
          <mesh position={[0, 0, -0.02]}>
            <GradientBackground
              width={1.0}
              height={0.5}
              radius={0.1}
              color1="#EAF4FA"
              color2="#F0F2F5"
              opacity={0.9}
            />
          </mesh>
          <Text
            position={[0, 0.15, 0.01]}
            fontSize={0.04}
            color="#334155"
            anchorX="center"
            anchorY="middle"
            fontWeight="bold"
          >
            {instruction}
          </Text>
          <Text
            position={[0, 0.05, 0.01]}
            fontSize={0.03}
            color="#64748B"
            anchorX="center"
            anchorY="middle"
          >
            Move your head to align the lines
          </Text>
          <Text
            position={[0, -0.05, 0.01]}
            fontSize={0.025}
            color="#64748B"
            anchorX="center"
            anchorY="middle"
          >
            Look at the target corner to confirm
          </Text>

          {/* Progress bar */}
          {progress > 0 && (
            <group position={[0, -0.15, 0.01]}>
              <mesh position={[0, 0, 0]}>
                <planeGeometry args={[0.8, 0.03]} />
                <meshStandardMaterial color="#64748B" opacity={0.3} transparent />
              </mesh>
              <mesh position={[-0.4 + (0.4 * progress), 0, 0.01]}>
                <planeGeometry args={[0.8 * progress, 0.03]} />
                <meshStandardMaterial color="#00ff00" opacity={0.8} transparent />
              </mesh>
            </group>
          )}
        </group>
      </HeadLockedUI>
    </>
  );
}

