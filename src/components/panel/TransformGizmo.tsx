import { useState, useRef, useEffect } from "react";
import * as THREE from "three";

interface TransformGizmoProps {
  position: [number, number, number];
  onMove: (axis: 'x' | 'y' | 'z', delta: number) => void;
  visible: boolean;
  axisSigns?: Partial<Record<'x' | 'y' | 'z', number>>;
}

interface AxisArrowProps {
  axis: 'x' | 'y' | 'z';
  color: string;
  position: [number, number, number];
  rotation: [number, number, number];
  worldAxis: THREE.Vector3;
  onAxisDrag: (worldAxis: THREE.Vector3, delta: number) => void;
  renderOrder?: number;
}

function AxisArrow({ axis, color, position, rotation, worldAxis, onAxisDrag, renderOrder = 1 }: AxisArrowProps) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<THREE.Vector3 | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    setDragging(true);
    setHovered(true);
    if (e.point) {
      dragStartRef.current = new THREE.Vector3(e.point.x, e.point.y, e.point.z);
    }

    if (e.target?.setPointerCapture && typeof e.pointerId !== "undefined") {
      try {
        e.target.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const handlePointerMove = (e: any) => {
    if (!dragging || !dragStartRef.current) return;
    e.stopPropagation();
    if (!e.point) return;

    const currentPoint = new THREE.Vector3(e.point.x, e.point.y, e.point.z);
    const diff = currentPoint.clone().sub(dragStartRef.current);

    const delta = diff.dot(worldAxis);

    if (Math.abs(delta) > 0.001) {
      dragStartRef.current = currentPoint;
      onAxisDrag(worldAxis, delta);
    }
  };

  const handlePointerUp = (e: any) => {
    if (!dragging) return;
    e.stopPropagation();
    if (e.target?.releasePointerCapture && typeof e.pointerId !== "undefined") {
      try {
        e.target.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    setDragging(false);
    setHovered(false);
    dragStartRef.current = null;
    document.body.style.cursor = 'auto';
  };

  const handlePointerCancel = (e: any) => {
    if (!dragging) return;
    e.stopPropagation();
    if (e.target?.releasePointerCapture && typeof e.pointerId !== "undefined") {
      try {
        e.target.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    setDragging(false);
    setHovered(false);
    dragStartRef.current = null;
    document.body.style.cursor = 'auto';
  };

  useEffect(() => {
    if (!dragging) return;
    const handleGlobalPointerEnd = () => {
      setDragging(false);
      dragStartRef.current = null;
      setHovered(false);
      document.body.style.cursor = 'auto';
    };
    document.addEventListener('pointerup', handleGlobalPointerEnd);
    document.addEventListener('pointercancel', handleGlobalPointerEnd);
    return () => {
      document.removeEventListener('pointerup', handleGlobalPointerEnd);
      document.removeEventListener('pointercancel', handleGlobalPointerEnd);
    };
  }, [dragging]);

  const handlePointerEnter = (e: any) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = 'grab';
  };

  const handlePointerLeave = (e: any) => {
    if (dragging) return;
    e.stopPropagation();
    setHovered(false);
    document.body.style.cursor = 'auto';
  };

  const arrowColor = dragging ? "#000000" : (hovered ? "#FFFF00" : color);

  return (
    <group position={position} rotation={rotation}>
      <mesh
        ref={meshRef}
        renderOrder={renderOrder}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        userData={{ isGizmo: true, axis }}
      >
        <cylinderGeometry args={[0.2, 0.2, 0.7, 8]} />
        <meshBasicMaterial visible={false} depthTest={false} depthWrite={false} />
      </mesh>

      <mesh position={[0, 0, 0]} renderOrder={renderOrder}>
        <cylinderGeometry args={[0.012, 0.012, 0.22, 12]} />
        <meshBasicMaterial
          color={arrowColor}
          depthTest={false}
          depthWrite={false}
          transparent
          opacity={0.95}
        />
      </mesh>

      <mesh position={[0, 0.14, 0]} renderOrder={renderOrder}>
        <coneGeometry args={[0.05, 0.12, 12]} />
        <meshBasicMaterial
          color={arrowColor}
          depthTest={false}
          depthWrite={false}
          transparent
          opacity={0.95}
        />
      </mesh>

      <mesh position={[0, 0.22, 0]} renderOrder={renderOrder}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color={arrowColor} depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function TransformGizmo({ position, onMove, visible, axisSigns }: TransformGizmoProps) {
  if (!visible) return null;

  const xSign = axisSigns?.x ?? 1;
  const ySign = axisSigns?.y ?? 1;
  const zSign = axisSigns?.z ?? 1;

  const handleAxisDrag = (worldAxisVec: THREE.Vector3, delta: number) => {
    const x = worldAxisVec.x * delta;
    const y = worldAxisVec.y * delta;
    const z = worldAxisVec.z * delta;

    if (Math.abs(x) > 0.0001) onMove('x', x);
    if (Math.abs(y) > 0.0001) onMove('y', y);
    if (Math.abs(z) > 0.0001) onMove('z', z);
  };

  return (
    <group position={position} userData={{ isGizmo: true }}>

      <mesh renderOrder={1} userData={{ isGizmo: true }}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshBasicMaterial
          color="#000000"
          depthTest={false}
          depthWrite={false}
          transparent
          opacity={0.7}
        />
      </mesh>

      <AxisArrow
        axis="x"
        color="#FF0000"
        position={[0.18 * xSign, 0, 0]}
        rotation={[0, 0, -Math.PI / 2 * xSign]}
        worldAxis={new THREE.Vector3(xSign, 0, 0)}
        onAxisDrag={handleAxisDrag}
        renderOrder={2}
      />

      <AxisArrow
        axis="y"
        color="#00FF00"
        position={[0, 0.18, 0]}
        rotation={[0, 0, 0]}
        worldAxis={new THREE.Vector3(0, ySign, 0)}
        onAxisDrag={handleAxisDrag}
        renderOrder={2}
      />

      <AxisArrow
        axis="z"
        color="#0000FF"
        position={[0, 0, -0.18 * zSign]}
        rotation={[-Math.PI / 2 * zSign, 0, 0]}
        worldAxis={new THREE.Vector3(0, 0, zSign)}
        onAxisDrag={handleAxisDrag}
        renderOrder={3}
      />
    </group>
  );
}