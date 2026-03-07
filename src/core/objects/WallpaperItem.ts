import * as THREE from 'three';
import { FurnitureItem, FurnitureMetadata, WallPlacementInfo } from './FurnitureItem';
import { Transform } from './Base3DObject';

export class WallpaperItem extends FurnitureItem {
  protected wallWidth: number;
  protected wallHeight: number;
  protected base64Image: string;

  constructor(
    id: string,
    name: string,
    modelId: number,
    wallWidth: number,
    wallHeight: number,
    wallPlacement: WallPlacementInfo,
    base64Image: string,
    metadata: FurnitureMetadata = {},
    initialTransform?: Partial<Transform>
  ) {
    const metadataWithWall: FurnitureMetadata = {
      ...metadata,
      category: 'wallpaper',
      wallMountable: true,
    };
    super(id, name, modelId, null, metadataWithWall, initialTransform, 'wallpaper', base64Image);
    this.wallWidth = wallWidth;
    this.wallHeight = wallHeight;
    this.base64Image = base64Image;
    this.setWallPlacement(wallPlacement);
  }

  isWallpaper(): boolean {
    return true;
  }

  reorientPlaneToWall(): void {
    const wallPlacement = this.getWallPlacement();
    if (!wallPlacement) return;
    this.applyWallOrientationToPlane((plane) =>
      this.orientPlaneToNormal(plane, wallPlacement.wallNormal)
    );
  }

  private orientPlaneToNormal(
    plane: THREE.Mesh<THREE.PlaneGeometry>,
    wallNormal: [number, number, number]
  ): void {
    const targetNormal = new THREE.Vector3(
      wallNormal[0],
      wallNormal[1],
      wallNormal[2]
    ).normalize();
    const defaultNormal = new THREE.Vector3(0, 0, 1);
    if (targetNormal.dot(defaultNormal) < -0.999) {
      plane.rotation.set(0, Math.PI, 0);
    } else {
      plane.quaternion.setFromUnitVectors(defaultNormal, targetNormal);
    }
  }

  private applyWallOrientationToPlane(
    fn: (plane: THREE.Mesh<THREE.PlaneGeometry>) => void
  ): void {
    this.modelGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry?.type === 'PlaneGeometry') {
        fn(child as THREE.Mesh<THREE.PlaneGeometry>);
      }
    });
  }

  override moveAlongWall(_deltaVertical: number, deltaHorizontal: number): [number, number, number] {
    const currentPos = this.getPosition();
    const newPos: [number, number, number] = [...currentPos];

    if (!this.getWallPlacement()) return newPos;

    const wallNormal = this.getWallPlacement()!.wallNormal;

    if (Math.abs(wallNormal[2]) > Math.abs(wallNormal[0])) {
      newPos[0] += deltaHorizontal;
    } else {
      newPos[2] += deltaHorizontal;
    }

    return newPos;
  }

  override async loadModel(_scene: THREE.Scene): Promise<void> {
    this.modelGroup.clear();

    const planeGeometry = new THREE.PlaneGeometry(this.wallWidth, this.wallHeight);

    const texture = this.loadTextureFromBase64(this.base64Image);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    const plane = new THREE.Mesh(planeGeometry, material);

    const wallPlacement = this.getWallPlacement();
    if (wallPlacement) {
      this.orientPlaneToNormal(plane, wallPlacement.wallNormal);
    }

    this.modelGroup.add(plane);
  }

  private loadTextureFromBase64(base64: string): THREE.Texture {
    const imageUrl = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
    const loader = new THREE.TextureLoader();
    const texture = loader.load(imageUrl);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  override serialize(): Record<string, unknown> {
    const base = super.serialize();
    return {
      ...base,
      wall_width: this.wallWidth,
      wall_height: this.wallHeight,
      image: this.base64Image,
    };
  }

  override dispose(): void {
    this.modelGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshBasicMaterial;
        if (mat.map) mat.map.dispose();
        mat.dispose();
      }
    });
    super.dispose();
  }
}
