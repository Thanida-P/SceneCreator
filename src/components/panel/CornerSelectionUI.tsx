import * as React from "react";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { HeadLockedUI } from "./common/HeadLockedUI";
import { RoundedPlane, GradientBackground } from "./common/PanelElements";

interface CornerSelectionUIProps {
  show: boolean;
  corners: Array<{ position: THREE.Vector3; index: number }>;
  onCornerSelect: (index: number) => void;
}

export function CornerSelectionUI({
  show,
  corners,
  onCornerSelect,
}: CornerSelectionUIProps) {
  const [hoveredCorner, setHoveredCorner] = React.useState<number | null>(null);
  const camera = useThree((state) => state.camera);
  const raycaster = React.useMemo(() => new THREE.Raycaster(), []);

  // Handle gaze-based selection
  useFrame(() => {
    if (!show || corners.length === 0) return;

    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);

    raycaster.set(cameraPosition, cameraDirection);

    // Check which corner the user is looking at
    let closestCorner: number | null = null;
    let closestDistance = Infinity;
    const selectionDistance = 2.0; // Maximum distance for selection

    corners.forEach((corner) => {
      const distance = cameraPosition.distanceTo(corner.position);
      if (distance < selectionDistance) {
        // Check if corner is in view direction
        const toCorner = new THREE.Vector3()
          .subVectors(corner.position, cameraPosition)
          .normalize();
        const dot = cameraDirection.dot(toCorner);

        if (dot > 0.7 && distance < closestDistance) {
          // Corner is in view and closer
          closestDistance = distance;
          closestCorner = corner.index;
        }
      }
    });

    if (closestCorner !== hoveredCorner) {
      setHoveredCorner(closestCorner);
    }

    // Auto-select if user looks at a corner for a moment (optional - can be removed)
    // For now, we'll use a button press or other interaction method
  });

  if (!show) return null;

  return (
    <>
      {/* Instruction Panel */}
      <HeadLockedUI distance={1.5} verticalOffset={0.3}>
        <group>
          <mesh position={[0, 0, -0.02]}>
            <GradientBackground
              width={1.0}
              height={0.4}
              radius={0.1}
              color1="#EAF4FA"
              color2="#F0F2F5"
              opacity={0.9}
            />
          </mesh>
          <Text
            position={[0, 0.1, 0.01]}
            fontSize={0.05}
            color="#334155"
            anchorX="center"
            anchorY="middle"
            fontWeight="bold"
          >
            Select a Corner
          </Text>
          <Text
            position={[0, -0.05, 0.01]}
            fontSize={0.03}
            color="#64748B"
            anchorX="center"
            anchorY="middle"
          >
            Look at one of the four corners
          </Text>
          <Text
            position={[0, -0.12, 0.01]}
            fontSize={0.025}
            color="#64748B"
            anchorX="center"
            anchorY="middle"
          >
            (highest point of the corner)
          </Text>
        </group>
      </HeadLockedUI>

      {/* Corner Markers */}
      {corners.map((corner) => (
        <CornerMarker
          key={corner.index}
          position={corner.position}
          index={corner.index}
          isHovered={hoveredCorner === corner.index}
          onSelect={() => onCornerSelect(corner.index)}
        />
      ))}
    </>
  );
}

interface CornerMarkerProps {
  position: THREE.Vector3;
  index: number;
  isHovered: boolean;
  onSelect: () => void;
}

function CornerMarker({
  position,
  index,
  isHovered,
  onSelect,
}: CornerMarkerProps) {
  const markerRef = React.useRef<THREE.Group>(null);
  const camera = useThree((state) => state.camera);

  // Make marker always face camera
  useFrame(() => {
    if (!markerRef.current) return;
    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);
    markerRef.current.lookAt(cameraPosition);
  });

  return (
    <group ref={markerRef} position={position}>
      {/* Corner indicator sphere */}
      <mesh>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial
          color={isHovered ? "#00ff00" : "#3FA4CE"}
          emissive={isHovered ? "#00ff00" : "#66B9E2"}
          emissiveIntensity={isHovered ? 0.8 : 0.3}
        />
      </mesh>
      
      {/* Corner number label */}
      <Text
        position={[0, 0.2, 0]}
        fontSize={0.1}
        color={isHovered ? "#00ff00" : "#334155"}
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {index + 1}
      </Text>
    </group>
  );
}

