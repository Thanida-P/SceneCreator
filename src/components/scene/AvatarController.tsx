import * as React from "react";
import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";

const _globs = import.meta.glob(
  "/src/assets/avatars/resident*.glb",
  { eager: true, query: "?url", import: "default" }
) as Record<string, string>;

export const AVATAR_URL_MAP: Partial<Record<number, string>> = {};
for (const [path, url] of Object.entries(_globs)) {
  const m = path.match(/resident(\d+)\.glb$/);
  if (m) AVATAR_URL_MAP[Number(m[1])] = url;
}

export const DEFAULT_AVATAR_URL = AVATAR_URL_MAP[4] ?? "";

const WALK_SPEED = 2.0;
const CAM_MOVE_SPEED = 2.0;
const FADE_DURATION = 0.2;
const THUMBSTICK_DEADZONE = 0.15;
const BOUNDARY_MARGIN = 0.3;
const SPAWN_DISTANCE = 1.5;

interface AvatarControllerInnerProps {
  avatarUrl: string;
  spawnPosition?: [number, number, number];
  homeModelGroup?: THREE.Group;
}

function AvatarControllerInner({
  avatarUrl,
  spawnPosition,
  homeModelGroup,
}: AvatarControllerInnerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera, scene: threeScene } = useThree();
  const rigRef = useRef<THREE.Group | null>(null);
  const { scene, animations } = useGLTF(avatarUrl);
  const { actions } = useAnimations(animations, groupRef);

  const keysRef = useRef<Record<string, boolean>>({});

  const pendingJumpRef  = useRef(false);
  const pendingWaveRef  = useRef(false);
  const pendingSitRef   = useRef(false);
  const pendingSleepRef = useRef(false);

  const currentActionRef = useRef("");
  const isJumpingRef  = useRef(false);
  const isWavingRef   = useRef(false);
  const isSittingRef  = useRef(false);
  const isSleepingRef = useRef(false);
  const prevActionRef = useRef("Idle");

  const animReadyRef = useRef(false);
  const cameraYawRef = useRef(0);
  const localBboxRef = useRef<THREE.Box3 | null>(null);

  useEffect(() => {
    if (!groupRef.current) return;
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() > 0.001) fwd.normalize();

    if (spawnPosition) {
      groupRef.current.position.set(spawnPosition[0], 0, spawnPosition[2]);
    } else {
      groupRef.current.position.set(
        camPos.x + fwd.x * SPAWN_DISTANCE,
        0,
        camPos.z + fwd.z * SPAWN_DISTANCE
      );
    }
    groupRef.current.rotation.y = Math.atan2(fwd.x, fwd.z);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      keysRef.current[k] = true;
      if (k === " ") { e.preventDefault(); pendingJumpRef.current  = true; }
      if (k === "u") { e.preventDefault(); pendingWaveRef.current  = true; }
      if (k === "m") { e.preventDefault(); pendingSitRef.current   = true; }
      if (k === "n") { e.preventDefault(); pendingSleepRef.current = true; }
    };
    const up = (e: KeyboardEvent) => { keysRef.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup",   up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  function findKey(keyword: string): string | null {
    const kw = keyword.toLowerCase();
    const names = Object.keys(actions);
    return (
      names.find(n => n.toLowerCase() === kw) ??
      names.find(n => n.toLowerCase().endsWith(kw)) ??
      names.find(n => n.toLowerCase().includes(kw)) ??
      null
    );
  }
  function findAction(keyword: string): THREE.AnimationAction | null {
    const k = findKey(keyword);
    return k ? (actions[k] ?? null) : null;
  }
  function switchAction(keyword: string) {
    const k = findKey(keyword);
    if (!k || !actions[k]) return;
    if (currentActionRef.current === k) return;
    actions[currentActionRef.current]?.fadeOut(FADE_DURATION);
    actions[k]!.reset().fadeIn(FADE_DURATION).play();
    currentActionRef.current = k;
  }

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const pos = groupRef.current.position;

    let thumbX = 0, thumbZ = 0;
    let camThumbX = 0, camThumbZ = 0;
    const xrSession = (state.gl as any).xr?.getSession?.();
    if (xrSession?.inputSources) {
      for (const src of xrSession.inputSources) {
        const axes = src.gamepad?.axes;
        if (!axes || axes.length < 4) continue;
        const ax = typeof axes[2] === "number" ? axes[2] : 0;
        const az = typeof axes[3] === "number" ? axes[3] : 0;
        if (src.handedness === "left") {
          if (Math.abs(ax) > THUMBSTICK_DEADZONE) thumbX = ax;
          if (Math.abs(az) > THUMBSTICK_DEADZONE) thumbZ = az;
        } else if (src.handedness === "right") {
          if (Math.abs(ax) > THUMBSTICK_DEADZONE) camThumbX = ax;
          if (Math.abs(az) > THUMBSTICK_DEADZONE) camThumbZ = az;
        }
      }
    }

    if (camThumbX !== 0 || camThumbZ !== 0) {
      if (!rigRef.current) {
        const found = threeScene.getObjectByName("CustomXRRig");
        if (found instanceof THREE.Group) rigRef.current = found;
      }
      if (rigRef.current) {
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        fwd.y = 0;
        fwd.normalize();
        const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
        const movement = new THREE.Vector3();
        movement.addScaledVector(fwd,   -camThumbZ * CAM_MOVE_SPEED * delta);
        movement.addScaledVector(right,  camThumbX * CAM_MOVE_SPEED * delta);
        rigRef.current.position.add(movement);
      }
    }

    if (!animReadyRef.current && Object.keys(actions).length > 0) {
      animReadyRef.current = true;
      console.log("[AvatarController] clips:", Object.keys(actions));
      const idleKey = findKey("idle");
      if (idleKey && actions[idleKey]) {
        actions[idleKey]!.play();
        currentActionRef.current = idleKey;
      }
    }

    const camFwdLive = new THREE.Vector3();
    camera.getWorldDirection(camFwdLive);
    camFwdLive.y = 0;
    if (camFwdLive.lengthSq() > 0.001) {
      camFwdLive.normalize();
      cameraYawRef.current = Math.atan2(camFwdLive.x, camFwdLive.z);
    }

    if (pendingJumpRef.current) {
      pendingJumpRef.current = false;
      const a = findAction("jump");
      if (a && !isJumpingRef.current && !isSittingRef.current && !isSleepingRef.current) {
        prevActionRef.current = currentActionRef.current;
        isJumpingRef.current = true;
        findAction(currentActionRef.current)?.fadeOut(FADE_DURATION);
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
        a.reset().fadeIn(FADE_DURATION).play();
        currentActionRef.current = findKey("jump") ?? "Jump";
        const done = () => {
          a.getMixer().removeEventListener("finished", done);
          isJumpingRef.current = false;
          a.fadeOut(FADE_DURATION);
          const r = findAction(prevActionRef.current);
          if (r) { r.reset().fadeIn(FADE_DURATION).play(); currentActionRef.current = prevActionRef.current; }
        };
        a.getMixer().addEventListener("finished", done);
      }
    }

    if (pendingWaveRef.current) {
      pendingWaveRef.current = false;
      const a = findAction("wave");
      if (a && !isWavingRef.current && !isSittingRef.current && !isSleepingRef.current) {
        prevActionRef.current = currentActionRef.current;
        isWavingRef.current = true;
        findAction(currentActionRef.current)?.fadeOut(FADE_DURATION);
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
        a.reset().fadeIn(FADE_DURATION).play();
        currentActionRef.current = findKey("wave") ?? "Wave";
        const done = () => {
          a.getMixer().removeEventListener("finished", done);
          isWavingRef.current = false;
          a.fadeOut(FADE_DURATION);
          const r = findAction(prevActionRef.current);
          if (r) { r.reset().fadeIn(FADE_DURATION).play(); currentActionRef.current = prevActionRef.current; }
        };
        a.getMixer().addEventListener("finished", done);
      }
    }

    if (pendingSitRef.current) {
      pendingSitRef.current = false;
      const a = findAction("sit");
      if (a && !isJumpingRef.current && !isWavingRef.current) {
        if (isSittingRef.current) {
          a.fadeOut(FADE_DURATION);
          const r = findAction(prevActionRef.current);
          if (r) { r.reset().fadeIn(FADE_DURATION).play(); currentActionRef.current = prevActionRef.current; }
          isSittingRef.current = false;
        } else {
          prevActionRef.current = currentActionRef.current;
          if (isSleepingRef.current) { findAction("sleep")?.fadeOut(FADE_DURATION); isSleepingRef.current = false; }
          findAction(currentActionRef.current)?.fadeOut(FADE_DURATION);
          a.reset().fadeIn(FADE_DURATION).play();
          currentActionRef.current = findKey("sit") ?? "Sit";
          isSittingRef.current = true;
        }
      }
    }

    if (pendingSleepRef.current) {
      pendingSleepRef.current = false;
      const a = findAction("sleep");
      if (a && !isJumpingRef.current && !isWavingRef.current) {
        if (isSleepingRef.current) {
          a.fadeOut(FADE_DURATION);
          const r = findAction(prevActionRef.current);
          if (r) { r.reset().fadeIn(FADE_DURATION).play(); currentActionRef.current = prevActionRef.current; }
          isSleepingRef.current = false;
        } else {
          prevActionRef.current = currentActionRef.current;
          if (isSittingRef.current) { findAction("sit")?.fadeOut(FADE_DURATION); isSittingRef.current = false; }
          findAction(currentActionRef.current)?.fadeOut(FADE_DURATION);
          a.reset().fadeIn(FADE_DURATION).play();
          currentActionRef.current = findKey("sleep") ?? "Sleep";
          isSleepingRef.current = true;
        }
      }
    }

    const keys = keysRef.current;
    const I = keys["i"] || thumbZ < 0;
    const K = keys["k"] || thumbZ > 0;
    const J = keys["j"] || thumbX < 0;
    const L = keys["l"] || thumbX > 0;
    const isMoving = !!(I || K || J || L);

    if (!isJumpingRef.current && !isWavingRef.current && !isSittingRef.current && !isSleepingRef.current) {
      if (isMoving) {
        const wk = findKey("walk"); if (wk) switchAction(wk);
      } else {
        const ik = findKey("idle"); if (ik) switchAction(ik);
      }
    }

    if (isMoving && !isWavingRef.current && !isSittingRef.current && !isSleepingRef.current) {
      const keyboardActive = !!(keys["i"] || keys["k"] || keys["j"] || keys["l"]);
      const thumbMag  = Math.min(Math.sqrt(thumbX * thumbX + thumbZ * thumbZ), 1.0);
      const speedFactor = keyboardActive ? 1.0 : thumbMag;

      const yaw = cameraYawRef.current;
      const camFwd   = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const camRight = new THREE.Vector3().crossVectors(camFwd, new THREE.Vector3(0, 1, 0)).normalize();

      const moveDir = new THREE.Vector3();
      if (I) moveDir.addScaledVector(camFwd,    1);  // forward
      if (K) moveDir.addScaledVector(camFwd,   -1);  // backward
      if (J) moveDir.addScaledVector(camRight, -1);  // strafe left
      if (L) moveDir.addScaledVector(camRight,  1);  // strafe right
      if (moveDir.lengthSq() > 0) moveDir.normalize();

      const faceAngle = Math.atan2(moveDir.x, moveDir.z);
      let diff = faceAngle - groupRef.current.rotation.y;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      groupRef.current.rotation.y += diff * Math.min(8 * delta, 1);

      const newX = pos.x + moveDir.x * WALK_SPEED * speedFactor * delta;
      const newZ = pos.z + moveDir.z * WALK_SPEED * speedFactor * delta;

      if (homeModelGroup) {
        if (!localBboxRef.current) {
          const savedPos = homeModelGroup.position.clone();
          const savedRot = homeModelGroup.rotation.clone();
          const savedScale = homeModelGroup.scale.clone();
          homeModelGroup.position.set(0, 0, 0);
          homeModelGroup.rotation.set(0, 0, 0);
          homeModelGroup.scale.set(1, 1, 1);
          homeModelGroup.updateMatrixWorld(true);
          localBboxRef.current = new THREE.Box3().setFromObject(homeModelGroup);
          homeModelGroup.position.copy(savedPos);
          homeModelGroup.rotation.copy(savedRot);
          homeModelGroup.scale.copy(savedScale);
          homeModelGroup.updateMatrixWorld(true);
        }

        homeModelGroup.updateMatrixWorld(false);
        const invMat = homeModelGroup.matrixWorld.clone().invert();
        const localPos = new THREE.Vector3(newX, 0, newZ).applyMatrix4(invMat);
        const lb = localBboxRef.current;
        localPos.x = THREE.MathUtils.clamp(localPos.x, lb.min.x + BOUNDARY_MARGIN, lb.max.x - BOUNDARY_MARGIN);
        localPos.z = THREE.MathUtils.clamp(localPos.z, lb.min.z + BOUNDARY_MARGIN, lb.max.z - BOUNDARY_MARGIN);
        const worldPos = localPos.applyMatrix4(homeModelGroup.matrixWorld);
        pos.x = worldPos.x;
        pos.z = worldPos.z;
      } else {
        pos.x = newX;
        pos.z = newZ;
      }
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} dispose={null} />
    </group>
  );
}

interface ErrorBoundaryState { hasError: boolean; }

class AvatarErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; onError: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): ErrorBoundaryState { return { hasError: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.hasError ? null : this.props.children; }
}

export interface AvatarControllerProps {
  avatarUrl?: string;
  spawnPosition?: [number, number, number];
  homeModelGroup?: THREE.Group;
  onLoadError?: () => void;
}

export function AvatarController({
  avatarUrl = DEFAULT_AVATAR_URL,
  spawnPosition,
  homeModelGroup,
  onLoadError,
}: AvatarControllerProps) {
  return (
    <AvatarErrorBoundary onError={onLoadError ?? (() => {})}>
      <React.Suspense fallback={null}>
        <AvatarControllerInner
          avatarUrl={avatarUrl}
          spawnPosition={spawnPosition}
          homeModelGroup={homeModelGroup}
        />
      </React.Suspense>
    </AvatarErrorBoundary>
  );
}
