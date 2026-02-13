import { Text } from "@react-three/drei";
import { GradientBackground, RoundedPlane, ButtonBackground } from "./common/PanelElements";
import { useState } from "react";

type AlignmentMode = "world" | "free" | null;

interface VRAlignmentPanelProps {
  show: boolean;
  onSelectMode: (mode: "world" | "free") => void;
}

export function VRAlignmentPanel({ show, onSelectMode }: VRAlignmentPanelProps) {
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  if (!show) return null;

  const panelWidth = 1.0;
  const panelHeight = 0.7;
  const buttonWidth = 0.8;
  const buttonHeight = 0.15;

  return (
    <group>
      {/* Main background panel */}
      <mesh position={[0, 0, -0.02]}>
        <GradientBackground width={panelWidth} height={panelHeight} radius={0.1} color1="#EAF4FA" color2="#F0F2F5" opacity={0.85} />
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

      {/* Header */}
      <Text
        position={[0, panelHeight / 2 - 0.12, 0.01]}
        fontSize={0.06}
        color="#334155"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        Welcome to VR Scene Creator
      </Text>

      {/* Description */}
      <Text
        position={[0, panelHeight / 2 - 0.19, 0.01]}
        fontSize={0.035}
        color="#64748B"
        anchorX="center"
        anchorY="middle"
      >
        Please choose your alignment mode:
      </Text>

      {/* Align World Button */}
      <group position={[0, 0.04, 0.01]}>
        <mesh
          onPointerEnter={(e) => {
            e.stopPropagation();
            setHoveredButton("world");
          }}
          onPointerLeave={(e) => {
            e.stopPropagation();
            setHoveredButton(null);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelectMode("world");
          }}
        >
          <RoundedPlane width={buttonWidth} height={buttonHeight} radius={0.04} />
          <meshStandardMaterial
            color={hoveredButton === "world" ? "#66B9E2" : "#3FA4CE"}
            emissive={hoveredButton === "world" ? "#66B9E2" : "#66B9E2"}
            emissiveIntensity={hoveredButton === "world" ? 0.5 : 0.3}
          />
        </mesh>
        <Text
          position={[0, 0.01, 0.01]}
          fontSize={0.045}
          color="#334155"
          anchorX="center"
          anchorY="middle"
          fontWeight={600}
        >
          Align Home Model to Real World
        </Text>
        <Text
          position={[0, -0.04, 0.01]}
          fontSize={0.028}
          color="#64748B"
          anchorX="center"
          anchorY="middle"
        >
          Use controllers to position the model
        </Text>
      </group>

      <group position={[0, 0.03, 0]}>
        <mesh>
          <ButtonBackground width={buttonWidth} height={buttonHeight} radius={0.04} colorTop="#000000" colorBottom="#000000" opacity={0.15} />
        </mesh>
      </group>

      {/* Free Roam Button */}
      <group position={[0, -0.16, 0.01]}>
        <mesh
          onPointerEnter={(e) => {
            e.stopPropagation();
            setHoveredButton("free");
          }}
          onPointerLeave={(e) => {
            e.stopPropagation();
            setHoveredButton(null);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelectMode("free");
          }}
        >
          <RoundedPlane width={buttonWidth} height={buttonHeight} radius={0.04} />
          <meshStandardMaterial
            color={hoveredButton === "free" ? "#A5D1E7" : "#66B9E2"}
            emissive={hoveredButton === "free" ? "#66B9E2" : "#66B9E2"}
            emissiveIntensity={hoveredButton === "free" ? 0.5 : 0.3}
          />
        </mesh>
        <Text
          position={[0, 0.01, 0.01]}
          fontSize={0.045}
          color="#334155"
          anchorX="center"
          anchorY="middle"
          fontWeight={600}
        >
          Free Roaming Mode
        </Text>
        <Text
          position={[0, -0.04, 0.01]}
          fontSize={0.028}
          color="#64748B"
          anchorX="center"
          anchorY="middle"
        >
          Navigate freely with controllers
        </Text>
      </group>

      <group position={[0, -0.17, 0]}>
        <mesh>
          <ButtonBackground width={buttonWidth} height={buttonHeight} radius={0.04} colorTop="#000000" colorBottom="#000000" opacity={0.15} />
        </mesh>
      </group>
    </group>
  );
}

interface VRAlignmentConfirmPanelProps {
  show: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function VRAlignmentConfirmPanel({ show, onConfirm, onCancel }: VRAlignmentConfirmPanelProps) {
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  if (!show) return null;

  const panelWidth = 0.7;
  const panelHeight = 0.5;
  const buttonWidth = 0.25;
  const buttonHeight = 0.1;

  return (
    <group>
      {/* Main background panel */}
      <mesh position={[0, 0, -0.02]}>
        <GradientBackground width={panelWidth} height={panelHeight} radius={0.1} color1="#EAF4FA" color2="#F0F2F5" opacity={0.85} />
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

      {/* Header */}
      <Text
        position={[0, panelHeight / 2 - 0.12, 0.01]}
        fontSize={0.05}
        color="#334155"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        Confirm Alignment
      </Text>

      {/* Description */}
      <Text
        position={[0, 0.05, 0.01]}
        fontSize={0.032}
        color="#64748B"
        anchorX="center"
        anchorY="middle"
      >
        Adjust the model position using
      </Text>
      <Text
        position={[0, 0, 0.01]}
        fontSize={0.032}
        color="#64748B"
        anchorX="center"
        anchorY="middle"
      >
        your controllers, then confirm
      </Text>

      {/* Confirm Button */}
      <group position={[-0.15, -0.15, 0.01]}>
        <mesh
          onPointerEnter={(e) => {
            e.stopPropagation();
            setHoveredButton("confirm");
          }}
          onPointerLeave={(e) => {
            e.stopPropagation();
            setHoveredButton(null);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onConfirm();
          }}
        >
          <RoundedPlane width={buttonWidth} height={buttonHeight} radius={0.03} />
          <meshStandardMaterial
            color={hoveredButton === "confirm" ? "#4CAF50" : "#66BB6A"}
            emissive={hoveredButton === "confirm" ? "#66BB6A" : "#66BB6A"}
            emissiveIntensity={hoveredButton === "confirm" ? 0.5 : 0.3}
          />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.04}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          fontWeight={550}
        >
          Confirm
        </Text>
      </group>

      <group position={[-0.15, -0.16, 0]}>
        <mesh>
          <ButtonBackground width={buttonWidth} height={buttonHeight} radius={0.03} colorTop="#000000" colorBottom="#000000" opacity={0.15} />
        </mesh>
      </group>

      {/* Cancel Button */}
      <group position={[0.15, -0.15, 0.01]}>
        <mesh
          onPointerEnter={(e) => {
            e.stopPropagation();
            setHoveredButton("cancel");
          }}
          onPointerLeave={(e) => {
            e.stopPropagation();
            setHoveredButton(null);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onCancel();
          }}
        >
          <RoundedPlane width={buttonWidth} height={buttonHeight} radius={0.03} />
          <meshStandardMaterial
            color={hoveredButton === "cancel" ? "#A5D1E7" : "#66B9E2"}
            emissive={hoveredButton === "cancel" ? "#66B9E2" : "#66B9E2"}
            emissiveIntensity={hoveredButton === "cancel" ? 0.5 : 0.3}
          />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.04}
          color="#334155"
          anchorX="center"
          anchorY="middle"
          fontWeight={550}
        >
          Cancel
        </Text>
      </group>

      <group position={[0.15, -0.16, 0]}>
        <mesh>
          <ButtonBackground width={buttonWidth} height={buttonHeight} radius={0.03} colorTop="#000000" colorBottom="#000000" opacity={0.15} />
        </mesh>
      </group>
    </group>
  );
}

