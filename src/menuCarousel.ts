import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCar, preloadCarModel } from './game/car-runtime.mjs';
import { CARS } from './game/car-spec.mjs';
import type { Paint } from './game/palette';

type PreviewCar = ReturnType<typeof createCar>;

/**
 * Live, in-browser car preview for the menu carousel.
 *
 * The preview is the same runtime car builder the game uses (`car-runtime.mjs`)
 * against the same published assets, so the car in the menu and the car on the
 * grid are identical. Because it is a running Three.js scene rather than a
 * baked PNG, choosing a paint recolours the car on screen immediately.
 */
export class CarPreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private car: PreviewCar | null = null;
  private carId: string;
  private paint: Paint;
  /** Group that holds the current car so the idle spin has one pivot. */
  private readonly display = new THREE.Group();
  private readonly reducedMotion: MediaQueryList;
  private yaw = 0;
  private readonly resizeObserver: ResizeObserver;

  /**
   * Framing, in metres and radians. The car is 2.45 m long, so the turntable's
   * widest silhouette is the diagonal (~2.62 m). Fitting that box to both
   * fields of view keeps the whole car in frame while letting it fill a wide
   * slide; a bounding-sphere fit left too much empty space.
   */
  private static readonly FRAME_WIDTH = 2.8;
  private static readonly FRAME_HEIGHT = 1.6;
  private static readonly VIEW_MARGIN = 1.12;
  private static readonly VIEW_TARGET = new THREE.Vector3(0, 0.24, 0);
  private static readonly VIEW_ELEVATION = 0.32;

  constructor(container: HTMLElement, paint: Paint, carId: string) {
    this.carId = carId;
    this.paint = paint;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', 'Car preview');
    this.renderer.domElement.setAttribute('role', 'img');

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 40);
    this.scene.add(this.camera);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.75;

    // Fill the lower third so the light bounces off the deck onto the bodywork,
    // the way a studio shell does. This gives dark paints real form too.
    const deck = new THREE.Mesh(
      new THREE.CircleGeometry(3, 48),
      new THREE.MeshStandardMaterial({
        color: 0x0d1824,
        roughness: 0.9,
        metalness: 0,
      }),
    );
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = -0.02;
    this.scene.add(deck);

    const key = new THREE.DirectionalLight(0xfff2df, 2.4);
    key.position.set(4, 6, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x22d3ee, 1.1);
    rim.position.set(-5, 3, -4);
    this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0x9fd6ff, 0x0a1018, 0.5));

    this.display.position.y = -0.02;
    this.scene.add(this.display);

    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.renderer.setAnimationLoop(this.tick);
  }

  /**
   * Change the paint of the previewed car without reloading the model. Uses the
   * same clone-and-repaint path as the game, so picking a swatch updates the
   * car immediately.
   */
  setPaint(paint: Paint): void {
    if (paint.id === this.paint.id || !this.car) {
      return;
    }
    this.paint = paint;
    const option = CARS.find((car) => car.id === this.carId) ?? CARS[0]!;
    this.swapCar(this.carId, paint, option.paintBaseLuma);
  }

  /**
   * Load a different car model and show it with the current paint. Passing the
   * same id still renders the car the first time, when no preview exists yet.
   */
  async setCar(id: string): Promise<void> {
    if (id === this.carId && this.car) {
      return;
    }
    const option = CARS.find((car) => car.id === id) ?? CARS[0]!;
    await preloadCarModel(`${import.meta.env.BASE_URL}models/`, id);
    this.carId = id;
    this.swapCar(id, this.paint, option.paintBaseLuma);
  }

  private swapCar(id: string, paint: Paint, baseLuma: number): void {
    if (this.car) {
      this.display.clear();
      this.car = null;
    }
    this.car = createCar(paint.color, id, baseLuma);
    this.display.add(this.car.group);
    this.yaw = 0;
  }

  private readonly tick = (): void => {
    // Slow turntable so paint catches the light. Reduced motion turns it off.
    if (!this.reducedMotion.matches) {
      this.yaw += 0.008;
    }
    if (this.car) {
      this.car.group.rotation.y = this.yaw;
    }
    this.renderer.render(this.scene, this.camera);
  };

  private resize(): void {
    const width = this.renderer.domElement.parentElement?.clientWidth || 0;
    const height = this.renderer.domElement.parentElement?.clientHeight || 0;
    if (width === 0 || height === 0) {
      return;
    }
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();

    // Fit the car's frame box to the tighter of the two fields of view. The old
    // distance scaled with the container in pixels, so a small carousel placed
    // the camera almost inside the car.
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * this.camera.aspect);
    const distance =
      CarPreview.VIEW_MARGIN *
      Math.max(
        CarPreview.FRAME_HEIGHT / 2 / Math.tan(verticalFov / 2),
        CarPreview.FRAME_WIDTH / 2 / Math.tan(horizontalFov / 2),
      );
    const target = CarPreview.VIEW_TARGET;
    this.camera.position.set(
      0,
      target.y + Math.sin(CarPreview.VIEW_ELEVATION) * distance,
      Math.cos(CarPreview.VIEW_ELEVATION) * distance,
    );
    this.camera.lookAt(target);
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.display.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}