import * as THREE from 'three';

export interface ControllerConfig {
  moveSpeed?: number;
  rotateSpeed?: number;
  deadzone?: number;
  enabled?: boolean;
}

export abstract class XRControllerBase {
  protected config: Required<ControllerConfig>;
  protected prevButtonState: Map<string, boolean> = new Map();

  constructor(config: ControllerConfig = {}) {
    this.config = {
      moveSpeed: config.moveSpeed ?? 2.0,
      rotateSpeed: config.rotateSpeed ?? 1.5,
      deadzone: config.deadzone ?? 0.15,
      enabled: config.enabled ?? true,
    };
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  setMoveSpeed(speed: number): void {
    this.config.moveSpeed = speed;
  }

  setRotateSpeed(speed: number): void {
    this.config.rotateSpeed = speed;
  }

  setDeadzone(deadzone: number): void {
    this.config.deadzone = deadzone;
  }

  protected isButtonPressed(
    inputSource: any,
    buttonIndex: number
  ): boolean {
    const gamepad = inputSource.gamepad;
    if (!gamepad || !gamepad.buttons) return false;
    
    const button = gamepad.buttons[buttonIndex];
    return button ? button.pressed : false;
  }

  protected wasButtonJustPressed(
    controllerIndex: number,
    buttonIndex: number,
    isPressed: boolean
  ): boolean {
    const key = `${controllerIndex}-${buttonIndex}`;
    const wasPressed = this.prevButtonState.get(key) || false;
    
    const justPressed = isPressed && !wasPressed;
    this.prevButtonState.set(key, isPressed);
    
    return justPressed;
  }

  protected getAxisValue(
    inputSource: any,
    axisIndex: number
  ): number {
    const gamepad = inputSource.gamepad;
    if (!gamepad || !gamepad.axes || axisIndex >= gamepad.axes.length) return 0;
    
    const value = gamepad.axes[axisIndex];
    return typeof value === 'number' && !isNaN(value) ? value : 0;
  }

  protected isAxisActive(value: number): boolean {
    return Math.abs(value) > this.config.deadzone;
  }


  abstract update(
    session: any,
    camera: THREE.Camera,
    delta: number
  ): void;
  
  abstract reset(): void;
}

// NavigationController
export class NavigationController extends XRControllerBase {
  private rig: THREE.Group | null = null;
  private isNavigating: boolean = false;
  private onNavigationModeChange?: (isActive: boolean) => void;
  private homeModelGroup: THREE.Group | null = null;
  private alignmentMode: boolean = false;

  constructor(
    config: ControllerConfig = {},
    onNavigationModeChange?: (isActive: boolean) => void
  ) {
    super(config);
    this.onNavigationModeChange = onNavigationModeChange;
  }

  setRig(rig: THREE.Group): void {
    this.rig = rig;
  }

  getRig(): THREE.Group | null {
    return this.rig;
  }

  setHomeModelGroup(homeModelGroup: THREE.Group | null): void {
    this.homeModelGroup = homeModelGroup;
  }

  setAlignmentMode(enabled: boolean): void {
    this.alignmentMode = enabled;
  }

  isNavigationActive(): boolean {
    return this.isNavigating;
  }

  update(
    session: any,
    camera: THREE.Camera,
    delta: number
  ): void {
    if (!this.config.enabled || !this.rig || !session || !session.inputSources) return;

    let isGripPressed = false;
    let moveX = 0;
    let moveZ = 0;
    let rotateInput = 0;

    session.inputSources.forEach((source: any) => {
      const gamepad = source.gamepad;
      if (!gamepad) return;

      const gripButton = gamepad.buttons[1];
      const squeezeButton = gamepad.buttons[2];
      
      if ((gripButton && gripButton.pressed) || (squeezeButton && squeezeButton.pressed)) {
        isGripPressed = true;

        if (source.handedness === "right" && gamepad.axes.length >= 4) {
          const x = this.getAxisValue(source, 2);
          const z = this.getAxisValue(source, 3);
          if (this.isAxisActive(x)) moveX = x;
          if (this.isAxisActive(z)) moveZ = z;
        }

        if (source.handedness === "left" && gamepad.axes.length >= 3) {
          const r = this.getAxisValue(source, 2);
          if (this.isAxisActive(r)) rotateInput = -r;
        }
      }
    });

    if (isGripPressed !== this.isNavigating) {
      this.isNavigating = isGripPressed;
      this.onNavigationModeChange?.(this.isNavigating);
    }

    if (!isGripPressed) return;

    if (this.alignmentMode && this.homeModelGroup) {
      // Alignment mode
      if (Math.abs(rotateInput) > 0) {
        const rotationDelta = -rotateInput * this.config.rotateSpeed * delta;
        this.homeModelGroup.rotateY(rotationDelta);
      }

      if (Math.abs(moveX) > 0 || Math.abs(moveZ) > 0) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, camera.up).normalize();

        const movement = new THREE.Vector3();
        movement.addScaledVector(forward, moveZ * this.config.moveSpeed * delta);
        movement.addScaledVector(right, -moveX * this.config.moveSpeed * delta);

        this.homeModelGroup.position.add(movement);
      }
    } else if (this.rig) {
      // Normal navigation mode
      if (Math.abs(rotateInput) > 0) {
        const rotationDelta = rotateInput * this.config.rotateSpeed * delta;
        this.rig.rotateY(rotationDelta);
      }

      if (Math.abs(moveX) > 0 || Math.abs(moveZ) > 0) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, camera.up).normalize();

        const movement = new THREE.Vector3();
        movement.addScaledVector(forward, -moveZ * this.config.moveSpeed * delta);
        movement.addScaledVector(right, moveX * this.config.moveSpeed * delta);

        this.rig.position.add(movement);
      }
    }
  }

  reset(): void {
    this.isNavigating = false;
    this.prevButtonState.clear();
  }
}

// FurnitureController
export class FurnitureEditController extends XRControllerBase {
  private selectedFurnitureId: string | null = null;
  private onFurnitureMove?: (id: string, delta: THREE.Vector3) => void;
  private onFurnitureRotate?: (id: string, deltaY: number) => void;
  private onFurnitureDeselect?: (id: string) => void;
  private onWallFurnitureMove?: (id: string, deltaVertical: number, deltaHorizontal: number, deltaInOut: number) => void;
  private isWallMountedCallback?: (id: string) => boolean;
  private onUnmountFromWall?: (id: string) => void;
  private verticalMovementMode: boolean = false;
  private wasThumbstickPressed: boolean = false;

  constructor(
    config: ControllerConfig = {},
    callbacks?: {
      onFurnitureMove?: (id: string, delta: THREE.Vector3) => void;
      onFurnitureRotate?: (id: string, deltaY: number) => void;
      onFurnitureDeselect?: (id: string) => void;
      onWallFurnitureMove?: (id: string, deltaVertical: number, deltaHorizontal: number, deltaInOut: number) => void;
      isWallMounted?: (id: string) => boolean;
      onUnmountFromWall?: (id: string) => void;
    }
  ) {
    super(config);
    this.onFurnitureMove = callbacks?.onFurnitureMove;
    this.onFurnitureRotate = callbacks?.onFurnitureRotate;
    this.onFurnitureDeselect = callbacks?.onFurnitureDeselect;
    this.onWallFurnitureMove = callbacks?.onWallFurnitureMove;
    this.isWallMountedCallback = callbacks?.isWallMounted;
    this.onUnmountFromWall = callbacks?.onUnmountFromWall;
  }

  setSelectedFurniture(id: string | null): void {
    this.selectedFurnitureId = id;
  }

  getSelectedFurniture(): string | null {
    return this.selectedFurnitureId;
  }

  update(
    session: any,
    camera: THREE.Camera,
    delta: number
  ): void {
    if (!this.config.enabled || !this.selectedFurnitureId || !session || !session.inputSources) return;

    let shouldCheckInputs = true;
    session.inputSources.forEach((source: any, index: number) => {
      const gamepad = source.gamepad;
      if (!gamepad || !gamepad.buttons) return;

      const gripButton = gamepad.buttons[1];
      if (this.wasButtonJustPressed(index, 1, gripButton?.pressed || false)) {
        if (this.selectedFurnitureId) {
          this.onFurnitureDeselect?.(this.selectedFurnitureId);
          this.selectedFurnitureId = null;
          shouldCheckInputs = false;
        }
      }
    });

    if (!this.selectedFurnitureId || !shouldCheckInputs) return;

    let moveX = 0;
    let moveZ = 0;
    let moveY = 0;
    let rotateInput = 0;

    session.inputSources.forEach((source: any) => {
      const gamepad = source.gamepad;
      if (!gamepad) return;

      // Handle thumbstick click to toggle vertical mode
      const thumbstick_click = gamepad.buttons[3];
      if (thumbstick_click && thumbstick_click.pressed) {
        if (!this.wasThumbstickPressed) {
          const previousMode = this.verticalMovementMode;
          this.verticalMovementMode = !this.verticalMovementMode;
          this.wasThumbstickPressed = true;
          
          if (this.verticalMovementMode && !previousMode && this.selectedFurnitureId) {
            const isWallMounted = this.isWallMountedCallback?.(this.selectedFurnitureId) || false;
            if (isWallMounted) {
              this.onUnmountFromWall?.(this.selectedFurnitureId);
            }
          }
        }
      } else {
        this.wasThumbstickPressed = false;
      }

      if (source.handedness === "right" && gamepad.axes.length >= 4) {
        const x = this.getAxisValue(source, 2);
        const z = this.getAxisValue(source, 3);
        
        if (!this.verticalMovementMode) {
          if (this.isAxisActive(x)) moveX = x;  
          if (this.isAxisActive(z)) moveZ = z;
        } else {
          if (this.isAxisActive(z)) moveY = -z;
        }
      }

      if (source.handedness === "left" && gamepad.axes.length >= 4) {
        const r = this.getAxisValue(source, 2);
        if (this.isAxisActive(r)) rotateInput = -r;
      }
    });

    // Check if furniture is wall-mounted
    const isWallMounted = this.isWallMountedCallback?.(this.selectedFurnitureId) || false;
    
    if (isWallMounted && !this.verticalMovementMode && this.onWallFurnitureMove && (Math.abs(moveX) > 0 || Math.abs(moveZ) > 0 || Math.abs(moveY) > 0)) {
      const deltaVertical = -moveZ * this.config.moveSpeed * delta;
      const deltaHorizontal = moveX * this.config.moveSpeed * delta;
      const deltaInOut = moveY * this.config.moveSpeed * delta;
      this.onWallFurnitureMove(this.selectedFurnitureId, deltaVertical, deltaHorizontal, deltaInOut);
    } else if (Math.abs(moveX) > 0 || Math.abs(moveZ) > 0 || Math.abs(moveY) > 0) {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      const right = new THREE.Vector3();
      right.crossVectors(forward, camera.up).normalize();

      const deltaPosition = new THREE.Vector3();
      deltaPosition.addScaledVector(forward, -moveZ * this.config.moveSpeed * delta);
      deltaPosition.addScaledVector(right, moveX * this.config.moveSpeed * delta);
      deltaPosition.y = moveY * this.config.moveSpeed * delta;

      this.onFurnitureMove?.(this.selectedFurnitureId, deltaPosition);
    }

    if (Math.abs(rotateInput) > 0) {
      const deltaRotation = rotateInput * this.config.rotateSpeed * delta;
      this.onFurnitureRotate?.(this.selectedFurnitureId, deltaRotation);
    }

    if (Math.abs(rotateInput) > 0) {
      const deltaRotation = rotateInput * this.config.rotateSpeed * delta;
      this.onFurnitureRotate?.(this.selectedFurnitureId, deltaRotation);
    }
  }

  reset(): void {
    this.selectedFurnitureId = null;
    this.verticalMovementMode = false;
    this.prevButtonState.clear();
  }
}