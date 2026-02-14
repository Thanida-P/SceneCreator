import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Environment, PerspectiveCamera } from "@react-three/drei";
import { useXRStore, useXR } from "@react-three/xr";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CatalogToggle } from "../panel/furniture/FurnitureCatalogToggle";
import { VRInstructionPanel } from "../panel/VRInstructionPanel";
import { VRFurniturePanel } from "../panel/furniture/FurniturePanel";
import { ScaleControlPanel} from "../panel/VRSlider";
import { HeadLockedUI } from "../panel/common/HeadLockedUI";
import { VRControlPanel } from "../panel/control/ControlPanel";
import { ControlPanelToggle } from "../panel/control/ControlPanelToggle";
import { VRNotificationPanel } from "../panel/common/NotificationPanel";
import { VRPreciseCollisionPanel } from "../panel/furniture/FurnitureCollisionPanel";
import { SceneManager } from "../../core/managers/SceneManager";
import { FurnitureItem, FurnitureMetadata } from "../../core/objects/FurnitureItem";
import { HomeModel } from "../../core/objects/HomeModel";
import { NavigationController, FurnitureEditController } from "../../core/controllers/XRControllerBase";
import { makeAuthenticatedRequest, logout } from "../../utils/Auth";
import { VRSidebar } from "../panel/VRSidebar";
import { TransformGizmo } from "../panel/TransformGizmo";
import { RotationGizmo } from "../panel/RotationGizmo";
import { VRAlignmentPanel, VRAlignmentConfirmPanel } from "../panel/VRAlignmentPanel";
import { CornerSelectionVisualization } from "../panel/CornerSelectionVisualization";
import { AlignmentLineVisualization } from "../panel/AlignmentLineVisualization";
import { AlignmentInstructionPanel } from "../panel/AlignmentInstructionPanel";
import { ARSessionHandler } from "./ARSessionHandler";



const DIGITAL_HOME_PLATFORM_BASE_URL = import.meta.env.VITE_DIGITAL_HOME_PLATFORM_URL;

interface SceneContentProps {
  homeId: string;
  digitalHome?: {
    spatialData?: {
      boundary?: {
        min_x: number;
        max_x: number;
        min_y: number;
        max_y: number;
        min_z: number;
        max_z: number;
      };
    };
  };
  arModeRequested?: boolean;
}

interface SceneState {
  showSlider: boolean;
  showFurniture: boolean;
  showInstructions: boolean;
  showControlPanel: boolean;
  showNotification: boolean;
  notificationMessage: string;
  notificationType: "success" | "error" | "info";
  notificationFromControlPanel: boolean;
  showMoveCloserPanel: boolean;
  showPreciseCheckPanel: boolean;
  preciseCheckInProgress: boolean;
  saving: boolean;
  loading: boolean;
  navigationMode: boolean;
  selectedItemId: string | null;
  sliderValue: number;
  rotationValue: number;
  furnitureCatalog: any[];
  catalogLoading: boolean;
  showSidebar: boolean;
  sidebarActiveItem: string | null;
  showTransformGizmo: boolean;
  gizmoPosition: [number, number, number] | null;
  showRotationGizmo: boolean;
  rotationGizmoPosition: [number, number, number] | null;
  showScalePanel: boolean;
  selectedItemPlacementMode: 'floor' | 'wall';
  alignmentStatus: 'pending' | 'aligning' | 'aligned';
  alignmentMode: 'world' | 'free' | null;
  showAlignmentPanel: boolean;
  showAlignmentConfirm: boolean;
  homeTransparent: boolean;
  showCornerSelection: boolean;
  showHeadTrackingAlignment: boolean;
  alignmentState: 'idle' | 'selectingCorner' | 'aligningFirstCorner' | 'aligningSecondCorner' | 'aligningThirdCorner' | 'aligningFourthCorner' | 'completed';
  alignmentARModeRequested: boolean;
}

class SceneContentLogic {
  private state: SceneState;
  private setState: (updater: Partial<SceneState> | ((prev: SceneState) => Partial<SceneState>)) => void;
  private homeId: string;
  private navigate: (path: string) => void;
  
  // Managers
  public sceneManager: SceneManager | null = null;
  public navigationController: NavigationController | null = null;
  public furnitureController: FurnitureEditController | null = null;
  
  // Refs
  public pendingMove: [number, number, number] | null = null;
  public currentAABBPosition: [number, number, number] | null = null;
  public modelUrlCache: Map<number, string> = new Map();
  private prevTriggerState: Map<number, boolean> = new Map();
  private xrStore: any = null;
  private isRequestingAR: boolean = false; // Prevent multiple simultaneous AR requests
  private cornerSelectionReady: boolean = false; // Flag to prevent corner selection until UI is ready
  private alignmentReady: boolean = false; // Flag to prevent alignment trigger until AR is initialized
  private initialXRMode: 'vr' | 'ar' | null = null; // Track initial XR mode for confirmation step

  constructor(
    homeId: string,
    navigate: (path: string) => void,
    setState: (updater: Partial<SceneState> | ((prev: SceneState) => Partial<SceneState>)) => void
  ) {
    this.homeId = homeId;
    this.navigate = navigate;
    this.setState = setState;
    
    this.state = {
      showSlider: false,
      showFurniture: false,
      showInstructions: false,
      showControlPanel: false,
      showNotification: false,
      notificationMessage: "",
      notificationType: "info",
      notificationFromControlPanel: false,
      showMoveCloserPanel: false,
      showPreciseCheckPanel: false,
      preciseCheckInProgress: false,
      saving: false,
      loading: true,
      navigationMode: false,
      selectedItemId: null,
      sliderValue: 1.0,
      rotationValue: 0,
      furnitureCatalog: [],
      catalogLoading: false,
      showSidebar: false,
      sidebarActiveItem: null,
      showTransformGizmo: false,
      gizmoPosition: null,
      showRotationGizmo: false,
      rotationGizmoPosition: null,
      showScalePanel: false,
      selectedItemPlacementMode: 'floor',
      alignmentStatus: 'pending',
      alignmentMode: null,
      showAlignmentPanel: true,
      showAlignmentConfirm: false,
      homeTransparent: false,
      showCornerSelection: false,
      showHeadTrackingAlignment: false,
      alignmentState: 'idle',
      alignmentARModeRequested: false,
    };
  }

  getState(): SceneState {
    return this.state;
  }

  updateState(update: Partial<SceneState>): void {
    this.state = { ...this.state, ...update };
    this.setState(update);
  }

  initializeManagers(scene: THREE.Scene): void {
    this.sceneManager = new SceneManager(scene, {
      enableCollisionDetection: true,
      enableDebugMode: false,
      floorLevel: 0,
    });

    this.navigationController = new NavigationController(
      {
        moveSpeed: 2.5,
        rotateSpeed: 1.5,
        deadzone: 0.15,
      },
      (isActive) => {
        this.updateState({ navigationMode: isActive });
      }
    );

    this.furnitureController = new FurnitureEditController(
      {
        moveSpeed: 1.5,
        rotateSpeed: 1.5,
        deadzone: 0.1,
      },
      {
        onFurnitureMove: async (id, delta) => {
          await this.handleFurnitureMove(id, delta);
        },
        onFurnitureRotate: (id, deltaY) => {
          this.handleFurnitureRotate(id, deltaY);
        },
        onFurnitureDeselect: (id) => {
          this.handleFurnitureDeselect(id);
        },
        onWallFurnitureMove: async (id, deltaVertical, deltaHorizontal) => {
          await this.handleWallFurnitureMove(id, deltaVertical, deltaHorizontal);
        },
        isWallMounted: (id) => {
          return this.sceneManager?.isWallMounted(id) || false;
        },
        onUnmountFromWall: (id) => {
          this.sceneManager?.unmountFromWallAndFloat(id);
        },
      }
    );
  }

  setupXRRig(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.navigationController) return;

    let rig = scene.getObjectByName("CustomXRRig") as THREE.Group;
    if (!rig) {
      rig = new THREE.Group();
      rig.name = "CustomXRRig";
      scene.add(rig);
    }
    if (camera.parent !== rig) {
      rig.add(camera);
    }
    this.navigationController.setRig(rig);
  }

  setXRStore(xrStore: any): void {
    this.xrStore = xrStore;
  }

  async requestARMode(): Promise<void> {
    // Prevent multiple simultaneous requests
    if (this.isRequestingAR) {
      console.log('AR request already in progress, skipping...');
      return;
    }

    if (!this.xrStore) {
      console.warn('XR store not available');
      return;
    }

    this.isRequestingAR = true;

    try {
      // Check if AR is supported
      if (!navigator.xr || !(navigator.xr as any).isSessionSupported) {
        console.warn('XR not available');
        this.isRequestingAR = false;
        return;
      }

      const isARSupported = await (navigator.xr as any).isSessionSupported('immersive-ar');
      if (!isARSupported) {
        console.warn('AR not supported');
        this.isRequestingAR = false;
        return;
      }

      // Get current session
      const currentSession = this.xrStore.getState().session;
      
      // If already in AR mode, return
      if (currentSession && (currentSession as any).mode === 'immersive-ar') {
        console.log('Already in AR mode');
        this.isRequestingAR = false;
        return;
      }

      // Wait for renderer to be available
      let gl = this.xrStore.getState().gl;
      let retries = 0;
      const maxRetries = 30; // Increase retries
      
      // Initial wait to let renderer initialize
      await new Promise(resolve => setTimeout(resolve, 200));
      
      while ((!gl || !gl.xr) && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
        gl = this.xrStore.getState().gl;
        retries++;
        if (gl && gl.xr) {
          console.log(`Renderer available after ${retries} retries`);
          break;
        }
      }

      if (!gl || !gl.xr) {
        console.error('Renderer not available after waiting', {
          hasGl: !!gl,
          hasXr: !!(gl && gl.xr),
          retries
        });
        this.isRequestingAR = false;
        return;
      }

      // End current session if exists
      if (currentSession && (currentSession as any).mode !== 'immersive-ar') {
        try {
          if (!currentSession.ended) {
            await currentSession.end();
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (err) {
          console.warn('Error ending previous session:', err);
        }
      }

      // Request AR session
      const arSession = await (navigator.xr as any).requestSession('immersive-ar', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['bounded-floor', 'hand-tracking', 'layers']
      });

      // Set session on renderer
      if (gl && gl.xr) {
        await gl.xr.setSession(arSession);
        this.xrStore.setState({ session: arSession });
        console.log('AR session started for alignment');
        console.log('Environment blend mode:', (arSession as any).environmentBlendMode);
      } else {
        console.error('Renderer lost during session request');
        await arSession.end();
      }
    } catch (err) {
      console.error('Failed to request AR mode:', err);
      // If it's a cancellation error, it means another request was made
      if (err instanceof Error && err.message.includes('cancelled')) {
        console.warn('AR session request was cancelled (likely called multiple times)');
      }
    } finally {
      this.isRequestingAR = false;
    }
  }

  cleanup(): void {
    this.sceneManager?.dispose();
    this.navigationController?.reset();
    this.furnitureController?.reset();
    this.modelUrlCache.forEach(url => URL.revokeObjectURL(url));
  }

  async loadHome(digitalHome?: any): Promise<void> {
    if (!this.sceneManager) return;

    try {
      const response = await makeAuthenticatedRequest(
        `/digitalhomes/download_digital_home/${this.homeId}/`
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const homeModel = new HomeModel(
          this.homeId,
          'Digital Home',
          parseInt(this.homeId),
          url,
          digitalHome?.spatialData?.boundary
        );

        await this.sceneManager.setHomeModel(homeModel);
      }
    } catch (error) {
      console.error('Failed to load home:', error);
    }
  }

  async loadFurnitureCatalog(): Promise<void> {
    this.updateState({ catalogLoading: true });
    try {
      const response = await makeAuthenticatedRequest('/digitalhomes/list_available_items/');

      if (response.ok) {
        const data = await response.json();
        const items = data.available_items.map((item: any) => ({
          id: item.id.toString(),
          name: item.name,
          description: item.description,
          model_id: item.model_id,
          image: item.image,
          category: item.category,
          type: item.type,
          is_container: item.is_container,
          wall_mountable: item.wall_mountable || false,
        }));

        this.updateState({ furnitureCatalog: items });

        for (const item of items) {
          await this.loadFurnitureModel(item.model_id);
        }
      }
    } catch (error) {
      console.error('Error loading furniture catalog:', error);
    } finally {
      this.updateState({ catalogLoading: false });
    }
  }

  private async loadFurnitureModel(modelId: number): Promise<void> {
    if (this.modelUrlCache.has(modelId)) return;

    try {
      const response = await makeAuthenticatedRequest(`/products/get_3d_model/${modelId}/`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        this.modelUrlCache.set(modelId, url);
      }
    } catch (error) {
      console.error(`Error loading model ${modelId}:`, error);
    }
  }

  async loadDeployedItems(): Promise<void> {
    if (!this.sceneManager || this.modelUrlCache.size === 0) return;

    this.updateState({ loading: true });
    try {
      const response = await makeAuthenticatedRequest(
        `/digitalhomes/get_deployed_items_details/${this.homeId}/`
      );

      if (response.ok) {
        const data = await response.json();

        for (const itemObj of data.deployed_items) {
          const itemId = Object.keys(itemObj)[0];
          const itemData = itemObj[itemId];

          const modelPath = this.modelUrlCache.get(itemData.model_id);
          if (!modelPath) continue;

          const metadata: FurnitureMetadata = {
            description: itemData.description,
            category: itemData.category,
            type: itemData.type,
            isContainer: itemData.is_container,
          };

          const furniture = new FurnitureItem(
            itemId,
            itemData.name,
            itemData.model_id,
            modelPath,
            metadata,
            {
              position: itemData.spatialData.positions,
              rotation: itemData.spatialData.rotation,
              scale: itemData.spatialData.scale[0],
            }
          );

          await this.sceneManager.addFurniture(furniture);
        }

        if (this.sceneManager) {
          setTimeout(async () => {
            await this.sceneManager!.updateAllCollisions();
          }, 200);
        }
      }
    } catch (error) {
      console.error('Error loading deployed items:', error);
    } finally {
      this.updateState({ loading: false });
    }
  }

  showNotificationMessage(
    message: string,
    type: "success" | "error" | "info" = "info",
    fromControlPanel: boolean = false
  ): void {
    this.updateState({
      showControlPanel: fromControlPanel ? this.state.showControlPanel : false,
      showMoveCloserPanel: false,
      showPreciseCheckPanel: false,
      notificationMessage: message,
      notificationType: type,
      notificationFromControlPanel: fromControlPanel,
      showNotification: true,
    });
  }

  handleToggleUI(): void {
    const { showMoveCloserPanel, showPreciseCheckPanel, showControlPanel, showInstructions, showFurniture, selectedItemId } = this.state;

    if (showMoveCloserPanel || showPreciseCheckPanel) return;

    if (showControlPanel) {
      this.updateState({ showControlPanel: false });
    } else if (showInstructions) {
      this.updateState({ showInstructions: false, showFurniture: true });
    } else if (showFurniture) {
      this.updateState({
        showFurniture: false,
        showSlider: selectedItemId !== null,
      });
    } else {
      this.updateState({ showFurniture: true, showSlider: false });
    }
  }

  handleToggleControlPanel(): void {
    const { showMoveCloserPanel, showPreciseCheckPanel, showControlPanel } = this.state;

    if (showMoveCloserPanel || showPreciseCheckPanel) return;

    this.updateState({
      showControlPanel: !showControlPanel,
      showFurniture: false,
      showSlider: false,
      showInstructions: false,
    });
  }

  handleHelp(): void {
    this.updateState({
      showInstructions: true,
      showFurniture: false,
      showSlider: false,
      showControlPanel: false,
      showMoveCloserPanel: false,
      showPreciseCheckPanel: false,
    });
  }

  handleAlignmentModeSelect(mode: "world" | "free"): void {
    if (mode === "world") {
      // Start automatic alignment
      // First, show model in VR mode (not transparent)
      const homeModel = this.sceneManager?.getHomeModel();
      if (homeModel) {
        homeModel.setOpacity(1.0);
        homeModel.setVisible(true);
      }
      
      // Initialize automatic alignment
      if (this.navigationController && homeModel) {
        // Ensure model group is ready
        const modelGroup = homeModel.getGroup();
        if (!modelGroup) {
          console.error('Model group not available');
          return;
        }

        this.navigationController.setHomeModelGroup(modelGroup);
        const boundingBox = new THREE.Box3().setFromObject(modelGroup);
        if (boundingBox.isEmpty()) {
          console.warn('Bounding box is empty, waiting for model to load...');
          // Wait a bit and try again
          setTimeout(() => {
            const retryBox = new THREE.Box3().setFromObject(modelGroup);
            if (!retryBox.isEmpty()) {
              this.navigationController?.setBoundingBox(retryBox);
            }
          }, 500);
        } else {
          this.navigationController.setBoundingBox(boundingBox);
        }

        this.navigationController.setAlignmentCallbacks(
          (state, data) => {
            console.log('Alignment state changed:', state);
            // Only update alignmentState, let the specific state handlers manage other state
            this.updateState({ alignmentState: state });
            
            // Handle state changes
            if (state === 'selectingCorner') {
              // Show corner selection UI - ensure model is visible
              if (homeModel) {
                homeModel.setVisible(true);
                homeModel.setOpacity(1.0);
                homeModel.setTransparent(false);
              }
              // Disable corner selection initially to prevent accidental selection
              this.cornerSelectionReady = false;
              this.updateState({
                showCornerSelection: true,
                showHeadTrackingAlignment: false,
                homeTransparent: false,
              });
              // Enable corner selection after a short delay to ensure UI is initialized
              setTimeout(() => {
                this.cornerSelectionReady = true;
                console.log('Corner selection ready');
              }, 500); // Wait 500ms for corner indicators to initialize
            } else if (state === 'aligningFirstCorner') {
              // Reset trigger state when transitioning to alignment mode
              this.prevTriggerState.clear();
              // Disable alignment input until AR is ready
              this.alignmentReady = false;
              
              // Switch to AR mode - hide model but keep it
              if (homeModel) {
                homeModel.setVisible(false);
              }
              
              // Update state first to show alignment UI
              // Set alignmentARModeRequested to trigger ARSessionHandler
              this.updateState({
                showCornerSelection: false,
                showHeadTrackingAlignment: true,
                homeTransparent: true,
                alignmentARModeRequested: true, // Trigger AR mode via ARSessionHandler
              });
              
              // Wait for AR session to be active before allowing alignment input
              // Check for AR session activation
              if (this.xrStore) {
                const checkARSession = setInterval(() => {
                  const session = this.xrStore?.getState()?.session;
                  if (session && (session as any).mode === 'immersive-ar') {
                    console.log('AR session active, enabling alignment input');
                    this.alignmentReady = true;
                    clearInterval(checkARSession);
                  }
                }, 100);
                
                // Timeout after 5 seconds
                setTimeout(() => {
                  clearInterval(checkARSession);
                  if (!this.alignmentReady) {
                    console.warn('AR session not detected after timeout, enabling alignment anyway');
                    this.alignmentReady = true;
                  }
                }, 5000);
              } else {
                // If xrStore not available, enable after delay anyway
                setTimeout(() => {
                  this.alignmentReady = true;
                }, 1000);
              }
            } else if (state === 'aligningSecondCorner') {
              // Reset trigger state for second corner alignment
              this.prevTriggerState.clear();
              // Disable alignment input briefly to prevent accidental trigger from previous step
              this.alignmentReady = false;
              setTimeout(() => {
                this.alignmentReady = true;
              }, 300);
              // Continue in AR mode (ensure AR mode is still requested)
              this.updateState({ 
                showHeadTrackingAlignment: true,
                alignmentARModeRequested: true,
              });
            } else if (state === 'aligningThirdCorner') {
              // Reset trigger state for third corner alignment
              this.prevTriggerState.clear();
              // Disable alignment input briefly to prevent accidental trigger from previous step
              this.alignmentReady = false;
              setTimeout(() => {
                this.alignmentReady = true;
                console.log('Third corner alignment ready');
              }, 300);
              // Continue in AR mode (ensure AR mode is still requested)
              this.updateState({ 
                showHeadTrackingAlignment: true,
                alignmentARModeRequested: true,
              });
            } else if (state === 'aligningFourthCorner') {
              // Reset trigger state for fourth corner alignment
              this.prevTriggerState.clear();
              // Disable alignment input briefly to prevent accidental trigger from previous step
              this.alignmentReady = false;
              setTimeout(() => {
                this.alignmentReady = true;
                console.log('Fourth corner alignment ready');
              }, 300);
              // Continue in AR mode (ensure AR mode is still requested)
              this.updateState({ 
                showHeadTrackingAlignment: true,
                alignmentARModeRequested: true,
              });
            } else if (state === 'completed') {
              // Alignment complete - switch to VR mode to show model for confirmation
              // End AR session if active and explicitly request VR mode
              const switchToVR = async () => {
                const currentSession = this.xrStore?.getState()?.session;
                
                if (currentSession && (currentSession as any).mode === 'immersive-ar') {
                  try {
                    // End AR session
                    await currentSession.end();
                    // Wait for session to fully end
                    await new Promise(resolve => setTimeout(resolve, 800));
                  } catch (err: any) {
                    console.warn('Error ending AR session:', err);
                  }
                }
                
                // Explicitly request VR mode
                try {
                  if (navigator.xr && (navigator.xr as any).isSessionSupported) {
                    const isVRSupported = await (navigator.xr as any).isSessionSupported('immersive-vr');
                    if (isVRSupported) {
                      await this.xrStore.enterVR();
                      console.log('Switched to VR mode for confirmation');
                    } else {
                      console.warn('VR not supported');
                    }
                  }
                } catch (vrErr) {
                  console.warn('Failed to enter VR mode:', vrErr);
                }
              };
              
              // Switch to VR asynchronously
              switchToVR();
              
              // Show model in VR mode for confirmation
              if (homeModel) {
                homeModel.setVisible(true);
                homeModel.setOpacity(1.0); // Full opacity in VR for confirmation
                homeModel.setTransparent(false);
              }
              
              this.updateState({
                alignmentStatus: "aligned",
                showHeadTrackingAlignment: false,
                showCornerSelection: false,
                showInstructions: true,
                showSidebar: true,
                showAlignmentConfirm: true, // Show confirmation panel
                alignmentARModeRequested: false, // Stop requesting AR mode
                homeTransparent: false, // VR mode for confirmation
              });
              
              // Show success notification
              this.showNotificationMessage(
                '✅ Alignment complete! Please confirm the position.',
                'success'
              );
            }
          },
          (transform) => {
            // Alignment complete callback
            console.log('Alignment complete:', transform);
          }
        );
        
        // Reset trigger state to prevent accidental corner selection from button press used to enter alignment
        // Clear and wait a moment to ensure button state is reset
        this.prevTriggerState.clear();
        this.cornerSelectionReady = false; // Disable corner selection until ready
        
        // Set initial state for corner selection BEFORE starting alignment
        // This ensures the UI is ready when the callback fires
        this.updateState({
          alignmentMode: "world",
          alignmentStatus: "aligning",
          showAlignmentPanel: false,
          showAlignmentConfirm: false,
          showCornerSelection: true,
          showHeadTrackingAlignment: false,
          alignmentState: 'selectingCorner',
          homeTransparent: false, // Start in VR mode for corner selection
        });
        
        // Start automatic alignment - this will trigger the callback with 'selectingCorner' state
        // The callback will maintain the showCornerSelection state and enable selection after delay
        this.navigationController.startAutomaticAlignment();
      } else {
        // If navigation controller or home model not available, still set state
        this.updateState({
          alignmentMode: "world",
          alignmentStatus: "aligning",
          showAlignmentPanel: false,
          showAlignmentConfirm: false,
          showCornerSelection: true,
          showHeadTrackingAlignment: false,
          alignmentState: 'selectingCorner',
          homeTransparent: false,
        });
      }
    } else {
      // Free roam mode - skip alignment
      if (this.state.homeTransparent) {
        this.sceneManager?.getHomeModel()?.setOpacity(0.0);
      }
      this.updateState({
        alignmentMode: "free",
        alignmentStatus: "aligned",
        showAlignmentPanel: false,
        showAlignmentConfirm: false,
        showInstructions: true,
        showSidebar: true,
      });
    }
  }

  handleAlignmentConfirm(): void {
    const homeModel = this.sceneManager?.getHomeModel();
    
    // If started in AR mode, switch back to AR; otherwise stay in VR
    if (this.initialXRMode === 'ar') {
      // Switch back to AR mode
      this.updateState({
        alignmentStatus: "aligned",
        showAlignmentConfirm: false,
        showInstructions: true,
        showSidebar: true,
        alignmentARModeRequested: true, // Request AR mode again
        homeTransparent: true,
      });
      
      if (homeModel) {
        homeModel.setOpacity(0.3);
        homeModel.setTransparent(true);
      }
    } else {
      // Stay in VR mode
      if (this.state.homeTransparent) {
        homeModel?.setOpacity(0.0);
      }
      this.updateState({
        alignmentStatus: "aligned",
        showAlignmentConfirm: false,
        showInstructions: true,
        showSidebar: true,
        homeTransparent: this.state.homeTransparent,
      });
    }
    
    // Reset initial mode tracking
    this.initialXRMode = null;
  }

  handleAlignmentCancel(): void {
    // Cleanup hit test source
    if (this.navigationController) {
      this.navigationController.resetAlignment();
    }
    
    // Reset to initial state
    if (this.state.homeTransparent) {
      this.sceneManager?.getHomeModel()?.setOpacity(0.0);
    }
    
    // End AR session if active
    const currentSession = this.xrStore?.getState()?.session;
    if (currentSession && (currentSession as any).mode === 'immersive-ar') {
      currentSession.end().catch((err: any) => {
        console.warn('Error ending AR session:', err);
      });
    }
    
    this.updateState({
      alignmentMode: null,
      alignmentStatus: "pending",
      showAlignmentConfirm: false,
      showAlignmentPanel: true,
      showCornerSelection: false,
      showHeadTrackingAlignment: false,
      alignmentState: 'idle',
      alignmentARModeRequested: false,
    });
    
    // Reset initial mode tracking
    this.initialXRMode = null;
  }

  handleCornerSelect(cornerIndex: number): void {
    // Prevent corner selection until UI is ready
    if (!this.cornerSelectionReady) {
      console.log('Corner selection not ready yet, ignoring selection');
      return;
    }
    
    if (this.navigationController) {
      this.navigationController.selectCorner(cornerIndex);
    }
    this.cornerSelectionReady = false; // Disable further selections
    this.updateState({
      showCornerSelection: false,
    });
  }

  handleConfirmAlignmentPoint(): void {
    if (!this.navigationController) return;
    
    const state = this.navigationController.getAlignmentState();
    const alignmentData = this.navigationController.getAlignmentData();
    
    if (state === 'aligningFirstCorner' || state === 'aligningSecondCorner' || state === 'aligningThirdCorner') {
      // Get current head tracking position
      // This will be updated in the frame loop
      // For now, we'll use a placeholder - the actual position will come from head tracking
    }
  }

  handleToggleAlignmentMode(): void {
    if (this.state.alignmentStatus === "aligned" && this.state.alignmentMode === "world") {
      if (this.state.homeTransparent) {
        this.sceneManager?.getHomeModel()?.setOpacity(0.0);
      }
      this.updateState({
        alignmentMode: "free",
      });
    } else if (this.state.alignmentStatus === "aligned" && this.state.alignmentMode === "free") {
      if (this.state.homeTransparent) {
        this.sceneManager?.getHomeModel()?.setOpacity(0.3);
      }
      this.updateState({
        alignmentMode: "world",
        alignmentStatus: "aligning",
        showAlignmentConfirm: true,
      });
    }
  }

  async handleToggleHomeTransparency(): Promise<void> {
    const homeModel = this.sceneManager?.getHomeModel();
    if (!homeModel) return;
 
    const newTransparent = !this.state.homeTransparent;
    
    // If switching to AR mode, request AR session
    if (newTransparent && this.xrStore) {
      try {
        // Check if AR is supported
        if (navigator.xr && (navigator.xr as any).isSessionSupported) {
          const isARSupported = await (navigator.xr as any).isSessionSupported('immersive-ar');
          
          if (isARSupported) {
            const currentSession = this.xrStore.getState().session;
            if (currentSession && currentSession.mode !== 'immersive-ar') {
              // Request AR session
              const session = await (navigator.xr as any).requestSession('immersive-ar', {
                requiredFeatures: ['local-floor'],
                optionalFeatures: ['bounded-floor', 'hand-tracking', 'layers']
              });
              
              await currentSession.end();
              const gl = this.xrStore.getState().gl;
              if (gl && gl.xr) {
                await gl.xr.setSession(session);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to switch to AR mode:', err);
      }
    }
    
    homeModel.setTransparent(newTransparent);
    this.updateState({ homeTransparent: newTransparent });
  }

  handleSidebarItemSelect(itemId: string): void {
  this.updateState({ sidebarActiveItem: itemId });
  
  switch (itemId) {
    case "movement":
      this.updateState({ 
        showInstructions: false,
        showFurniture: false,
        showControlPanel: false,
        showSlider: false,
        showRotationGizmo: false,
        showScalePanel: false,
      });
      
      if (this.state.selectedItemId) {
        const furniture = this.sceneManager?.getFurniture(this.state.selectedItemId);
        if (furniture) {
          this.updateState({
            showTransformGizmo: true,
            gizmoPosition: furniture.getPosition()
          });
        }
      }
      break;

    case "rotation":
      if (this.state.selectedItemId) {
        const furniture = this.sceneManager?.getFurniture(this.state.selectedItemId);
        if (furniture) {
          this.updateState({ 
            showRotationGizmo: true,
            rotationGizmoPosition: furniture.getPosition(),
            showFurniture: false,
            showControlPanel: false,
            showTransformGizmo: false,
            showSlider: false,
            showScalePanel: false,
            
          });
        }
      } 
      break;

    case "scale":
      if (this.state.selectedItemId) {
        const furniture = this.sceneManager?.getFurniture(this.state.selectedItemId);
        if (furniture) {
          this.updateState({
            showScalePanel: true,
            showTransformGizmo: false,
            showRotationGizmo: false,
            showFurniture: false,
            showControlPanel: false,
            showSlider: false,
          });
        }
      }
      break;

    case "settings":
      this.updateState({
        showControlPanel: true,
        showFurniture: false,
        showSlider: false,
        showInstructions: false,
        showTransformGizmo: false,
        showRotationGizmo: false,
        showScalePanel: false,
      });
      break;

    case "customize":
      this.updateState({ 
        showFurniture: true,
        showControlPanel: false,
        showSlider: false,
        showInstructions: false,
        showTransformGizmo: false,
        showRotationGizmo: false,
        showScalePanel: false,
      });
      break;
  }
}

  async handleSaveScene(): Promise<void> {
    if (this.state.saving || !this.sceneManager) return;

    this.updateState({ saving: true });
    try {
      const sceneData = this.sceneManager.serializeScene();

      const formData = new FormData();
      formData.append('id', this.homeId);
      formData.append('deployedItems', JSON.stringify(sceneData.deployedItems));

      const response = await makeAuthenticatedRequest('/digitalhomes/update_home_design/', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        this.showNotificationMessage('Scene saved successfully!', 'success', true);
      } else {
        const error = await response.json();
        this.showNotificationMessage(`Failed to save scene: ${error.error}`, 'error', true);
      }
    } catch (error) {
      console.error('Error saving scene:', error);
      this.showNotificationMessage('Error saving scene. Please try again.', 'error', true);
    } finally {
      this.updateState({ saving: false });
    }
  }

  async handleBackToHome(xrStore: any): Promise<void> {
    const session = xrStore.getState().session;
    if (session) {
      try {
        await session.end();
        setTimeout(() => this.navigate("/"), 300);
      } catch (error) {
        console.error("Error exiting VR session:", error);
        this.navigate("/");
      }
    } else {
      this.navigate("/");
    }
  }

  async handleLogout(): Promise<void> {
    await logout();
    window.location.href = DIGITAL_HOME_PLATFORM_BASE_URL;
  }

  private async handleFurnitureMove(id: string, delta: THREE.Vector3): Promise<void> {
    if (!this.sceneManager) return;

    const furniture = this.sceneManager.getFurniture(id);
    if (!furniture) return;

    const currentPos = furniture.getPosition();
    const newPos: [number, number, number] = [
      currentPos[0] + delta.x,
      currentPos[1] + delta.y,
      currentPos[2] + delta.z,
    ];

    const isInAABBZone = this.currentAABBPosition !== null;

    const result = await this.sceneManager.moveFurniture(id, newPos, isInAABBZone, false);

    if (!result.success && result.needsConfirmation) {
      this.pendingMove = newPos;
      this.updateState({ showMoveCloserPanel: true });
    } else if (result.success && result.needsPreciseCheck) {
      this.currentAABBPosition = newPos;
      this.updateState({ showPreciseCheckPanel: true });
    } else if (!result.success && !result.needsConfirmation) {
      if (result.reason) {
        this.showNotificationMessage(`⚠️ ${result.reason}`, 'error');
      }
      this.currentAABBPosition = null;
    } else if (result.success && !result.needsPreciseCheck) {
      this.currentAABBPosition = null;
    }
  }

  private async handleWallFurnitureMove(
    id: string,
    deltaVertical: number,
    deltaHorizontal: number
  ): Promise<void> {
    if (!this.sceneManager) return;

    const furniture = this.sceneManager.getFurniture(id);
    if (!furniture || !furniture.isOnWall()) return;

    const result = await this.sceneManager.moveWallFurniture(id, deltaVertical, deltaHorizontal);

    if (!result.success && result.needsConfirmation) {
      const newPos = furniture.moveAlongWall(deltaVertical, deltaHorizontal);
      this.pendingMove = newPos;
      this.updateState({ showMoveCloserPanel: true });
    } else if (result.success && result.needsPreciseCheck) {
      const newPos = furniture.getPosition();
      this.currentAABBPosition = newPos;
      this.updateState({ showPreciseCheckPanel: true });
    } else if (!result.success && !result.needsConfirmation) {
      if (result.reason) {
        this.showNotificationMessage(`⚠️ ${result.reason}`, 'error');
      }
      this.currentAABBPosition = null;
    } else if (result.success && !result.needsPreciseCheck) {
      this.currentAABBPosition = null;
    }
  }

  private handleFurnitureRotate(id: string, deltaY: number): void {
    if (!this.sceneManager) return;

    const furniture = this.sceneManager.getFurniture(id);
    if (!furniture) return;

    const currentRot = furniture.getRotation();
    const newRot: [number, number, number] = [
      currentRot[0],
      currentRot[1] + deltaY,
      currentRot[2],
    ];

    this.sceneManager.rotateFurniture(id, newRot);

    const twoPi = Math.PI * 2;
    let normalizedRotation = newRot[1] % twoPi;
    if (normalizedRotation < 0) normalizedRotation += twoPi;
    this.updateState({ rotationValue: normalizedRotation });
  }

private handleFurnitureDeselect(id: string): void {
  if (!this.sceneManager) return;

  this.sceneManager.deselectFurniture(id);
  this.updateState({ 
    selectedItemId: null, 
    showSlider: false,
    showTransformGizmo: false,
    gizmoPosition: null,
    showRotationGizmo: false,
    rotationGizmoPosition: null,
    showScalePanel: false,
    sidebarActiveItem: null,
    selectedItemPlacementMode: 'floor',
  });
  this.currentAABBPosition = null;
  this.pendingMove = null;
}

  async handleConfirmMoveCloser(): Promise<void> {
    if (!this.state.selectedItemId || !this.sceneManager || !this.pendingMove) return;

    this.updateState({ showMoveCloserPanel: false, showControlPanel: false });

    const result = await this.sceneManager.moveFurniture(
      this.state.selectedItemId,
      this.pendingMove,
      true,
      false
    );

    if (result.success && result.needsPreciseCheck) {
      this.currentAABBPosition = this.pendingMove;
      this.pendingMove = null;
      this.updateState({ showPreciseCheckPanel: true });
    }
  }

  handleCancelMoveCloser(): void {
    this.updateState({ showMoveCloserPanel: false });
    this.pendingMove = null;
  }

  async handleConfirmPreciseCheck(): Promise<void> {
    if (!this.state.selectedItemId || !this.sceneManager || !this.currentAABBPosition) return;

    this.updateState({
      preciseCheckInProgress: true,
      showPreciseCheckPanel: false,
      showControlPanel: false,
    });

    try {
      const result = await this.sceneManager.moveFurniture(
        this.state.selectedItemId,
        this.currentAABBPosition,
        true,
        true
      );

      if (!result.success) {
        this.showNotificationMessage(
          '⚠️ Precise overlap detected! Furniture moved back to safe position.',
          'error'
        );
        this.currentAABBPosition = null;
      } else {
        this.showNotificationMessage(
          '✅ Position validated! Furniture can stay here.',
          'success'
        );
      }
    } catch (error) {
      console.error('Error during precise collision check:', error);
      this.showNotificationMessage('❌ Error checking collision. Please try again.', 'error');
    } finally {
      this.updateState({ preciseCheckInProgress: false });
    }
  }

  handleCancelPreciseCheck(): void {
    if (!this.state.selectedItemId || !this.sceneManager) return;

    const lastValid = this.sceneManager.getLastValidPosition(this.state.selectedItemId);
    if (lastValid) {
      const furniture = this.sceneManager.getFurniture(this.state.selectedItemId);
      if (furniture) {
        furniture.setPosition(lastValid);
        const collisionDetector = this.sceneManager.getCollisionDetector();
        collisionDetector.updateFurnitureBox(
          this.state.selectedItemId,
          furniture.getGroup(),
          furniture.getModelId()
        );
        furniture.setCollision(false);
      }
    }

    this.updateState({ showPreciseCheckPanel: false });
    this.currentAABBPosition = null;
  }

  handleSelectFurniture(f: any, camera: THREE.Camera): void {
    if (!this.sceneManager || this.state.alignmentStatus !== "aligned") return;

    const catalogId = f.id;
    const allFurniture = this.sceneManager.getAllFurniture();

    const existingFurniture = allFurniture.find(item => {
      const placedCatalogId = item.getId().split('-')[0];
      return placedCatalogId === catalogId;
    });

    if (existingFurniture) {
      this.sceneManager.removeFurniture(existingFurniture.getId());
      if (this.state.selectedItemId === existingFurniture.getId()) {
        this.updateState({ selectedItemId: null, showSlider: false });
      }
      return;
    }

    const modelPath = this.modelUrlCache.get(f.model_id);
    if (!modelPath) {
      console.warn('Model not loaded yet for:', f.name);
      return;
    }

    const isWallMountable = f.wall_mountable || false;
    
    const spawnPos = this.sceneManager.calculateSpawnPosition(camera, 2);
    const initialRotation: [number, number, number] = [0, 0, 0];

    const uniqueId = `${f.id}-${Date.now()}`;

    const metadata: FurnitureMetadata = {
      description: f.description,
      category: f.category,
      type: f.type,
      isContainer: f.is_container,
      image: f.image,
      wallMountable: isWallMountable,
    };

    const newFurniture = new FurnitureItem(
      uniqueId,
      f.name,
      f.model_id,
      modelPath,
      metadata,
      {
        position: spawnPos,
        rotation: initialRotation,
        scale: this.state.sliderValue,
      }
    );

    this.sceneManager.addFurniture(newFurniture).then(() => {
      this.sceneManager!.selectFurniture(uniqueId);
      if (this.sceneManager!.selectFurniture(uniqueId)) {
        this.furnitureController?.setSelectedFurniture(uniqueId);
        this.updateState({
          selectedItemId: uniqueId,
          rotationValue: initialRotation[1],
          showSlider: true,
          showFurniture: false,
          selectedItemPlacementMode: 'floor',
        });
      }
    });
  }

  handleSelectItem(id: string): void {
  if (!this.sceneManager) {
    return;
  }


  if (this.state.selectedItemId === id && (this.state.showTransformGizmo || this.state.showRotationGizmo)) {
    return;
  }

  if (this.state.selectedItemId === id && !this.state.showTransformGizmo && !this.state.showRotationGizmo) {
    this.sceneManager.deselectFurniture(id);
    this.furnitureController?.setSelectedFurniture(null);
    this.updateState({
      selectedItemId: null,
      showSlider: false,
      showTransformGizmo: false,
      gizmoPosition: null,
      showRotationGizmo: false,
      rotationGizmoPosition: null,
      selectedItemPlacementMode: 'floor',
    });
    return;
  }

  // Deselect previous item
  if (this.state.selectedItemId) {
    this.sceneManager.deselectFurniture(this.state.selectedItemId);
  }

  // Select new item
  this.sceneManager.selectFurniture(id);
  this.furnitureController?.setSelectedFurniture(id);

  const furniture = this.sceneManager.getFurniture(id);
  if (furniture) {
    const rotation = furniture.getRotation();
    const scale = furniture.getScale();
    const position = furniture.getPosition();

    const twoPi = Math.PI * 2;
    let normalizedRotation = rotation[1] % twoPi;
    if (normalizedRotation < 0) normalizedRotation += twoPi;

    const scaleValue = typeof scale === 'number' ? scale : scale[0];

    // Show gizmo based on current sidebar mode
    const showMovementGizmo = this.state.sidebarActiveItem === 'movement';
    const showRotGizmo = this.state.sidebarActiveItem === 'rotation';

    // Track wall-mountable state
    const placementMode = furniture.getPlacementMode();

    this.updateState({
      selectedItemId: id,
      showSlider: !showMovementGizmo && !showRotGizmo,
      rotationValue: normalizedRotation,
      sliderValue: scaleValue,
      showTransformGizmo: showMovementGizmo,
      gizmoPosition: showMovementGizmo ? position : null,
      showRotationGizmo: showRotGizmo,
      rotationGizmoPosition: showRotGizmo ? position : null,
      selectedItemPlacementMode: placementMode,
    });
  }
}


  handleGizmoMove(axis: 'x' | 'y' | 'z', delta: number): void {
  if (!this.state.selectedItemId || !this.sceneManager) {
    console.warn(`[handleGizmoMove] Invalid state:`, {
      selectedItemId: this.state.selectedItemId,
      hasSceneManager: !!this.sceneManager,
    });
    return;
  }

  const furniture = this.sceneManager.getFurniture(this.state.selectedItemId);
  if (!furniture) {
    console.warn(`[handleGizmoMove] Furniture not found:`, this.state.selectedItemId);
    return;
  }

  const currentPos = furniture.getPosition();
  const newPos: [number, number, number] = [...currentPos];

  switch (axis) {
    case 'x':
      newPos[0] += delta;
      break;
    case 'y':
      newPos[1] += delta;
      break;
    case 'z':
      newPos[2] += delta;
      break;
  }

  // Move furniture
  this.sceneManager.moveFurniture(this.state.selectedItemId, newPos, false, false)
    .then((result) => {
      if (result.success) {
        // Update gizmo position to match furniture
        this.updateState({ gizmoPosition: newPos });
      } else if (result.needsConfirmation) {
        this.pendingMove = newPos;
        this.updateState({ showMoveCloserPanel: true });
      } else {
        console.warn(`[handleGizmoMove] ❌ Move failed:`, result.reason);
      }
    })
    .catch((err) => {
      console.error(`[handleGizmoMove] Error:`, err);
    });
}


  handleGizmoRotate(axis: 'x' | 'y' | 'z', deltaRadians: number): void {
  if (!this.state.selectedItemId || !this.sceneManager) {
    console.warn(`[handleGizmoRotate] Invalid state:`, {
      selectedItemId: this.state.selectedItemId,
      hasSceneManager: !!this.sceneManager,
    });
    return;
  }

  const furniture = this.sceneManager.getFurniture(this.state.selectedItemId);
  if (!furniture) {
    console.warn(`[handleGizmoRotate] Furniture not found:`, this.state.selectedItemId);
    return;
  }

  const currentRot = furniture.getRotation();
  const newRot: [number, number, number] = [...currentRot];

  switch (axis) {
    case 'x':
      newRot[0] += deltaRadians;
      break;
    case 'y':
      newRot[1] += deltaRadians;
      break;
    case 'z':
      newRot[2] += deltaRadians;
      break;
  }

  // Apply rotation
  this.sceneManager.rotateFurniture(this.state.selectedItemId, newRot);

  // Update rotation state
  const twoPi = Math.PI * 2;
  let normalizedRotation = newRot[1] % twoPi;
  if (normalizedRotation < 0) normalizedRotation += twoPi;
  this.updateState({ rotationValue: normalizedRotation });
}

  handleScaleChange(newScale: number): void {
  const clampedScale = Math.max(0.5, Math.min(3, newScale));
  this.updateState({ sliderValue: clampedScale });
  
  if (this.state.selectedItemId && this.sceneManager) {
    this.sceneManager.scaleFurniture(this.state.selectedItemId, clampedScale);
  }
}

  handleRotationSliderChange(newRotation: number): void {
    this.updateState({ rotationValue: newRotation });
    if (this.state.selectedItemId && this.sceneManager) {
      const furniture = this.sceneManager.getFurniture(this.state.selectedItemId);
      if (furniture) {
        const currentRot = furniture.getRotation();
        this.sceneManager.rotateFurniture(this.state.selectedItemId, [
          currentRot[0],
          newRotation,
          currentRot[2],
        ]);
      }
    }
  }

  getPlacedCatalogIds(): string[] {
    if (!this.sceneManager) return [];
    return this.sceneManager.getAllFurniture().map(item => item.getId().split('-')[0]);
  }

  updateFrame(session: any, camera: THREE.Camera, delta: number, frame?: XRFrame): void {
    if (!session) return;

    // Handle corner selection with head tracking
    if (this.state.showCornerSelection && this.navigationController && this.sceneManager) {
      const homeModel = this.sceneManager.getHomeModel();
      if (homeModel && session.inputSources) {
        const raycaster = new THREE.Raycaster();
        const cameraPosition = new THREE.Vector3();
        camera.getWorldPosition(cameraPosition);
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        raycaster.set(cameraPosition, cameraDirection);

        // Get corner positions
        const box = new THREE.Box3().setFromObject(homeModel.getGroup());
        const maxY = box.max.y;
        const corners = [
          new THREE.Vector3(box.min.x, maxY, box.min.z).applyMatrix4(homeModel.getGroup().matrixWorld),
          new THREE.Vector3(box.max.x, maxY, box.min.z).applyMatrix4(homeModel.getGroup().matrixWorld),
          new THREE.Vector3(box.max.x, maxY, box.max.z).applyMatrix4(homeModel.getGroup().matrixWorld),
          new THREE.Vector3(box.min.x, maxY, box.max.z).applyMatrix4(homeModel.getGroup().matrixWorld),
        ];

        // Check which corner the user is looking at
        let closestCornerIndex = -1;
        let closestDistance = Infinity;
        corners.forEach((corner, index) => {
          const directionToCorner = corner.clone().sub(cameraPosition).normalize();
          const dot = cameraDirection.dot(directionToCorner);
          if (dot > 0.9) { // User is looking roughly at this corner
            const distance = cameraPosition.distanceTo(corner);
            if (distance < closestDistance) {
              closestDistance = distance;
              closestCornerIndex = index;
            }
          }
        });

        // Check for button press to select corner (only if selection is ready)
        if (this.cornerSelectionReady) {
          session.inputSources.forEach((source: any, index: number) => {
            const gamepad = source.gamepad;
            if (!gamepad || !gamepad.buttons) return;
            const triggerButton = gamepad.buttons[0];
            const wasPressed = this.prevTriggerState.get(index) || false;
            const isPressed = triggerButton?.pressed || false;
            
            if (isPressed && !wasPressed && closestCornerIndex >= 0) {
              this.handleCornerSelect(closestCornerIndex);
            }
            
            this.prevTriggerState.set(index, isPressed);
          });
        }
      }
    }

    // Handle head tracking alignment
    if (this.state.showHeadTrackingAlignment && this.navigationController && this.sceneManager) {
      const raycaster = new THREE.Raycaster();
      // Get scene from the home model group (for raycasting)
      const homeModel = this.sceneManager.getHomeModel();
      const sceneObjects: THREE.Object3D[] = [];
      if (homeModel) {
        sceneObjects.push(homeModel.getGroup());
      }
      // Add furniture to scene objects for raycasting
      this.sceneManager.getAllFurniture().forEach(f => sceneObjects.push(f.getGroup()));
      
      // Update head tracking alignment position using AR hit testing
      // Frame is passed as parameter to updateFrame
      const hitPoint = this.navigationController.updateHeadTrackingAlignment(
        camera,
        session,
        raycaster,
        { children: sceneObjects } as THREE.Scene,
        frame // XR frame for AR hit testing (passed from useFrame)
      );

      // Check for button press to confirm alignment point (only if alignment is ready)
      if (this.alignmentReady && session.inputSources) {
        session.inputSources.forEach((source: any, index: number) => {
          const gamepad = source.gamepad;
          if (!gamepad || !gamepad.buttons) return;

          // Use trigger button (index 0) to confirm alignment
          const triggerButton = gamepad.buttons[0];
          const wasPressed = this.prevTriggerState.get(index) || false;
          const isPressed = triggerButton?.pressed || false;
          
          if (isPressed && !wasPressed) {
            const alignmentState = this.navigationController?.getAlignmentState();
            console.log('Trigger pressed during alignment:', { alignmentState, hasHitPoint: !!hitPoint, hitPoint, alignmentReady: this.alignmentReady });
            
            if (!hitPoint) {
              console.warn('Trigger pressed but no hitPoint available - using last known hit point or default depth');
              // Use a fallback: try to get hit point from navigation controller or use default depth
              const cameraPosition = new THREE.Vector3();
              camera.getWorldPosition(cameraPosition);
              const cameraDirection = new THREE.Vector3();
              camera.getWorldDirection(cameraDirection);
              const fallbackHitPoint = cameraPosition.clone().addScaledVector(cameraDirection, 3.0);
              console.log('Using fallback hit point:', fallbackHitPoint);
              
              // Handle all corner alignment states with fallback
              if (alignmentState === 'aligningSecondCorner' && this.navigationController) {
                console.log('Calling confirmSecondCornerAlignment with fallback hit point');
                this.navigationController.confirmSecondCornerAlignment(fallbackHitPoint);
              } else if (alignmentState === 'aligningThirdCorner' && this.navigationController) {
                console.log('Calling confirmThirdCornerAlignment with fallback hit point');
                this.navigationController.confirmThirdCornerAlignment(fallbackHitPoint);
              } else if (alignmentState === 'aligningFourthCorner' && this.navigationController) {
                console.log('Calling confirmFourthCornerAlignment with fallback hit point');
                this.navigationController.confirmFourthCornerAlignment(fallbackHitPoint);
              }
              return;
            }
            
            if (alignmentState === 'aligningFirstCorner' && this.navigationController) {
              this.navigationController.confirmFirstCornerAlignment(hitPoint);
              this.updateState({ showHeadTrackingAlignment: true });
            } else if (alignmentState === 'aligningSecondCorner' && this.navigationController) {
              this.navigationController.confirmSecondCornerAlignment(hitPoint);
            } else if (alignmentState === 'aligningThirdCorner' && this.navigationController) {
              console.log('Trigger pressed for third corner alignment, calling confirmThirdCornerAlignment with hitPoint:', hitPoint);
              this.navigationController.confirmThirdCornerAlignment(hitPoint);
            } else if (alignmentState === 'aligningFourthCorner' && this.navigationController) {
              console.log('Trigger pressed for fourth corner alignment, calling confirmFourthCornerAlignment with hitPoint:', hitPoint);
              this.navigationController.confirmFourthCornerAlignment(hitPoint);
            } else {
              console.warn('Trigger pressed but alignment state is:', alignmentState);
            }
          }
          
          this.prevTriggerState.set(index, isPressed);
        });
      }
    }

    // Set alignment mode in navigation controller
    const isAligning = this.state.alignmentStatus === "aligning" && this.state.alignmentMode === "world";
    if (this.navigationController) {
      this.navigationController.setAlignmentMode(isAligning);
      
      if (isAligning && this.sceneManager?.getHomeModel()) {
        this.navigationController.setHomeModelGroup(this.sceneManager.getHomeModel()!.getGroup());
      } else {
        this.navigationController.setHomeModelGroup(null);
      }
    }

    // Disable navigation during automatic alignment
    const canNavigate = (this.state.alignmentStatus === "aligning" && 
                        this.state.alignmentMode === "world" && 
                        !this.state.showHeadTrackingAlignment) ||
                       (this.state.alignmentStatus === "aligned" && this.state.alignmentMode === "free");
    
    if (canNavigate) {
      this.navigationController?.update(session, camera, delta);
    }

    if (this.state.alignmentStatus === "aligned" && 
        !this.state.navigationMode && 
        this.state.selectedItemId && 
        this.furnitureController) {
      this.furnitureController.update(session, camera, delta);
    }

    // Update furniture animations
    this.sceneManager?.updateAnimations(delta);
  }


}

// Wrapper for R3F hooks
export function SceneContent({ homeId, digitalHome, arModeRequested }: SceneContentProps) {
  const navigate = useNavigate();
  const { scene, camera } = useThree();
  const xr = useXR();
  const xrStore = useXRStore();

  // State management
  const [state, setState] = useState<SceneState>({
    showSlider: false,
    showFurniture: false,
    showInstructions: false,
    showControlPanel: false,
    showNotification: false,
    notificationMessage: "",
    notificationType: "info",
    notificationFromControlPanel: false,
    showMoveCloserPanel: false,
    showPreciseCheckPanel: false,
    preciseCheckInProgress: false,
    saving: false,
    loading: true,
    navigationMode: false,
    selectedItemId: null,
    sliderValue: 1.0,
    rotationValue: 0,
    furnitureCatalog: [],
    catalogLoading: false,
    showSidebar: false,
    sidebarActiveItem: null,
    showTransformGizmo: false,
    gizmoPosition: null,
    showRotationGizmo: false,
    rotationGizmoPosition: null,
    showScalePanel: false,
    selectedItemPlacementMode: 'floor',
    alignmentStatus: 'pending',
    alignmentMode: null,
    showAlignmentPanel: true,
    showAlignmentConfirm: false,
    homeTransparent: false,
    showCornerSelection: false,
    showHeadTrackingAlignment: false,
    alignmentState: 'idle',
    alignmentARModeRequested: false,
  });

  const logicRef = useRef<SceneContentLogic | null>(null);

  useEffect(() => {
    const updateState = (update: Partial<SceneState> | ((prev: SceneState) => Partial<SceneState>)) => {
      setState(prev => {
        const newState = typeof update === 'function' ? update(prev) : update;
        return { ...prev, ...newState };
      });
    };

    logicRef.current = new SceneContentLogic(homeId, navigate, updateState);
    logicRef.current.initializeManagers(scene);
    logicRef.current.setXRStore(xrStore);

    return () => {
      logicRef.current?.cleanup();
    };
  }, [homeId, navigate, scene, xrStore]);

  useEffect(() => {
    if (!xr.session || !logicRef.current) return;
    logicRef.current.setupXRRig(scene, camera);
    
    // Handle AR scene visibility when AR session is active
    const sessionMode = (xr.session as any)?.mode;
    const isInAlignmentMode = state.showHeadTrackingAlignment;
    if (sessionMode === 'immersive-ar' && !state.loading && !isInAlignmentMode) {
      const homeModel = logicRef.current.sceneManager?.getHomeModel();
      if (homeModel) {
        homeModel.setVisible(true);
        if (!homeModel.getIsTransparent()) {
          homeModel.setOpacity(0.3);
          homeModel.setTransparent(true);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xr.session, scene, camera]); // Only depend on stable values to avoid hook order issues
 
  useEffect(() => {
    if (!xr.session || !logicRef.current || !arModeRequested) return;
 
    const homeModel = logicRef.current.sceneManager?.getHomeModel();
    if (homeModel && !homeModel.getIsTransparent()) {
      homeModel.setTransparent(true);
      logicRef.current.updateState({ homeTransparent: true });
    }
  }, [xr.session, arModeRequested, state.loading]);

  // Load home
  useEffect(() => {
    if (!logicRef.current) return;
    logicRef.current.loadHome(digitalHome);
  }, [homeId, digitalHome]);

  // Load furniture catalog
  useEffect(() => {
    if (!logicRef.current) return;
    logicRef.current.loadFurnitureCatalog();
  }, []);

  // Load deployed items
  useEffect(() => {
    if (!logicRef.current || logicRef.current.modelUrlCache.size === 0) return;
    logicRef.current.loadDeployedItems();
  }, [logicRef.current?.modelUrlCache.size]);

  useFrame((_state, delta) => {
    if (!logicRef.current) return;
    
    logicRef.current.sceneManager?.updateAnimations(delta);
    
    const session = xr.session;
    if (!session) return;
    
    // Get XR frame from the session if available
    // The frame is available during XR rendering
    const xrFrame = (session as any).requestAnimationFrame ? 
      (xrStore.getState() as any).frame : undefined;
    
    // Pass XR frame for AR hit testing
    logicRef.current.updateFrame(session, camera, delta, xrFrame);
  });

  // Get the WebGL renderer to set clear color for AR transparency
  // Must be called before any early returns to maintain hooks order
  const { gl } = useThree();
  
  // Determine if we're in AR mode (alignment, transparency toggle, or AR session)
  const isARAlignmentMode = state.showHeadTrackingAlignment;
  const xrSession = xr.session;
  const isARSession = xrSession && (xrSession as any).mode === 'immersive-ar';
  // In alignment mode, show AR if session exists OR if we're trying to activate it
  // This allows the UI to prepare for AR even if session is still initializing
  const isARMode = isARAlignmentMode ? (isARSession || state.homeTransparent) : (state.homeTransparent || isARSession);
  
  // Set renderer clear color to transparent in AR mode
  useEffect(() => {
    if (isARMode) {
      // Set clear color to transparent (black with 0 alpha) for AR passthrough
      gl.setClearColor(0x000000, 0);
      // Ensure the renderer uses alpha and doesn't premultiply
      gl.domElement.style.backgroundColor = 'transparent';
      // Disable auto-clear or set to clear with transparent
      gl.autoClear = true;
      gl.autoClearColor = true;
      gl.autoClearDepth = true;
      gl.autoClearStencil = true;
      console.log('AR mode: Renderer clear color set to transparent', {
        isARAlignmentMode,
        isARSession,
        homeTransparent: state.homeTransparent,
        sessionMode: xrSession ? (xrSession as any).mode : 'none'
      });
    } else {
      // Set clear color back to gray for VR mode
      gl.setClearColor(0x808080, 1);
      gl.domElement.style.backgroundColor = '#808080';
    }
  }, [isARMode, gl, isARAlignmentMode, isARSession, state.homeTransparent, xrSession]);

  if (!logicRef.current) return null;

  const logic = logicRef.current;
  const isAligned = state.alignmentStatus === "aligned";
  const uiLocked = state.showFurniture || 
    state.showControlPanel || 
    state.showInstructions || 
    state.showSlider || 
    state.showNotification ||
    state.showMoveCloserPanel ||
    state.showScalePanel ||
    state.showPreciseCheckPanel ||
    state.showAlignmentPanel ||
    state.showAlignmentConfirm;

  if (state.loading) {
    return (
      <>
        <color args={["#808080"]} attach="background" />
        <PerspectiveCamera makeDefault position={[0, 1.6, 2]} fov={75} />
        <ambientLight intensity={0.5} />
        <group position={[0, 1.6, -2]}>
          <mesh>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
            <meshStandardMaterial color="#4CAF50" wireframe />
          </mesh>
        </group>
      </>
    );
  }

  return (
    <>
      {/* AR Session Handler - handles AR session initialization inside Canvas where renderer is available */}
      {/* AR Session Handler - handles AR session initialization inside Canvas where renderer is available */}
      {/* Use alignmentARModeRequested for alignment flow, arModeRequested for manual AR toggle */}
      <ARSessionHandler arModeRequested={arModeRequested || state.alignmentARModeRequested} />
      
      {/* Background - transparent in AR mode to show real world */}
      {!isARMode && <color args={["#808080"]} attach="background" />}
      <PerspectiveCamera makeDefault position={[0, 1.6, 2]} fov={75} />
      <ambientLight intensity={isARMode ? 0.2 : 0.5} />
      <directionalLight position={[5, 5, 5]} intensity={isARMode ? 0.3 : 1} />
      {!isARMode && <Environment preset="warehouse" />}

      <group position={[0, 0, 0]}>
      {logic.sceneManager && (
        <>
          {logic.sceneManager.getHomeModel() && (
            <primitive object={logic.sceneManager.getHomeModel()!.getGroup()} />
          )}
          
          {logic.sceneManager.getAllFurniture().map((furniture) => (
            <primitive
              key={furniture.getId()}
              object={furniture.getGroup()}
              onClick={(e: any) => {
                let target = e.object;
                let isGizmoClick = false;
                let depth = 0;

                while (target && depth < 10) {
                  if (target.userData?.isGizmo) {
                    isGizmoClick = true;
                    break;
                  }

                  target = target.parent;
                  depth++;
                }

                if (isGizmoClick) {
                  e.stopPropagation();
                  return;
                }

                if (state.alignmentStatus === "aligned" && !state.navigationMode && !uiLocked) {
                  e.stopPropagation();
                  logic.handleSelectItem(furniture.getId());
                }
              }}
            />
          ))}

          {state.showTransformGizmo && state.gizmoPosition && (
            <TransformGizmo
              position={state.gizmoPosition}
              visible={state.showTransformGizmo}
              onMove={(axis, delta) => logic.handleGizmoMove(axis, delta)}
            />
          )}

          {/* ROTATION GIZMO FOR ROTATION */}
          {state.showRotationGizmo && state.rotationGizmoPosition && (
            <RotationGizmo
              position={state.rotationGizmoPosition}
              visible={state.showRotationGizmo}
              onRotate={(axis, deltaRadians) => logic.handleGizmoRotate(axis, deltaRadians)}
              currentRotation={
                logic.sceneManager && state.selectedItemId
                  ? logic.sceneManager.getFurniture(state.selectedItemId)?.getRotation() || [0, 0, 0]
                  : [0, 0, 0]
              }
            />
          )}

          {/* CORNER SELECTION VISUALIZATION */}
          {state.showCornerSelection && logic.navigationController && logic.sceneManager && (
            <CornerSelectionVisualization
              corners={(() => {
                // Get corners from home model
                const homeModel = logic.sceneManager?.getHomeModel();
                if (!homeModel) return [];
                const box = new THREE.Box3().setFromObject(homeModel.getGroup());
                const maxY = box.max.y;
                const corners = [
                  { position: new THREE.Vector3(box.min.x, maxY, box.min.z), index: 0 },
                  { position: new THREE.Vector3(box.max.x, maxY, box.min.z), index: 1 },
                  { position: new THREE.Vector3(box.max.x, maxY, box.max.z), index: 2 },
                  { position: new THREE.Vector3(box.min.x, maxY, box.max.z), index: 3 },
                ];
                // Transform to world space
                return corners.map(corner => ({
                  position: corner.position.clone().applyMatrix4(homeModel.getGroup().matrixWorld),
                  index: corner.index,
                }));
              })()}
              selectedCornerIndex={logic.navigationController.getAlignmentData().selectedCorner?.index ?? null}
              onCornerSelect={(index) => logic.handleCornerSelect(index)}
              visible={state.showCornerSelection}
            />
          )}

          {/* ALIGNMENT LINE VISUALIZATION */}
          {state.showHeadTrackingAlignment && (
            <AlignmentLineVisualization
              visible={state.showHeadTrackingAlignment}
              targetDepth={3.0}
              onConfirm={() => logic.handleConfirmAlignmentPoint()}
          instruction={
            state.alignmentState === 'aligningFirstCorner'
              ? "Align the corner lines to the real-world corner. Press trigger to confirm."
              : state.alignmentState === 'aligningSecondCorner'
              ? "Align the corner lines to the next corner (clockwise). Press trigger to confirm."
              : state.alignmentState === 'aligningThirdCorner'
              ? "Align the corner lines to the next corner (clockwise). Press trigger to confirm."
              : "Align the corner lines to the final corner (clockwise). Press trigger to confirm."
          }
            />
          )}
        </>
      )}
    </group>
      
      {state.alignmentStatus === "aligned" && (
        <>
          <CatalogToggle onToggle={() => logic.handleToggleUI()} />
          <ControlPanelToggle onToggle={() => logic.handleToggleControlPanel()} />
        </>
      )}

      <HeadLockedUI distance={1.6} verticalOffset={0} enabled={state.showAlignmentPanel}>
        <VRAlignmentPanel 
          show={state.showAlignmentPanel} 
          onSelectMode={(mode) => logic.handleAlignmentModeSelect(mode)} 
        />
      </HeadLockedUI>

      <HeadLockedUI distance={1.6} verticalOffset={0} enabled={state.showAlignmentConfirm}>
        <VRAlignmentConfirmPanel 
          show={state.showAlignmentConfirm} 
          onConfirm={() => logic.handleAlignmentConfirm()} 
          onCancel={() => logic.handleAlignmentCancel()} 
        />
      </HeadLockedUI>

      {/* Alignment Instruction Panel */}
      <HeadLockedUI distance={1.8} verticalOffset={0.3} enabled={state.showCornerSelection || state.showHeadTrackingAlignment}>
        <AlignmentInstructionPanel
          show={state.showCornerSelection || state.showHeadTrackingAlignment}
          message={
            state.showCornerSelection
              ? "Select a corner from the 4 corners of the model"
              : state.alignmentState === 'aligningFirstCorner'
              ? "Align the corner lines to the real-world corner"
              : "Align the corner lines to the diagonally opposite corner"
          }
          subMessage={
            state.showCornerSelection
              ? "Look at a corner and click to select"
              : "Move your head to align the lines, then press trigger to confirm"
          }
        />
      </HeadLockedUI>

      <HeadLockedUI distance={1.6} verticalOffset={0} enabled={state.showInstructions}>
        <VRInstructionPanel 
          show={state.showInstructions} 
          onClose={() => logic.updateState({ showInstructions: false })} 
        />
      </HeadLockedUI>
     

      <HeadLockedUI distance={1.7} verticalOffset={0} enabled={state.showFurniture}>
        <VRFurniturePanel
          show={state.showFurniture}
          catalog={state.furnitureCatalog}
          loading={state.catalogLoading}
          onSelectItem={(f) => logic.handleSelectFurniture(f, camera)}
          placedFurnitureIds={logic.getPlacedCatalogIds()}
          onClose={() => logic.updateState({ showFurniture: false })}
        />
      </HeadLockedUI>

      <HeadLockedUI distance={1.7} verticalOffset={0} enabled={state.showControlPanel}>
        <VRControlPanel
          show={state.showControlPanel}
          onSave={() => logic.handleSaveScene()}
          onHelp={() => logic.handleHelp()}
          onBack={() => logic.handleBackToHome(xrStore)}
          onLogout={() => logic.handleLogout()}
          saving={state.saving}
          onClose={() => logic.updateState({ showControlPanel: false })}
          alignmentMode={state.alignmentMode}
          onToggleAlignment={() => logic.handleToggleAlignmentMode()}
          homeTransparent={state.homeTransparent}
          onToggleTransparency={() => logic.handleToggleHomeTransparency()}
        />
      </HeadLockedUI>


      <HeadLockedUI distance={1.4} verticalOffset={0} enabled={state.showNotification}>
        <VRNotificationPanel
          show={state.showNotification}
          message={state.notificationMessage}
          type={state.notificationType}
          onClose={() => logic.updateState({ showNotification: false, notificationFromControlPanel: false })}
        />
      </HeadLockedUI>

      <HeadLockedUI distance={1.5} verticalOffset={0} enabled={state.showMoveCloserPanel}>
        <VRPreciseCollisionPanel
          show={state.showMoveCloserPanel}
          onConfirm={() => logic.handleConfirmMoveCloser()}
          onCancel={() => logic.handleCancelMoveCloser()}
          isChecking={false}
          title="Move Furniture Closer?"
          message="The furniture is close to another object. Do you want to move it closer?"
        />
      </HeadLockedUI>

      <HeadLockedUI distance={1.5} verticalOffset={0} enabled={state.showPreciseCheckPanel}>
        <VRPreciseCollisionPanel
          show={state.showPreciseCheckPanel}
          onConfirm={() => logic.handleConfirmPreciseCheck()}
          onCancel={() => logic.handleCancelPreciseCheck()}
          isChecking={state.preciseCheckInProgress}
          title="Use precise collision detection?"
          message="Run precise API check to verify overlap? (Click No to move back to safe position)"
        />
      </HeadLockedUI>

      <HeadLockedUI distance={1.6} verticalOffset={0} enabled={state.showScalePanel}>
        {state.selectedItemId && (
          <ScaleControlPanel
            show={state.showScalePanel}
            currentScale={state.sliderValue}
            position={[0.5, 0, 0]}
            onScaleChange={(newScale) => logic.handleScaleChange(newScale)}
            onClose={() => logic.updateState({ showScalePanel: false })}
          />
        )}
      </HeadLockedUI>

      <HeadLockedUI distance={1.4} verticalOffset={0} enabled={state.showSidebar}>
        <group position={[-0.8, 0, 0]}> {/* Offset to the left within head-locked space */}
          <VRSidebar
            show={state.showSidebar}
            onItemSelect={(itemId) => logic.handleSidebarItemSelect(itemId)}
          />
        </group>
      </HeadLockedUI>

    </>
  );
}