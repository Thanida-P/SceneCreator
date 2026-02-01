import * as THREE from 'three';
import { FurnitureItem } from '../objects/FurnitureItem';
import { HomeModel } from '../objects/HomeModel';
import { CollisionDetector } from './CollisionDetector';

export interface SceneConfig {
  enableCollisionDetection?: boolean;
  enableDebugMode?: boolean;
  floorLevel?: number;
}

export interface MoveResult {
  success: boolean;
  needsConfirmation: boolean;
  needsPreciseCheck: boolean;
  reason?: string;
}

export class SceneManager {
  protected scene: THREE.Scene;
  protected homeModel: HomeModel | null = null;
  protected furnitureItems: Map<string, FurnitureItem> = new Map();
  public collisionDetector: CollisionDetector;
  protected config: Required<SceneConfig>;
  protected selectedItemId: string | null = null;
  protected lastValidPositions: Map<string, [number, number, number]> = new Map();

  constructor(scene: THREE.Scene, config: SceneConfig = {}) {
    this.scene = scene;
    this.config = {
      enableCollisionDetection: config.enableCollisionDetection ?? true,
      enableDebugMode: config.enableDebugMode ?? false,
      floorLevel: config.floorLevel ?? 0,
    };
    
    this.collisionDetector = CollisionDetector.getInstance();
    this.collisionDetector.setDebugMode(this.config.enableDebugMode);
  }

  async setHomeModel(homeModel: HomeModel): Promise<void> {
    if (this.homeModel) {
      this.scene.remove(this.homeModel.getGroup());
      this.homeModel.dispose();
    }

    this.homeModel = homeModel;
    this.scene.add(homeModel.getGroup());
    
    await homeModel.loadModel(this.scene);
    
    const boundary = homeModel.getBoundary();
    if (boundary) {
      this.collisionDetector.setRoomBoundary(boundary);
    }
  }

  getHomeModel(): HomeModel | null {
    return this.homeModel;
  }

  getCollisionDetector(): CollisionDetector {
    return this.collisionDetector;
  }

  async addFurniture(furniture: FurnitureItem): Promise<boolean> {
    if (this.furnitureItems.has(furniture.getId())) {
      return false;
    }

    this.furnitureItems.set(furniture.getId(), furniture);
    this.scene.add(furniture.getGroup());
    
    await furniture.loadModel(this.scene);
    
    if (this.config.enableCollisionDetection) {
      setTimeout(async () => {
        await this.updateFurnitureCollision(furniture.getId());
        
        for (const [otherId] of this.furnitureItems) {
          if (otherId !== furniture.getId()) {
            await this.updateFurnitureCollision(otherId);
          }
        }
      }, 100);
    }

    return true;
  }

  removeFurniture(id: string): boolean {
    const furniture = this.furnitureItems.get(id);
    if (!furniture) return false;

    this.scene.remove(furniture.getGroup());
    furniture.dispose();
    this.furnitureItems.delete(id);
    
    this.collisionDetector.removeFurniture(id);
    this.lastValidPositions.delete(id); // Clear last valid position

    if (this.selectedItemId === id) {
      this.selectedItemId = null;
    }

    return true;
  }

  getFurniture(id: string): FurnitureItem | undefined {
    return this.furnitureItems.get(id);
  }

  getAllFurniture(): FurnitureItem[] {
    return Array.from(this.furnitureItems.values());
  }

  clearAllFurniture(): void {
    this.furnitureItems.forEach((furniture) => {
      this.scene.remove(furniture.getGroup());
      furniture.dispose();
    });
    this.furnitureItems.clear();
    this.collisionDetector.clear();
    this.selectedItemId = null;
  }

  selectFurniture(id: string): boolean {
    const furniture = this.furnitureItems.get(id);
    if (!furniture) return false;

    if (this.selectedItemId && this.selectedItemId !== id) {
      const prevFurniture = this.furnitureItems.get(this.selectedItemId);
      prevFurniture?.deselect();
    }

    furniture.select();
    this.selectedItemId = id;
    return true;
  }

  deselectFurniture(id?: string): void {
    const targetId = id || this.selectedItemId;
    if (!targetId) return;

    const furniture = this.furnitureItems.get(targetId);
    furniture?.deselect();

    if (targetId === this.selectedItemId) {
      this.selectedItemId = null;
    }
  }

  getSelectedFurniture(): FurnitureItem | null {
    return this.selectedItemId ? this.furnitureItems.get(this.selectedItemId) || null : null;
  }

  async updateFurnitureCollision(id: string): Promise<void> {
    const furniture = this.furnitureItems.get(id);
    if (!furniture) return;

    this.collisionDetector.updateFurnitureBox(
      id,
      furniture.getGroup(),
      furniture.getModelId()
    );

    // Collision check for wall-mounted items (only check against other furniture)
    let collision;
    if (furniture.isOnWall()) {
      collision = await this.collisionDetector.checkFurnitureCollisions(id);
      furniture.setFloating(false);
    } else {
      collision = await this.collisionDetector.checkAllCollisions(id);
    }
    
    furniture.setCollision(collision.hasCollision);
  }

  async updateAllCollisions(): Promise<void> {
    for (const [id] of this.furnitureItems) {
      await this.updateFurnitureCollision(id);
    }
  }

  async isPositionValid(id: string, position: THREE.Vector3): Promise<boolean> {
    const furniture = this.furnitureItems.get(id);
    if (!furniture) return false;

    return await this.collisionDetector.isPositionValid(
      id,
      position,
      furniture.getGroup()
    );
  }

  async moveFurniture(
    id: string,
    newPosition: [number, number, number],
    skipAABBBlock: boolean = false,
    performPreciseCheck: boolean = false
  ): Promise<MoveResult> {
    const furniture = this.furnitureItems.get(id);
    if (!furniture) return { 
      success: false, 
      needsConfirmation: false, 
      needsPreciseCheck: false,
      reason: 'Furniture not found' 
    };

    if (!this.config.enableCollisionDetection) {
      furniture.setPosition(newPosition);
      return { success: true, needsConfirmation: false, needsPreciseCheck: false };
    }

    const originalPosition = furniture.getPosition();
    const isWallMounted = furniture.isOnWall();
    const isWallMountable = furniture.isWallMountable();
    
    // Save last valid position
    if (!this.lastValidPositions.has(id)) {
      this.lastValidPositions.set(id, originalPosition);
    }
    
    // Temporarily move to test position
    furniture.setPosition(newPosition);
    this.collisionDetector.updateFurnitureBox(id, furniture.getGroup(), furniture.getModelId());
    
    const box = this.collisionDetector.furnitureBoxes.get(id);
    const roomBoundary = this.collisionDetector.getRoomBoundary();
    
    // Check if object is touching any wall surface
    if (!isWallMounted && isWallMountable && box && roomBoundary) {
      const margin = 0.1;
      const touchingXMin = Math.abs(box.min.x - roomBoundary.min.x) < margin;
      const touchingXMax = Math.abs(box.max.x - roomBoundary.max.x) < margin;
      const touchingZMin = Math.abs(box.min.z - roomBoundary.min.z) < margin;
      const touchingZMax = Math.abs(box.max.z - roomBoundary.max.z) < margin;
      
      // Check if the object is very close to or intersecting with wall boundaries
      const nearXMin = box.min.x <= roomBoundary.min.x + margin && box.min.x >= roomBoundary.min.x - margin;
      const nearXMax = box.max.x >= roomBoundary.max.x - margin && box.max.x <= roomBoundary.max.x + margin;
      const nearZMin = box.min.z <= roomBoundary.min.z + margin && box.min.z >= roomBoundary.min.z - margin;
      const nearZMax = box.max.z >= roomBoundary.max.z - margin && box.max.z <= roomBoundary.max.z + margin;
      
      if (touchingXMin || touchingXMax || touchingZMin || touchingZMax || 
          nearXMin || nearXMax || nearZMin || nearZMax) {
        let wallNormal: [number, number, number];
        let wallPosition: number;
        
        if (touchingXMin || nearXMin) {
          wallNormal = [1, 0, 0];
          wallPosition = roomBoundary.min.x;
        } else if (touchingXMax || nearXMax) {
          wallNormal = [-1, 0, 0];
          wallPosition = roomBoundary.max.x;
        } else if (touchingZMin || nearZMin) {
          wallNormal = [0, 0, 1];
          wallPosition = roomBoundary.min.z;
        } else {
          wallNormal = [0, 0, -1];
          wallPosition = roomBoundary.max.z;
        }
        
        // Mount the item to the wall
        furniture.setWallPlacement({
          wallNormal,
          wallPosition,
        });

        furniture.setPosition(newPosition);
        this.collisionDetector.updateFurnitureBox(id, furniture.getGroup(), furniture.getModelId());
        
        const adjustedPos = this.adjustPositionToWall(id, newPosition, wallNormal, wallPosition);
        
        furniture.setPosition(adjustedPos);
        this.collisionDetector.updateFurnitureBox(id, furniture.getGroup(), furniture.getModelId());
        
        const adjustedBox = this.collisionDetector.furnitureBoxes.get(id);
        if (adjustedBox && roomBoundary) {
          const margin = 0.05;
          const wallOffset = 0.02;
          const boxSize = new THREE.Vector3();
          adjustedBox.getSize(boxSize);
          
          let needsAdjustment = false;
          const finalPos: [number, number, number] = [...adjustedPos];
          
          if (Math.abs(wallNormal[0]) > Math.abs(wallNormal[2])) {
            // X wall
            if (wallNormal[0] > 0) {
              const targetMinX = wallPosition + wallOffset;
              if (adjustedBox.min.x < targetMinX) {
                finalPos[0] = targetMinX;
                needsAdjustment = true;
              }
            } else {
              const targetMaxX = wallPosition - wallOffset;
              if (adjustedBox.max.x > targetMaxX) {
                finalPos[0] = targetMaxX;
                needsAdjustment = true;
              }
            }
            if (adjustedBox.max.x > roomBoundary.max.x - margin) {
              finalPos[0] = roomBoundary.max.x - margin - boxSize.x / 2;
              needsAdjustment = true;
            }
          } else {
            // Z wall
            if (wallNormal[2] > 0) {
              const targetMinZ = wallPosition + wallOffset;
              if (adjustedBox.min.z < targetMinZ) {
                finalPos[2] = targetMinZ;
                needsAdjustment = true;
              }
            } else {
              const targetMaxZ = wallPosition - wallOffset;
              if (adjustedBox.max.z > targetMaxZ) {
                finalPos[2] = targetMaxZ;
                needsAdjustment = true;
              }
            }
            if (adjustedBox.max.z > roomBoundary.max.z - margin) {
              finalPos[2] = roomBoundary.max.z - margin - boxSize.z / 2;
              needsAdjustment = true;
            }
          }
          
          // Constrain Y (vertical) boundaries
          if (adjustedBox.min.y < roomBoundary.min.y + margin) {
            finalPos[1] = roomBoundary.min.y + margin + boxSize.y / 2;
            needsAdjustment = true;
          } else if (adjustedBox.max.y > roomBoundary.max.y - margin) {
            finalPos[1] = roomBoundary.max.y - margin - boxSize.y / 2;
            needsAdjustment = true;
          }
          
          if (needsAdjustment) {
            furniture.setPosition(finalPos);
            this.collisionDetector.updateFurnitureBox(id, furniture.getGroup(), furniture.getModelId());
          }
        }
        
        const finalPosition = furniture.getPosition();
        this.lastValidPositions.set(id, finalPosition);
        furniture.setCollision(false);
        return { success: true, needsConfirmation: false, needsPreciseCheck: false };
      }
    }
    
    const roomCollision = this.collisionDetector.checkRoomCollision(id);
    const onFloor = this.collisionDetector.checkRoomFloor(id);

    if (!isWallMounted) {
      if (roomCollision.hasCollision) {
        furniture.setPosition(originalPosition);
        this.collisionDetector.updateFurnitureBox(id, furniture.getGroup(), furniture.getModelId());
        furniture.setCollision(true);
        return { 
          success: false, 
          needsConfirmation: false, 
          needsPreciseCheck: false,
          reason: 'Outside room boundary' 
        };
      }

       // Check if object is in the air
       const box = this.collisionDetector.furnitureBoxes.get(id);
       if (box && roomBoundary) {
         
         if (!onFloor) {
            furniture.setPosition(newPosition);
            furniture.setFloating(true);
            this.collisionDetector.updateFurnitureBox(id, furniture.getGroup(), furniture.getModelId());
            this.lastValidPositions.set(id, newPosition);
            return { success: false, needsConfirmation: false, needsPreciseCheck: false };
         } else {
          furniture.setPosition(newPosition);
          furniture.setFloating(false);
          this.collisionDetector.updateFurnitureBox(id, furniture.getGroup(), furniture.getModelId());
          this.lastValidPositions.set(id, newPosition);
          return { success: true, needsConfirmation: false, needsPreciseCheck: false };
        }
      }
    }
    
    const hasAABBCollision = this.collisionDetector.checkAABBCollisionOnly(id);
    
    if (hasAABBCollision && !skipAABBBlock) {
      furniture.setPosition(originalPosition);
      this.collisionDetector.updateFurnitureBox(id, furniture.getGroup(), furniture.getModelId());
      furniture.setCollision(true);
      return { 
        success: false, 
        needsConfirmation: true, 
        needsPreciseCheck: false,
        reason: 'Close to another object' 
      };
    }
    
    if (hasAABBCollision && skipAABBBlock && !performPreciseCheck) {
      furniture.setCollision(true);
      return { 
        success: true, 
        needsConfirmation: false, 
        needsPreciseCheck: true,
        reason: 'In AABB collision zone' 
      };
    }
    
    if (performPreciseCheck) {
      const preciseCollision = await this.collisionDetector.checkFurnitureCollisions(id);
      
      if (preciseCollision.hasCollision) {
        const lastValid = this.lastValidPositions.get(id) || originalPosition;
        furniture.setPosition(lastValid);
        this.collisionDetector.updateFurnitureBox(id, furniture.getGroup(), furniture.getModelId());
        furniture.setCollision(false);
        return { 
          success: false, 
          needsConfirmation: false, 
          needsPreciseCheck: false,
          reason: 'Objects are overlapping' 
        };
      } else {
        this.lastValidPositions.set(id, newPosition);
        furniture.setCollision(false);
        return { 
          success: true, 
          needsConfirmation: false, 
          needsPreciseCheck: false 
        };
      }
    }

    this.lastValidPositions.set(id, newPosition);
    furniture.setCollision(false);
    
    return { success: true, needsConfirmation: false, needsPreciseCheck: false };
  }

  getLastValidPosition(id: string): [number, number, number] | undefined {
    return this.lastValidPositions.get(id);
  }

  clearLastValidPosition(id: string): void {
    this.lastValidPositions.delete(id);
  }

  rotateFurniture(id: string, rotation: [number, number, number]): boolean {
    const furniture = this.furnitureItems.get(id);
    if (!furniture) return false;

    furniture.setRotation(rotation);
    
    if (this.config.enableCollisionDetection) {
      this.updateFurnitureCollision(id).then(() => {
        this.furnitureItems.forEach((_, otherId) => {
          if (otherId !== id) {
            this.updateFurnitureCollision(otherId);
          }
        });
      });
    }

    return true;
  }

  isWallMounted(id: string): boolean {
    const furniture = this.furnitureItems.get(id);
    return furniture?.isOnWall() || false;
  }

  isWallMountable(id: string): boolean {
    const furniture = this.furnitureItems.get(id);
    return furniture?.isWallMountable() || false;
  }

  setWallPlacement(id: string, wallNormal: [number, number, number], wallPosition: number): boolean {
    const furniture = this.furnitureItems.get(id);
    if (!furniture || !furniture.isWallMountable()) return false;

    furniture.setWallPlacement({
      wallNormal,
      wallPosition,
    });

    return true;
  }

  unmountFromWallAndFloat(id: string): boolean {
    const furniture = this.furnitureItems.get(id);
    if (!furniture || !furniture.isOnWall()) return false;

    const wallPlacement = furniture.getWallPlacement();
    const currentPos = furniture.getPosition();
    
    // Move item away from wall into the room
    const offsetDistance = 0.5;
    const newPos: [number, number, number] = [...currentPos];
    
    if (wallPlacement) {
      const wallNormal = wallPlacement.wallNormal;
      
      if (Math.abs(wallNormal[0]) > Math.abs(wallNormal[2])) {
        // X wall
        if (wallNormal[0] > 0) {
          newPos[0] = currentPos[0] + offsetDistance;
        } else {
          newPos[0] = currentPos[0] - offsetDistance;
        }
      } else {
        // Z wall
        if (wallNormal[2] > 0) {
          newPos[2] = currentPos[2] + offsetDistance;
        } else {
          newPos[2] = currentPos[2] - offsetDistance;
        }
      }
    }
    
    // Unmount from wall
    furniture.setPlacementMode('floor');
    furniture.setFloating(true);
    furniture.setPosition(newPos);
    
    // Update collision detection
    this.collisionDetector.updateFurnitureBox(id, furniture.getGroup(), furniture.getModelId());
    
    return true;
  }

  async moveWallFurniture(
    id: string,
    deltaVertical: number,
    deltaHorizontal: number,
    deltaInOut: number = 0
  ): Promise<MoveResult> {
    const furniture = this.furnitureItems.get(id);
    if (!furniture) return { 
      success: false, 
      needsConfirmation: false, 
      needsPreciseCheck: false,
      reason: 'Furniture not found' 
    };

    if (!furniture.isOnWall()) {
      return { 
        success: false, 
        needsConfirmation: false, 
        needsPreciseCheck: false,
        reason: 'Furniture is not wall-mounted' 
      };
    }

    const currentPosition = furniture.getPosition();
    const newPosition = furniture.moveAlongWall(deltaVertical, deltaHorizontal);
    
    const wallPlacement = furniture.getWallPlacement();
    if (wallPlacement && Math.abs(deltaInOut) < 0.001) {
      const wallNormal = wallPlacement.wallNormal;
      const wallPosition = wallPlacement.wallPosition;
      const wallOffset = 0.02;
      
      if (Math.abs(wallNormal[0]) > Math.abs(wallNormal[2])) {
        // X wall
        if (wallNormal[0] > 0) {
          newPosition[0] = wallPosition + wallOffset;
        } else {
          newPosition[0] = wallPosition - wallOffset;
        }
      } else {
        // Z wall
        if (wallNormal[2] > 0) {
          newPosition[2] = wallPosition + wallOffset;
        } else {
          newPosition[2] = wallPosition - wallOffset;
        }
      }
    }
    
    // Check if the new position would hit another wall
    const roomBoundary = this.collisionDetector.getRoomBoundary();
    if (roomBoundary) {
      const wallPlacement = furniture.getWallPlacement();
      if (wallPlacement) {
        const wallNormal = wallPlacement.wallNormal;
        const margin = 0.15;
        
        furniture.setPosition(newPosition);
        this.collisionDetector.updateFurnitureBox(id, furniture.getGroup(), furniture.getModelId());
        const box = this.collisionDetector.furnitureBoxes.get(id);
        
        if (box) {
          let constrainedY = newPosition[1];
          const boxSize = new THREE.Vector3();
          box.getSize(boxSize);
          
          if (box.min.y < roomBoundary.min.y + margin) {
            constrainedY = roomBoundary.min.y + margin + boxSize.y / 2;
          } else if (box.max.y > roomBoundary.max.y - margin) {
            constrainedY = roomBoundary.max.y - margin - boxSize.y / 2;
          }
          
          const inOutDistance = Math.abs(deltaInOut);
          const isMovingAwayFromWall = inOutDistance > 0.01;
          
          let constrainedX = newPosition[0];
          let constrainedZ = newPosition[2];
          let needsConstraint = false;
          
          if (Math.abs(wallNormal[2]) > Math.abs(wallNormal[0])) {
            if (box.min.x < roomBoundary.min.x + margin || box.max.x > roomBoundary.max.x - margin) {
              if (!isMovingAwayFromWall) {
                furniture.setPosition(currentPosition);
                this.collisionDetector.updateFurnitureBox(id, furniture.getGroup(), furniture.getModelId());
                return {
                  success: false,
                  needsConfirmation: false,
                  needsPreciseCheck: false,
                  reason: 'Cannot move further - wall boundary reached'
                };
              } else {
                if (box.min.x < roomBoundary.min.x + margin) {
                  constrainedX = roomBoundary.min.x + margin + boxSize.x / 2;
                } else if (box.max.x > roomBoundary.max.x - margin) {
                  constrainedX = roomBoundary.max.x - margin - boxSize.x / 2;
                }
                needsConstraint = true;
              }
            }
          } else {
            if (box.min.z < roomBoundary.min.z + margin || box.max.z > roomBoundary.max.z - margin) {
              if (!isMovingAwayFromWall) {
                furniture.setPosition(currentPosition);
                this.collisionDetector.updateFurnitureBox(id, furniture.getGroup(), furniture.getModelId());
                return {
                  success: false,
                  needsConfirmation: false,
                  needsPreciseCheck: false,
                  reason: 'Cannot move further - wall boundary reached'
                };
              } else {
                if (box.min.z < roomBoundary.min.z + margin) {
                  constrainedZ = roomBoundary.min.z + margin + boxSize.z / 2;
                } else if (box.max.z > roomBoundary.max.z - margin) {
                  constrainedZ = roomBoundary.max.z - margin - boxSize.z / 2;
                }
                needsConstraint = true;
              }
            }
          }
          
          if (constrainedY !== newPosition[1] || needsConstraint) {
            const constrainedPos: [number, number, number] = [constrainedX, constrainedY, constrainedZ];
            furniture.setPosition(constrainedPos);
            this.collisionDetector.updateFurnitureBox(id, furniture.getGroup(), furniture.getModelId());
            newPosition[0] = constrainedX;
            newPosition[1] = constrainedY;
            newPosition[2] = constrainedZ;
          }
        }
      }
    }
    
    if (Math.abs(deltaInOut) > 0.05) {
      const wallPlacement = furniture.getWallPlacement();
      if (wallPlacement && roomBoundary) {
        furniture.setPosition(newPosition);
        this.collisionDetector.updateFurnitureBox(id, furniture.getGroup(), furniture.getModelId());
        const box = this.collisionDetector.furnitureBoxes.get(id);
        
        if (box) {
          const margin = 0.1;
          const wallNormal = wallPlacement.wallNormal;
          const wallPosition = wallPlacement.wallPosition;
          
          let isStillTouchingWall = false;
          if (Math.abs(wallNormal[2]) > Math.abs(wallNormal[0])) {
            // Z wall
            isStillTouchingWall = Math.abs(box.min.z - wallPosition) < margin || Math.abs(box.max.z - wallPosition) < margin;
          } else {
            // X wall
            isStillTouchingWall = Math.abs(box.min.x - wallPosition) < margin || Math.abs(box.max.x - wallPosition) < margin;
          }
          
          if (!isStillTouchingWall) {
            furniture.setPlacementMode('floor');
          }
        }
      }
    }
    
    furniture.setPosition(newPosition);
    
    if (this.config.enableCollisionDetection) {
      await this.updateFurnitureCollision(id);
    }
    
    return { success: true, needsConfirmation: false, needsPreciseCheck: false };
  }

  scaleFurniture(id: string, scale: number | [number, number, number]): boolean {
    const furniture = this.furnitureItems.get(id);
    if (!furniture) return false;

    furniture.setScale(scale);
    
    if (this.config.enableCollisionDetection) {
      this.updateFurnitureCollision(id).then(() => {
        this.furnitureItems.forEach((_, otherId) => {
          if (otherId !== id) {
            this.updateFurnitureCollision(otherId);
          }
        });
      });
    }

    return true;
  }

  calculateSpawnPosition(camera: THREE.Camera, distance: number = 2): [number, number, number] {
    const cameraWorldPos = new THREE.Vector3();
    camera.getWorldPosition(cameraWorldPos);

    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    const spawnPos = cameraWorldPos.clone();
    spawnPos.addScaledVector(cameraDirection, distance);
    spawnPos.y = this.config.floorLevel;

    if (this.homeModel) {
      const constrained = this.homeModel.constrainPosition(spawnPos);
      return [constrained.x, constrained.y, constrained.z];
    }

    return [spawnPos.x, spawnPos.y, spawnPos.z];
  }


  private adjustPositionToWall(
    id: string,
    position: [number, number, number],
    wallNormal: [number, number, number],
    wallPosition: number
  ): [number, number, number] {
    const adjusted: [number, number, number] = [...position];
    const wallOffset = 0.02;

    const box = this.collisionDetector.furnitureBoxes.get(id);
    if (!box) {
      if (Math.abs(wallNormal[0]) > Math.abs(wallNormal[2])) {
        // X wall
        adjusted[0] = wallPosition + (wallNormal[0] > 0 ? wallOffset : -wallOffset);
      } else {
        // Z wall
        adjusted[2] = wallPosition + (wallNormal[2] > 0 ? wallOffset : -wallOffset);
      }
      return adjusted;
    }

    if (Math.abs(wallNormal[0]) > Math.abs(wallNormal[2])) {
      // X wall
      if (wallNormal[0] > 0) {
        adjusted[0] = wallPosition + wallOffset;
      } else {
        adjusted[0] = wallPosition - wallOffset;
      }
    } else {
      // Z wall
      if (wallNormal[2] > 0) {
        adjusted[2] = wallPosition + wallOffset;
      } else {
        adjusted[2] = wallPosition - wallOffset;
      }
    }

    return adjusted;
  }

  serializeScene(): Record<string, unknown> {
    const deployedItems: Record<string, unknown> = {};

    this.furnitureItems.forEach((furniture) => {
      const catalogId = furniture.getId().includes('-') 
        ? furniture.getId().split('-')[0] 
        : furniture.getId();
      
      deployedItems[catalogId] = furniture.serialize();
    });

    return {
      home: this.homeModel?.serialize(),
      deployedItems,
    };
  }

  setDebugMode(enabled: boolean): void {
    this.config.enableDebugMode = enabled;
    this.collisionDetector.setDebugMode(enabled);
  }

  setCollisionDetection(enabled: boolean): void {
    this.config.enableCollisionDetection = enabled;
  }

  // Update all furniture animations
  updateAnimations(delta: number): void {
    this.furnitureItems.forEach((furniture) => {
      furniture.update(delta);
    });
  }

  dispose(): void {
    this.clearAllFurniture();
    
    if (this.homeModel) {
      this.scene.remove(this.homeModel.getGroup());
      this.homeModel.dispose();
      this.homeModel = null;
    }
    
    this.collisionDetector.clear();
  }
}