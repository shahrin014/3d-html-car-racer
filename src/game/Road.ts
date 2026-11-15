import * as THREE from 'three';
import { DESPAWN_Z, ROAD_LENGTH, ROAD_WIDTH } from './constants';

const DASH_PERIOD = 9;
const POST_SPACING = 14;
const POSTS_PER_SIDE = 18;
const POST_SPAN = POST_SPACING * POSTS_PER_SIDE;

/** Build an asphalt texture with two dashed lane dividers. */
function createAsphaltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas is not available');
  }

  ctx.fillStyle = '#151c26';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Fine grain so the road does not read as a flat plane on phone screens.
  for (let i = 0; i < 900; i += 1) {
    const shade = 20 + Math.floor(Math.random() * 26);
    ctx.fillStyle = `rgba(${shade}, ${shade + 6}, ${shade + 12}, 0.5)`;
    ctx.fillRect(
      Math.random() * canvas.width,
      Math.random() * canvas.height,
      2,
      2,
    );
  }

  ctx.fillStyle = 'rgba(226, 236, 255, 0.7)';
  const lineWidth = 6;
  const dashHeight = canvas.height * 0.42;
  for (const fraction of [1 / 3, 2 / 3]) {
    ctx.fillRect(
      canvas.width * fraction - lineWidth / 2,
      0,
      lineWidth,
      dashHeight,
    );
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, ROAD_LENGTH / DASH_PERIOD);
  texture.anisotropy = 4;
  return texture;
}

/**
 * The road, its scrolling lane markings, and the neon roadside posts.
 * Everything recycles in place; no geometry is created during a run.
 */
export class Road {
  readonly group = new THREE.Group();

  private readonly texture: THREE.CanvasTexture;
  private readonly asphalt: THREE.MeshStandardMaterial;
  private readonly ground: THREE.MeshStandardMaterial;
  private readonly posts: THREE.InstancedMesh;
  private readonly postPositions: Array<{ x: number; z: number }> = [];
  private readonly dummy = new THREE.Object3D();
  private scroll = 0;

  constructor() {
    this.group.name = 'road';

    this.ground = new THREE.MeshStandardMaterial({
      color: 0x061019,
      roughness: 1,
      metalness: 0,
    });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 420),
      this.ground,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, -120);
    this.group.add(ground);

    this.texture = createAsphaltTexture();
    this.asphalt = new THREE.MeshStandardMaterial({
      map: this.texture,
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.05,
    });
    const surface = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH),
      this.asphalt,
    );
    surface.rotation.x = -Math.PI / 2;
    surface.position.set(0, 0, -ROAD_LENGTH / 2 + 20);
    this.group.add(surface);

    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8f2ff,
      emissive: 0x2b4a63,
      emissiveIntensity: 0.8,
      roughness: 0.5,
    });
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(
        new THREE.PlaneGeometry(0.14, ROAD_LENGTH),
        edgeMaterial,
      );
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(
        side * (ROAD_WIDTH / 2 - 0.16),
        0.011,
        -ROAD_LENGTH / 2 + 20,
      );
      this.group.add(edge);
    }

    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a3d52,
      emissive: 0x22d3ee,
      emissiveIntensity: 1.15,
      roughness: 0.45,
      metalness: 0.2,
    });
    this.posts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.16, 0.9, 0.16),
      postMaterial,
      POSTS_PER_SIDE * 2,
    );
    this.posts.frustumCulled = false;
    this.posts.name = 'roadside-posts';
    this.group.add(this.posts);

    this.resetPosts();
    this.writePostMatrices();
  }

  private resetPosts(): void {
    this.postPositions.length = 0;
    for (let i = 0; i < POSTS_PER_SIDE; i += 1) {
      const z = 16 - i * POST_SPACING;
      for (const side of [-1, 1]) {
        this.postPositions.push({ x: side * (ROAD_WIDTH / 2 + 0.8), z });
      }
    }
  }

  private writePostMatrices(): void {
    for (let i = 0; i < this.postPositions.length; i += 1) {
      const post = this.postPositions[i];
      if (!post) {
        continue;
      }
      this.dummy.position.set(post.x, 0.45, post.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.posts.setMatrixAt(i, this.dummy.matrix);
    }
    this.posts.instanceMatrix.needsUpdate = true;
  }

  /** Advance lane markings and roadside posts by the distance travelled. */
  update(dt: number, speed: number): void {
    const distance = speed * dt;
    this.scroll = (this.scroll + distance / DASH_PERIOD) % 1;
    this.texture.offset.y = this.scroll;

    for (const post of this.postPositions) {
      post.z += distance;
      if (post.z > DESPAWN_Z) {
        post.z -= POST_SPAN;
      }
    }
    this.writePostMatrices();
  }

  reset(): void {
    this.scroll = 0;
    this.texture.offset.y = 0;
    this.resetPosts();
    this.writePostMatrices();
  }

  dispose(): void {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          material.dispose();
        }
      }
    });
    this.texture.dispose();
    this.ground.dispose();
    this.asphalt.dispose();
  }
}
