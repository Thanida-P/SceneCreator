import { Text } from "@react-three/drei";
import { GradientBackground, RoundedPlane } from "./common/PanelElements";

interface AlignmentInstructionPanelProps {
  show: boolean;
  message: string;
  subMessage?: string;
}

export function AlignmentInstructionPanel({
  show,
  message,
  subMessage,
}: AlignmentInstructionPanelProps) {
  if (!show) return null;

  const panelWidth = 0.8;
  const panelHeight = 0.3;

  return (
    <group>
      {/* Main background panel */}
      <mesh position={[0, 0, -0.02]}>
        <GradientBackground 
          width={panelWidth} 
          height={panelHeight} 
          radius={0.1} 
          color1="#EAF4FA" 
          color2="#F0F2F5" 
          opacity={0.9} 
        />
      </mesh>

      {/* Background Shadow */}
      <mesh position={[0, 0, -0.03]}>
        <RoundedPlane width={panelWidth} height={panelHeight} radius={0.1} />
        <meshStandardMaterial
          color="#000000"
          opacity={0.15}
          transparent
          roughness={1.0}
        />
      </mesh>

      {/* Main message */}
      <Text
        position={[0, subMessage ? 0.05 : 0, 0.01]}
        fontSize={0.05}
        color="#334155"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {message}
      </Text>

      {/* Sub message */}
      {subMessage && (
        <Text
          position={[0, -0.05, 0.01]}
          fontSize={0.035}
          color="#64748B"
          anchorX="center"
          anchorY="middle"
        >
          {subMessage}
        </Text>
      )}
    </group>
  );
}

