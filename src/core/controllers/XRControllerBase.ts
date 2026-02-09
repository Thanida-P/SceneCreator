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

// Alignment state types
export type AlignmentState = 
  | 'idle'
  | 'selectingCorner'
  | 'aligningFirstCorner'
  | 'aligningSecondCorner'
  | 'aligningThirdCorner'
  | 'aligningFourthCorner'
  | 'completed';

export interface Corner {
  position: THREE.Vector3;
  index: number; // 0-3 for the four corners
}

export interface AlignmentData {
  selectedCorner: Corner | null;
  firstCornerWorldPos: THREE.Vector3 | null;
  secondCornerWorldPos: THREE.Vector3 | null;
  thirdCornerWorldPos: THREE.Vector3 | null;
  fourthCornerWorldPos: THREE.Vector3 | null;
  firstCornerModelPos: THREE.Vector3 | null;
  secondCornerModelPos: THREE.Vector3 | null;
  thirdCornerModelPos: THREE.Vector3 | null;
  fourthCornerModelPos: THREE.Vector3 | null;
}

// NavigationController
export class NavigationController extends XRControllerBase {
  private rig: THREE.Group | null = null;
  private isNavigating: boolean = false;
  private onNavigationModeChange?: (isActive: boolean) => void;
  private homeModelGroup: THREE.Group | null = null;
  private alignmentMode: boolean = false;
  
  // Automatic alignment system
  private alignmentState: AlignmentState = 'idle';
  private alignmentData: AlignmentData = {
    selectedCorner: null,
    firstCornerWorldPos: null,
    secondCornerWorldPos: null,
    thirdCornerWorldPos: null,
    fourthCornerWorldPos: null,
    firstCornerModelPos: null,
    secondCornerModelPos: null,
    thirdCornerModelPos: null,
    fourthCornerModelPos: null,
  };
  private onAlignmentStateChange?: (state: AlignmentState, data: AlignmentData) => void;
  private onAlignmentComplete?: (transform: { position: THREE.Vector3; rotation: THREE.Euler }) => void;
  private boundingBox: THREE.Box3 | null = null;

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
    if (homeModelGroup) {
      this.updateBoundingBox();
    }
  }

  setBoundingBox(box: THREE.Box3 | null): void {
    this.boundingBox = box;
  }

  setAlignmentMode(enabled: boolean): void {
    this.alignmentMode = enabled;
    if (!enabled) {
      this.resetAlignment();
    }
  }

  setAlignmentCallbacks(
    onStateChange?: (state: AlignmentState, data: AlignmentData) => void,
    onComplete?: (transform: { position: THREE.Vector3; rotation: THREE.Euler }) => void
  ): void {
    this.onAlignmentStateChange = onStateChange;
    this.onAlignmentComplete = onComplete;
  }

  getAlignmentState(): AlignmentState {
    return this.alignmentState;
  }

  getAlignmentData(): AlignmentData {
    return { ...this.alignmentData };
  }

  getModelCornersPublic(): Corner[] {
    return this.getModelCorners();
  }

  startAutomaticAlignment(): void {
    if (!this.homeModelGroup || !this.boundingBox) return;
    
    this.alignmentState = 'selectingCorner';
    this.alignmentData = {
      selectedCorner: null,
      firstCornerWorldPos: null,
      secondCornerWorldPos: null,
      thirdCornerWorldPos: null,
      fourthCornerWorldPos: null,
      firstCornerModelPos: null,
      secondCornerModelPos: null,
      thirdCornerModelPos: null,
      fourthCornerModelPos: null,
    };
    this.onAlignmentStateChange?.(this.alignmentState, this.alignmentData);
  }

  selectCorner(cornerIndex: number): void {
    if (this.alignmentState !== 'selectingCorner' || !this.boundingBox || !this.homeModelGroup) return;
    
    const corners = this.getModelCorners(); // World space for selection display
    const cornersLocal = this.getModelCornersLocal(); // Local space for calculations
    if (cornerIndex < 0 || cornerIndex >= corners.length) return;
    
    // Store corner in model local space (original, untransformed position)
    this.alignmentData.selectedCorner = corners[cornerIndex]; // Store world space corner for reference
    this.alignmentData.firstCornerModelPos = cornersLocal[cornerIndex].position.clone(); // Store local space position
    this.alignmentState = 'aligningFirstCorner';
    this.onAlignmentStateChange?.(this.alignmentState, this.alignmentData);
  }

  confirmFirstCornerAlignment(worldPosition: THREE.Vector3): void {
    if (this.alignmentState !== 'aligningFirstCorner') return;
    
    this.alignmentData.firstCornerWorldPos = worldPosition.clone();
    this.alignmentState = 'aligningSecondCorner';
    this.onAlignmentStateChange?.(this.alignmentState, this.alignmentData);
  }

  confirmSecondCornerAlignment(worldPosition: THREE.Vector3): void {
    if (this.alignmentState !== 'aligningSecondCorner' || !this.alignmentData.selectedCorner || !this.homeModelGroup) {
      console.warn('confirmSecondCornerAlignment: Invalid state or missing data', {
        state: this.alignmentState,
        hasSelectedCorner: !!this.alignmentData.selectedCorner,
        hasHomeModelGroup: !!this.homeModelGroup
      });
      return;
    }
    
    console.log('confirmSecondCornerAlignment: Starting second corner confirmation');
    
    const cornersLocal = this.getModelCornersLocal();
    // Get the next corner clockwise from the first selected corner
    const secondCornerIndex = (this.alignmentData.selectedCorner.index + 1) % 4;
    
    // Store world position (where user aligned in real world)
    this.alignmentData.secondCornerWorldPos = worldPosition.clone();
    
    // Store second corner in model local space (original, untransformed position)
    this.alignmentData.secondCornerModelPos = cornersLocal[secondCornerIndex].position.clone();
    
    console.log('confirmSecondCornerAlignment: Moving to third corner alignment');
    
    // Move to third corner alignment (next clockwise)
    this.alignmentState = 'aligningThirdCorner';
    this.onAlignmentStateChange?.(this.alignmentState, this.alignmentData);
  }

  confirmThirdCornerAlignment(worldPosition: THREE.Vector3): void {
    if (this.alignmentState !== 'aligningThirdCorner' || !this.alignmentData.selectedCorner || !this.homeModelGroup) {
      console.warn('confirmThirdCornerAlignment: Invalid state or missing data', {
        state: this.alignmentState,
        hasSelectedCorner: !!this.alignmentData.selectedCorner,
        hasHomeModelGroup: !!this.homeModelGroup
      });
      return;
    }
    
    console.log('confirmThirdCornerAlignment: Starting third corner confirmation');
    
    const cornersLocal = this.getModelCornersLocal();
    // Get the third corner clockwise from the first selected corner
    const thirdCornerIndex = (this.alignmentData.selectedCorner.index + 2) % 4;
    
    // Store world position (where user aligned in real world)
    this.alignmentData.thirdCornerWorldPos = worldPosition.clone();
    
    // Store third corner in model local space (original, untransformed position)
    this.alignmentData.thirdCornerModelPos = cornersLocal[thirdCornerIndex].position.clone();
    
    console.log('confirmThirdCornerAlignment: Moving to fourth corner alignment');
    
    // Move to fourth corner alignment (next clockwise)
    this.alignmentState = 'aligningFourthCorner';
    this.onAlignmentStateChange?.(this.alignmentState, this.alignmentData);
  }

  confirmFourthCornerAlignment(worldPosition: THREE.Vector3): void {
    if (this.alignmentState !== 'aligningFourthCorner' || !this.alignmentData.selectedCorner || !this.homeModelGroup) {
      console.warn('confirmFourthCornerAlignment: Invalid state or missing data', {
        state: this.alignmentState,
        hasSelectedCorner: !!this.alignmentData.selectedCorner,
        hasHomeModelGroup: !!this.homeModelGroup
      });
      return;
    }
    
    console.log('confirmFourthCornerAlignment: Starting fourth corner confirmation');
    
    const cornersLocal = this.getModelCornersLocal();
    // Get the fourth corner clockwise from the first selected corner
    const fourthCornerIndex = (this.alignmentData.selectedCorner.index + 3) % 4;
    
    // Store world position (where user aligned in real world)
    this.alignmentData.fourthCornerWorldPos = worldPosition.clone();
    
    // Store fourth corner in model local space (original, untransformed position)
    this.alignmentData.fourthCornerModelPos = cornersLocal[fourthCornerIndex].position.clone();
    
    console.log('confirmFourthCornerAlignment: Calculating transform with all four corners');
    
    // Calculate transformation using all four corners for maximum accuracy
    const transform = this.calculateTransform();
    if (transform && this.homeModelGroup) {
      console.log('confirmFourthCornerAlignment: Transform calculated, applying to model', transform);
      this.homeModelGroup.position.copy(transform.position);
      this.homeModelGroup.rotation.copy(transform.rotation);
      // Update matrix to ensure transformation is applied
      this.homeModelGroup.updateMatrix();
      this.homeModelGroup.updateMatrixWorld(true);
      // Update bounding box after transformation
      this.updateBoundingBox();
      this.onAlignmentComplete?.(transform);
    } else {
      console.error('confirmFourthCornerAlignment: Failed to calculate transform', { transform, hasHomeModelGroup: !!this.homeModelGroup });
    }
    
    console.log('confirmFourthCornerAlignment: Setting state to completed');
    this.alignmentState = 'completed';
    this.onAlignmentStateChange?.(this.alignmentState, this.alignmentData);
    console.log('confirmFourthCornerAlignment: State change callback called');
  }

  resetAlignment(): void {
    this.alignmentState = 'idle';
    this.alignmentData = {
      selectedCorner: null,
      firstCornerWorldPos: null,
      secondCornerWorldPos: null,
      thirdCornerWorldPos: null,
      fourthCornerWorldPos: null,
      firstCornerModelPos: null,
      secondCornerModelPos: null,
      thirdCornerModelPos: null,
      fourthCornerModelPos: null,
    };
    // Cleanup hit test source
    this.cleanupHitTest();
  }

  private getModelCorners(): Corner[] {
    if (!this.boundingBox || !this.homeModelGroup) return [];
    
    const box = this.boundingBox;
    const maxY = box.max.y;
    
    // Get the four top corners (highest Y value) in local model space
    // These are relative to the modelGroup's local coordinate system
    const corners: Corner[] = [
      { position: new THREE.Vector3(box.min.x, maxY, box.min.z), index: 0 },
      { position: new THREE.Vector3(box.max.x, maxY, box.min.z), index: 1 },
      { position: new THREE.Vector3(box.max.x, maxY, box.max.z), index: 2 },
      { position: new THREE.Vector3(box.min.x, maxY, box.max.z), index: 3 },
    ];
    
    // Transform to world space for display/selection purposes
    return corners.map(corner => ({
      position: corner.position.clone().applyMatrix4(this.homeModelGroup!.matrixWorld),
      index: corner.index,
    }));
  }

  // Get corners in local model space (for alignment calculations)
  private getModelCornersLocal(): Corner[] {
    if (!this.boundingBox) return [];
    
    const box = this.boundingBox;
    const maxY = box.max.y;
    
    // Get the four top corners (highest Y value) in local model space
    // These are in the model's local coordinate system (before any transformations)
    return [
      { position: new THREE.Vector3(box.min.x, maxY, box.min.z), index: 0 },
      { position: new THREE.Vector3(box.max.x, maxY, box.min.z), index: 1 },
      { position: new THREE.Vector3(box.max.x, maxY, box.max.z), index: 2 },
      { position: new THREE.Vector3(box.min.x, maxY, box.max.z), index: 3 },
    ];
  }

  private calculateTransform(): { position: THREE.Vector3; rotation: THREE.Euler } | null {
    if (!this.alignmentData.firstCornerWorldPos || 
        !this.alignmentData.secondCornerWorldPos ||
        !this.alignmentData.firstCornerModelPos ||
        !this.alignmentData.secondCornerModelPos ||
        !this.homeModelGroup || !this.boundingBox) {
      return null;
    }
    
    // Get initial rotation and position to preserve X and Z components (prevent tilting)
    const initialRotation = this.homeModelGroup.rotation.clone();
    const initialPosition = this.homeModelGroup.position.clone();
    
    // Get model floor level (minY) for floor alignment
    const modelFloorY = this.boundingBox.min.y;
    
    // Use a more accurate rotation calculation method
    // Calculate the centroid of model corners and world corners
    const modelCentroid = new THREE.Vector3()
      .add(this.alignmentData.firstCornerModelPos)
      .add(this.alignmentData.secondCornerModelPos);
    const worldCentroid = new THREE.Vector3()
      .add(this.alignmentData.firstCornerWorldPos)
      .add(this.alignmentData.secondCornerWorldPos);
    
    if (this.alignmentData.thirdCornerModelPos && this.alignmentData.thirdCornerWorldPos) {
      modelCentroid.add(this.alignmentData.thirdCornerModelPos);
      worldCentroid.add(this.alignmentData.thirdCornerWorldPos);
    }
    if (this.alignmentData.fourthCornerModelPos && this.alignmentData.fourthCornerWorldPos) {
      modelCentroid.add(this.alignmentData.fourthCornerModelPos);
      worldCentroid.add(this.alignmentData.fourthCornerWorldPos);
    }
    
    const cornerCount = 2 + 
      (this.alignmentData.thirdCornerModelPos ? 1 : 0) + 
      (this.alignmentData.fourthCornerModelPos ? 1 : 0);
    modelCentroid.divideScalar(cornerCount);
    worldCentroid.divideScalar(cornerCount);
    
    // Calculate vectors from centroid to corners (centered vectors)
    const modelVec1 = new THREE.Vector3()
      .subVectors(this.alignmentData.secondCornerModelPos, this.alignmentData.firstCornerModelPos);
    const worldVec1 = new THREE.Vector3()
      .subVectors(this.alignmentData.secondCornerWorldPos, this.alignmentData.firstCornerWorldPos);
    
    // Project onto horizontal plane (XZ plane) to only calculate Y-axis rotation
    const modelVec1Horizontal = new THREE.Vector3(modelVec1.x, 0, modelVec1.z);
    const worldVec1Horizontal = new THREE.Vector3(worldVec1.x, 0, worldVec1.z);
    
    // Check if vectors are valid
    if (modelVec1Horizontal.length() < 0.001 || worldVec1Horizontal.length() < 0.001) {
      // Vectors are vertical, no horizontal rotation needed
      const cornerHeightOffset = this.alignmentData.firstCornerModelPos.y - modelFloorY;
      const targetFloorY = this.alignmentData.firstCornerWorldPos.y - cornerHeightOffset;
      
      const offset = new THREE.Vector3(
        this.alignmentData.firstCornerWorldPos.x - this.alignmentData.firstCornerModelPos.x,
        targetFloorY - modelFloorY,
        this.alignmentData.firstCornerWorldPos.z - this.alignmentData.firstCornerModelPos.z
      );
      
      return { 
        position: initialPosition.clone().add(offset), 
        rotation: new THREE.Euler(initialRotation.x, initialRotation.y, initialRotation.z) 
      };
    }
    
    // Normalize
    modelVec1Horizontal.normalize();
    worldVec1Horizontal.normalize();
    
    // Calculate rotation angle from the primary edge vector (first -> second)
    const dot1 = Math.max(-1, Math.min(1, modelVec1Horizontal.dot(worldVec1Horizontal)));
    const angle1 = Math.acos(dot1);
    const cross1 = new THREE.Vector3().crossVectors(modelVec1Horizontal, worldVec1Horizontal);
    let rotationY = cross1.y > 0 ? angle1 : -angle1;
    
    // If we have all four corners, use the perpendicular edge (first->fourth) to refine
    if (this.alignmentData.fourthCornerWorldPos && this.alignmentData.fourthCornerModelPos) {
      const modelVec4 = new THREE.Vector3()
        .subVectors(this.alignmentData.fourthCornerModelPos, this.alignmentData.firstCornerModelPos);
      const worldVec4 = new THREE.Vector3()
        .subVectors(this.alignmentData.fourthCornerWorldPos, this.alignmentData.firstCornerWorldPos);
      
      const modelVec4Horizontal = new THREE.Vector3(modelVec4.x, 0, modelVec4.z).normalize();
      const worldVec4Horizontal = new THREE.Vector3(worldVec4.x, 0, worldVec4.z).normalize();
      
      // Calculate rotation from the perpendicular edge (first->fourth)
      const dot4 = Math.max(-1, Math.min(1, modelVec4Horizontal.dot(worldVec4Horizontal)));
      const angle4 = Math.acos(dot4);
      const cross4 = new THREE.Vector3().crossVectors(modelVec4Horizontal, worldVec4Horizontal);
      const rotationY4 = cross4.y > 0 ? angle4 : -angle4;
      
      // Average both rotations for better accuracy
      rotationY = (rotationY * 0.55 + rotationY4 * 0.45);
    } else if (this.alignmentData.thirdCornerWorldPos && this.alignmentData.thirdCornerModelPos) {
      // Use third corner for refinement if fourth is not available
      const modelVec3 = new THREE.Vector3()
        .subVectors(this.alignmentData.thirdCornerModelPos, this.alignmentData.firstCornerModelPos);
      const worldVec3 = new THREE.Vector3()
        .subVectors(this.alignmentData.thirdCornerWorldPos, this.alignmentData.firstCornerWorldPos);
      
      const modelVec3Horizontal = new THREE.Vector3(modelVec3.x, 0, modelVec3.z).normalize();
      const worldVec3Horizontal = new THREE.Vector3(worldVec3.x, 0, worldVec3.z).normalize();
      
      // Calculate rotation from third corner vector
      const dot3 = Math.max(-1, Math.min(1, modelVec3Horizontal.dot(worldVec3Horizontal)));
      const angle3 = Math.acos(dot3);
      const cross3 = new THREE.Vector3().crossVectors(modelVec3Horizontal, worldVec3Horizontal);
      const rotationY3 = cross3.y > 0 ? angle3 : -angle3;
      
      // Average the rotation from both vectors
      rotationY = (rotationY + rotationY3) / 2;
    }
    
    
    // Create rotation only around Y-axis, preserving X and Z from initial rotation
    const rotation = new THREE.Euler(
      initialRotation.x,  // Preserve X rotation (no tilting)
      initialRotation.y + rotationY,  // Apply Y rotation
      initialRotation.z   // Preserve Z rotation (no tilting)
    );
    
    // Create quaternion for rotation calculation
    const quaternion = new THREE.Quaternion().setFromEuler(rotation);
    
    // Rotate the first corner model position (in model local space)
    // This gives us where the corner will be in local space after rotation
    const rotatedFirstCornerLocal = this.alignmentData.firstCornerModelPos.clone()
      .applyQuaternion(quaternion);
    
    // Calculate the floor level offset
    // The corner is at firstCornerModelPos.y (in local space), and floor is at modelFloorY
    // We want to align the model floor to the real-world floor level
    // The user aligned to the top corner, so we calculate where the floor should be
    const cornerHeightOffset = this.alignmentData.firstCornerModelPos.y - modelFloorY;
    const targetFloorY = this.alignmentData.firstCornerWorldPos.y - cornerHeightOffset;
    
    // Calculate position: we want the rotated corner (in local space) to be at firstCornerWorldPos (in world space)
    // When model is at position P with rotation R, a local point L becomes world point: P + R(L)
    // We want: firstCornerWorldPos = P + R(rotatedFirstCornerLocal)
    // Therefore: P = firstCornerWorldPos - R(rotatedFirstCornerLocal)
    // But R(rotatedFirstCornerLocal) is just rotatedFirstCornerLocal (already rotated)
    // However, we need to account for the rotation being applied by Three.js
    // The position should place the rotated local corner at the world position
    const position = new THREE.Vector3(
      this.alignmentData.firstCornerWorldPos.x - rotatedFirstCornerLocal.x,
      targetFloorY - modelFloorY, // Align floor level (model floor at target floor Y)
      this.alignmentData.firstCornerWorldPos.z - rotatedFirstCornerLocal.z
    );
    
    return { position, rotation };
  }

  private updateBoundingBox(): void {
    if (!this.homeModelGroup) {
      this.boundingBox = null;
      return;
    }
    
    this.boundingBox = new THREE.Box3().setFromObject(this.homeModelGroup);
  }

  private hitTestSource: XRHitTestSource | null = null;
  private viewerSpace: XRReferenceSpace | null = null;
  private lastHitPoint: THREE.Vector3 | null = null;

  // Initialize AR hit test source
  async initializeHitTest(session: XRSession): Promise<void> {
    if (!session || this.hitTestSource) return;
    
    try {
      // Request hit test source for viewer space (camera-based)
      this.viewerSpace = await (session as any).requestReferenceSpace('viewer');
      this.hitTestSource = await (session as any).requestHitTestSource({ space: this.viewerSpace });
      console.log('AR hit test source initialized');
    } catch (err) {
      console.warn('Failed to initialize AR hit test:', err);
    }
  }

  // Cleanup hit test source
  cleanupHitTest(): void {
    if (this.hitTestSource) {
      this.hitTestSource.cancel();
      this.hitTestSource = null;
    }
    this.viewerSpace = null;
    this.lastHitPoint = null;
  }

  // Head tracking alignment methods using AR hit testing
  updateHeadTrackingAlignment(
    camera: THREE.Camera,
    session: any,
    raycaster: THREE.Raycaster,
    scene: THREE.Scene,
    frame?: XRFrame
  ): THREE.Vector3 | null {
    if (this.alignmentState !== 'aligningFirstCorner' && 
        this.alignmentState !== 'aligningSecondCorner' &&
        this.alignmentState !== 'aligningThirdCorner' &&
        this.alignmentState !== 'aligningFourthCorner') {
      return null;
    }

    // Get camera position and direction
    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);
    
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    // Use AR hit testing if available (for AR mode)
    if (session && frame && (session as any).mode === 'immersive-ar') {
      try {
        // Initialize hit test source if not already done
        if (!this.hitTestSource && session.requestHitTestSource) {
          this.initializeHitTest(session).catch(err => {
            console.warn('Failed to initialize hit test:', err);
          });
        }

        // Perform hit test if we have a hit test source and viewer space
        if (this.hitTestSource && this.viewerSpace && frame) {
          const hitTestResults = frame.getHitTestResults(this.hitTestSource);
          
          if (hitTestResults && hitTestResults.length > 0) {
            // Get the first hit result
            const hit = hitTestResults[0];
            const pose = hit.getPose(this.viewerSpace);
            
            if (pose) {
              // Convert XR pose to Three.js Vector3
              const xrMatrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
              const hitPoint = new THREE.Vector3().setFromMatrixPosition(xrMatrix);
              this.lastHitPoint = hitPoint;
              return hitPoint;
            }
          }
        }
        
        // Return last hit point if available, otherwise use fallback
        if (this.lastHitPoint) {
          return this.lastHitPoint.clone();
        }
      } catch (err) {
        console.warn('AR hit test failed, using fallback:', err);
      }
    }

    // Fallback: Use default depth if hit test not available
    // This should only happen if AR hit testing is not supported
    const defaultDepth = 3.0; // Default depth in meters
    const fallbackPoint = cameraPosition.clone().addScaledVector(cameraDirection, defaultDepth);
    return fallbackPoint;
  }

  // Get alignment line position based on head tracking
  getAlignmentLinePosition(
    camera: THREE.Camera,
    targetDepth: number
  ): { position: THREE.Vector3; direction: THREE.Vector3 } | null {
    if (this.alignmentState !== 'aligningFirstCorner' && 
        this.alignmentState !== 'aligningSecondCorner') {
      return null;
    }

    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);
    
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    // Calculate position at target depth
    const linePosition = cameraPosition.clone().addScaledVector(cameraDirection, targetDepth);

    return {
      position: linePosition,
      direction: cameraDirection.clone()
    };
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

    // During automatic alignment, disable controller-based navigation
    if (this.alignmentState !== 'idle' && this.alignmentState !== 'completed') {
      return;
    }

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

    if (this.alignmentMode && this.homeModelGroup && this.alignmentState === 'idle') {
      // Legacy manual alignment mode (only when not in automatic alignment)
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