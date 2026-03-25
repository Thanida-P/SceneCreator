import { useState, useRef, useEffect } from "react";
import * as THREE from "three";

interface RotationGizmoProps {
  position: [number, number, number];
  onRotate: (axis: 'x' | 'y' | 'z', deltaRadians: number) => void;
  visible: boolean;
  currentRotation?: [number, number, number];
}

interface RotationArcProps {
  axis: 'x' | 'y' | 'z';
  color: string;
  position: [number, number, number];
  rotation: [number, number, number];
  radius: number;
  onAxisDrag: (axis: 'x' | 'y' | 'z', deltaRadians: number) => void;
}

const ROTATE_SENSITIVITY = 0.35;

function createArcCurve(radius: number) {
  const points: THREE.Vector3[] = [];
  const segments = 128;
  
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * (Math.PI * 2);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    points.push(new THREE.Vector3(x, y, 0));
  }
  
  return new THREE.CatmullRomCurve3(points);
}


function RotationArc({ axis, color, position, rotation, radius, onAxisDrag }: RotationArcProps) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  
  const dragPlane = useRef<THREE.Plane | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const dragPrevDir = useRef<THREE.Vector3 | null>(null);
  const dragCenterWorld = useRef<THREE.Vector3 | null>(null);
  const dragPlaneNormalWorld = useRef<THREE.Vector3 | null>(null);
  

  useEffect(() => {
    console.log(`[RotationArc-${axis}] ✅ Mounted`);
  }, [axis]);

  const handlePointerDown = (e: any) => {
   
    e.stopPropagation();
    
    setDragging(true);
    
    if (!groupRef.current) return;

    const worldPoint = e.point
      ? new THREE.Vector3(e.point.x, e.point.y, e.point.z)
      : null;
    if (!worldPoint) return;

    const groupWorldPos = new THREE.Vector3();
    groupRef.current.getWorldPosition(groupWorldPos);

    const planeNormalLocal = new THREE.Vector3(0, 0, 1);
    const quatRotation = new THREE.Quaternion();
    groupRef.current.getWorldQuaternion(quatRotation);
    const planeNormalWorld = planeNormalLocal.clone().applyQuaternion(quatRotation).normalize();

    dragPlaneNormalWorld.current = planeNormalWorld;
    dragCenterWorld.current = groupWorldPos;

    dragPlane.current = new THREE.Plane().setFromNormalAndCoplanarPoint(
      planeNormalWorld,
      groupWorldPos
    );

    const projected = dragPlane.current.projectPoint(worldPoint.clone(), new THREE.Vector3());
    dragPrevDir.current = projected.sub(groupWorldPos).normalize();
    

    if (e.target?.setPointerCapture) {
      try {
        e.target.setPointerCapture(e.pointerId);
      } catch (err) {
        
      }
    }
  };

  const handlePointerMove = (e: any) => {
    if (
      !dragging ||
      !groupRef.current ||
      !dragPlane.current ||
      !dragPrevDir.current ||
      !dragCenterWorld.current ||
      !dragPlaneNormalWorld.current
    ) {
      return;
    }

    let intersection: THREE.Vector3 | null = null;
    if (e.ray) {
      intersection = e.ray.intersectPlane(dragPlane.current, new THREE.Vector3());
    }

    if (!intersection && e.point) {
      const worldPoint = new THREE.Vector3(e.point.x, e.point.y, e.point.z);
      intersection = dragPlane.current.projectPoint(worldPoint, new THREE.Vector3());
    }

    if (!intersection) return;

    const currentDir = intersection
      .clone()
      .sub(dragCenterWorld.current)
      .normalize();

    const v1 = dragPrevDir.current;
    const v2 = currentDir;
    const cross = v1.clone().cross(v2);
    const angle = Math.atan2(cross.dot(dragPlaneNormalWorld.current), v1.dot(v2));

    const delta = angle * ROTATE_SENSITIVITY;
    if (Math.abs(delta) > 0.0005) {
      dragPrevDir.current = currentDir;
      onAxisDrag(axis, delta);
    }
  };

  const handlePointerUp = (e: any) => {
    if (!dragging) return;
    
    e.stopPropagation();
    
    setDragging(false);
    dragPlane.current = null;
    dragPrevDir.current = null;
    dragCenterWorld.current = null;
    dragPlaneNormalWorld.current = null;
    
   
    if (e.target?.releasePointerCapture) {
      try {
        e.target.releasePointerCapture(e.pointerId);
      } catch (err) {
     
      }
    }
  };

  const handlePointerEnter = (e: any) => {
    if (dragging) return;
   
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

  const arcColor = dragging ? "#FFFFFF" : (hovered ? "#FFFF00" : color);
  const arcOpacity = dragging ? 1 : (hovered ? 0.9 : 0.7);

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
   
      <mesh
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        userData={{ isGizmo: true, axis, type: 'rotation' }}
      >
        <torusGeometry
          args={[
            radius,          
            0.08,          
            16,           
            100,            
            Math.PI * 2
          ]}
        />
        <meshBasicMaterial
          color="#FF00FF"
          transparent
          opacity={0}        
          depthTest={false}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

     
      <mesh userData={{ isGizmo: true, isVisual: true }} renderOrder={999}>
        <tubeGeometry
          args={[
            createArcCurve(radius),
            64,      
            0.012, 
            8,       
            false    
          ]}
        />
        <meshBasicMaterial
          color={arcColor}
          transparent
          opacity={arcOpacity}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

export function RotationGizmo({
  position,
  onRotate,
  visible,
  currentRotation: _currentRotation = [0, 0, 0]
}: RotationGizmoProps) {
  const arcRadius = 0.6; 

  useEffect(() => {
    console.log(`[RotationGizmo] ✅ Mounted at position:`, position);
  }, [position]);


  void _currentRotation;

  if (!visible) {
    return null;
  }

  return (
    <group
      position={position}
      userData={{ isGizmo: true }}
    >
     
      <mesh userData={{ isGizmo: true, isVisual: true }}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshBasicMaterial
          color="#FFFFFF"
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>


      <RotationArc
        axis="x"
        color="#FF5555"
        position={[0, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
        radius={arcRadius}
        onAxisDrag={(axis, deltaRadians) => {
         
          onRotate(axis, deltaRadians);
        }}
      />

   
      <RotationArc
        axis="y"
        color="#55FF55"
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        radius={arcRadius}
        onAxisDrag={(axis, deltaRadians) => {
         
          onRotate(axis, deltaRadians);
        }}
      />


      <RotationArc
        axis="z"
        color="#5555FF"
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        radius={arcRadius}
        onAxisDrag={(axis, deltaRadians) => {
          
          onRotate(axis, deltaRadians);
        }}
      />
    </group>
  );
}