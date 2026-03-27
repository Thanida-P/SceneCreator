import * as React from "react";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { ThreeEvent } from "@react-three/fiber";
import { GradientBackground, RoundedPlane } from "./common/PanelElements";


export function VRSlider({
  show,
  value,
  onChange,
  label,
  min = 0,
  max = 1,
  position = [0, 0, 0],
  showDegrees = false,
  onClose
}: any) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [hoveredButton, setHoveredButton] = React.useState<string | null>(null);
  const trackRef = React.useRef<THREE.Mesh>(null);
  
  if (!show) return null;
  
  const handleSliderInteraction = (e: ThreeEvent<PointerEvent>) => {
    if (!trackRef.current || !e.point) return;
    const trackMatrix = trackRef.current.matrixWorld;
    const inverseTrackMatrix = new THREE.Matrix4().copy(trackMatrix).invert();
    const localPoint = e.point.clone().applyMatrix4(inverseTrackMatrix);
    const normalizedX = (localPoint.x + 0.25) / 0.5;
    const clampedX = Math.max(0, Math.min(1, normalizedX));
    const newValue = min + clampedX * (max - min);
    onChange(newValue);
  };
  
  const sliderPosition = ((value - min) / (max - min)) * 0.5 - 0.25;
  const clampedValue = Math.max(min, Math.min(max, value));
  const displayValue = showDegrees
    ? Math.round(clampedValue * 180 / Math.PI) + "°"
    : clampedValue.toFixed(2);
  
  return (
    <group position={position}>
    
      <mesh position={[0, 3, -0.01]}>
        <GradientBackground width={0.5} height={0.15} radius={0.04} color1="#EAF4FA" color2="#F5F7FA" opacity={0.9} />
      </mesh>
      
  
      <group
        position={[0.21, 0.03, 0.01]}
        onPointerEnter={(e) => { e.stopPropagation(); setHoveredButton("close"); }}
        onPointerLeave={(e) => { e.stopPropagation(); setHoveredButton(null); }}
        onPointerDown={(e) => { e.stopPropagation(); onClose(); }}
      >
        <mesh>
          <RoundedPlane width={0.05} height={0.05} radius={0.06} />
          <meshStandardMaterial
            color={hoveredButton === "close" ? "#1E40AF" : "#334155"}
            emissive={hoveredButton === "close" ? "#66B9E2" : "#ccc"}
            emissiveIntensity={hoveredButton === "close" ? 0.6 : 0.4}
          />
        </mesh>
        <Text
          position={[-0.00, -0.005, 0.01]}
          fontSize={0.03}
          color="#334155"
          anchorX="center"
          anchorY="middle"
        >
          ✕
        </Text>
      </group>
      
  
      <Text position={[0, 0.02, 0]} fontSize={0.03} color="#334155" anchorX="center" anchorY="middle">
        {label}: {displayValue}
      </Text>
      
   
      <mesh
        ref={trackRef}
        position={[0, -0.03, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          setIsDragging(true);
          handleSliderInteraction(e);
        }}
        onPointerUp={() => setIsDragging(false)}
        onPointerMove={(e) => {
          if (isDragging) {
            e.stopPropagation();
            handleSliderInteraction(e);
          }
        }}
        onPointerLeave={() => setIsDragging(false)}
      >
        <boxGeometry args={[0.4, 0.015, 0.01]} />
        <meshStandardMaterial color="#A5D1E7" />
      </mesh>
      
    
      <mesh position={[sliderPosition, -0.03, 0.01]}>
        <sphereGeometry args={[0.02, 16, 16]} />
        <meshStandardMaterial
          color={isDragging ? "#66B9E2" : "#C7E4FA"}
          emissive={isDragging ? "#66B9E2" : "#C7E4FA"}
          emissiveIntensity={isDragging ? 0.5 : 0.2}
        />
      </mesh>
    </group>
  );
}


interface ScaleControlPanelProps {
  show: boolean;
  currentScale: number;
  position?: [number, number, number];
  onScaleChange: (newScale: number) => void;
  onClose: () => void;
}

export function ScaleControlPanel({
  show,
  currentScale,
  position = [0.5, 0, 0],
  onScaleChange,
  onClose,
}: ScaleControlPanelProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [hoveredButton, setHoveredButton] = React.useState<string | null>(null);
  const trackRef = React.useRef<THREE.Mesh>(null);

  if (!show) return null;

  const MIN_SCALE = 0.5;
  const MAX_SCALE = 3;

  const handleSliderInteraction = (e: ThreeEvent<PointerEvent>) => {
    if (!trackRef.current || !e.point) return;

    const trackMatrix = trackRef.current.matrixWorld;
    const inverseTrackMatrix = new THREE.Matrix4().copy(trackMatrix).invert();
    const localPoint = e.point.clone().applyMatrix4(inverseTrackMatrix);

    const normalizedX = (localPoint.x + 0.2) / 0.4;
    const clampedX = Math.max(0, Math.min(1, normalizedX));
    const newValue = MIN_SCALE + clampedX * (MAX_SCALE - MIN_SCALE);

    onScaleChange(newValue);
  };

  const handleIncrement = () => {
    onScaleChange(Math.min(currentScale + 0.1, MAX_SCALE));
  };

  const handleDecrement = () => {
    onScaleChange(Math.max(currentScale - 0.1, MIN_SCALE));
  };

  const handleReset = () => {
    onScaleChange(1);
  };

  const sliderPosition = ((currentScale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE)) * 0.4 - 0.2;
  const clampedValue = Math.max(MIN_SCALE, Math.min(MAX_SCALE, currentScale));
  const displayValue = clampedValue.toFixed(2);

  return (
    <group position={position}>
    
      <mesh position={[0, 0, -0.01]}>
        <RoundedPlane width={0.6} height={0.4} radius={0.04} /> 
        <meshBasicMaterial color="#73aad5" opacity={0.85} transparent />  
      </mesh>

      <mesh position={[0, 0, 0]}>
        <RoundedPlane width={0.62} height={0.42} radius={0.04} />
        <meshBasicMaterial color="#b7e0f5" opacity={0.7} transparent />   
      </mesh>

      <Text
        position={[0, 0.13, 0.01]}
        fontSize={0.04}
        color="#0a0808"
        anchorX="center"
        anchorY="middle"
      >
        Scale Furniture
      </Text>

      <Text
        position={[0, 0.07, 0.01]}
        fontSize={0.04}
        color="#1b1317"
        anchorX="center"
        anchorY="middle"
      >
        {displayValue}x
      </Text>

    
      <group
        position={[-0.15, 0, 0.01]}
        onPointerEnter={(e) => {
          e.stopPropagation();
          setHoveredButton("decrease");
        }}
        onPointerLeave={(e) => {
          e.stopPropagation();
          setHoveredButton(null);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          handleDecrement();
        }}
      >
        <mesh>
          <RoundedPlane width={0.08} height={0.08} radius={0.015} />
          <meshStandardMaterial
            color={hoveredButton === "decrease" ? "#f193c2" : "#b9edfb"}
            emissive={hoveredButton === "decrease" ? "#f193c2" : "#b9edfb"}
            emissiveIntensity={hoveredButton === "decrease" ? 0.3 : 0}
          />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.04}
          color="#000000"
          anchorX="center"
          anchorY="middle"
        >
          −
        </Text>
      </group>

    
      <group
        position={[0.15, 0, 0.01]}
        onPointerEnter={(e) => {
          e.stopPropagation();
          setHoveredButton("increase");
        }}
        onPointerLeave={(e) => {
          e.stopPropagation();
          setHoveredButton(null);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          handleIncrement();
        }}
      >
        <mesh>
          <RoundedPlane width={0.08} height={0.08} radius={0.015} />
          <meshStandardMaterial
            color={hoveredButton === "increase" ? "#f193c2" : "#b9edfb"}
            emissive={hoveredButton === "increase" ? "#f193c2" : "#b9edfb"}
            emissiveIntensity={hoveredButton === "increase" ? 0.3 : 0}
          />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.04}
          color="#000000"
          anchorX="center"
          anchorY="middle"
        >
          +
        </Text>
      </group>

   
      <mesh
        ref={trackRef}
        position={[0, -0.065, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          setIsDragging(true);
          handleSliderInteraction(e);
        }}
        onPointerUp={() => setIsDragging(false)}
        onPointerMove={(e) => {
          if (isDragging) {
            e.stopPropagation();
            handleSliderInteraction(e);
          }
        }}
        onPointerLeave={() => setIsDragging(false)}
      >
        <boxGeometry args={[0.4, 0.015, 0.01]} />
        <meshStandardMaterial color="#334155" />
      </mesh>

    
      <mesh position={[sliderPosition, -0.065, 0.01]}>
        <sphereGeometry args={[0.015, 16, 16]} />
        <meshStandardMaterial
          color={isDragging ? "#EC4899" : "#C7E4FA"}
          emissive={isDragging ? "#EC4899" : "#C7E4FA"}
          emissiveIntensity={isDragging ? 0.5 : 0.2}
        />
      </mesh>

  
      <group
        position={[0, -0.12, 0.01]}
        onPointerEnter={(e) => {
          e.stopPropagation();
          setHoveredButton("reset");
        }}
        onPointerLeave={(e) => {
          e.stopPropagation();
          setHoveredButton(null);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          handleReset();
        }}
      >
        <mesh>
          <RoundedPlane width={0.2} height={0.06} radius={0.01} />
          <meshStandardMaterial
            color={hoveredButton === "reset" ? "#7c5d26" : "#4c658f"}
            emissive={hoveredButton === "reset" ? "#ea91d7" : "#161a1f"}
            emissiveIntensity={hoveredButton === "reset" ? 0.3 : 0}
          />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.025}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
        >
          Reset (1.0x)
        </Text>
      </group>

      
      <group
        position={[0.234, 0.13, 0.01]}
        onPointerEnter={(e) => {
          e.stopPropagation();
          setHoveredButton("close");
        }}
        onPointerLeave={(e) => {
          e.stopPropagation();
          setHoveredButton(null);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <mesh>
          <RoundedPlane width={0.06} height={0.06} radius={0.01} />
          <meshStandardMaterial
            color={hoveredButton === "close" ? "#7c5d26" : "#4c658f"}
            emissive={hoveredButton === "close" ? "#ea91d7" : "#161a1f"}
            emissiveIntensity={hoveredButton === "close" ? 0.3 : 0}
          />
        </mesh>
        <Text
          position={[0, 0, 0.001]}
          fontSize={0.035}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
        >
          ✕
        </Text>
      </group>

   
      <Text
        position={[-0.22, -0.09, 0.01]}
        fontSize={0.018}
        color="#94A3B8"
        anchorX="center"
        anchorY="middle"
      >
        0.5x
      </Text>

      <Text
        position={[0.22, -0.09, 0.01]}
        fontSize={0.018}
        color="#94A3B8"
        anchorX="center"
        anchorY="middle"
      >
        3x
      </Text>
    </group>
  );
}