import * as THREE from 'three';
import frameUrl from './assets/cockpit-frame.png';
import wheelUrl from './assets/cockpit-wheel.png';

/**
 * Driver's-eye cockpit overlay.
 *
 * The cockpit is drawn in camera space rather than car space. The camera rig
 * already rides the body through banks and loops, so an interior parented to
 * the camera stays locked to the driver's view with no per-frame transform,
 * and the exterior shell can stay hidden while it is shown.
 *
 * The frame is a PNG with a transparent windscreen, so the live track shows
 * through the middle while the dashboard, A-pillars, and roof header sit on
 * top. The steering wheel is a separate PNG on a plane in front of the frame;
 * that is what lets it turn under the steering input without smearing the
 * dashboard behind it.
 */

/** Largest visual rotation of the wheel at full lock, in radians (70°). */
export const COCKPIT_WHEEL_MAX_ANGLE = (70 * Math.PI) / 180;
/** How quickly the drawn wheel follows the steering target, per second. */
export const COCKPIT_WHEEL_RESPONSE = 16;

/** Depth of the cockpit frame in front of the camera, in metres. */
export const COCKPIT_FRAME_DEPTH = 0.78;
/** Depth of the steering wheel, closer than the frame. */
export const COCKPIT_WHEEL_DEPTH = 0.5;
/** Wheel size on its closer plane, matched to the frame's centre dial. */
const WHEEL_SIZE = 0.235;

/**
 * Wheel rotation for a steering input in [-1, 1]. Positive steer is the
 * driver's right, which turns the wheel clockwise: negative about the camera's
 * forward axis, where +Z points back toward the driver.
 */
export function steeringWheelAngle(steer: number): number {
  const clamped = THREE.MathUtils.clamp(steer, -1, 1);
  // Avoid returning negative zero at centre; a dead-ahead wheel is exact.
  return clamped === 0 ? 0 : -clamped * COCKPIT_WHEEL_MAX_ANGLE;
}

export interface Cockpit {
  /** Camera-space group; add it to the camera, not the car. */
  group: THREE.Group;
  setVisible: (visible: boolean) => void;
  /** Follow a steering input in [-1, 1] for `delta` seconds. */
  turn: (steer: number, delta: number) => void;
  /** Size the frame to cover the viewport at the current aspect. */
  resize: (camera: THREE.PerspectiveCamera) => void;
  dispose: () => void;
}

/**
 * Build the frame and steering wheel. Both are PNG overlays imported through
 * Vite, so the art ships as regular cached assets instead of a binary payload
 * inside the app shell.
 */
export function createCockpit(): Cockpit {
  const group = new THREE.Group();
  group.name = 'cockpit';
  group.visible = false;

  const loader = new THREE.TextureLoader();

  const frame = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 1),
    cockpitMaterial(loadTexture(loader, frameUrl)),
  );
  frame.name = 'cockpit-frame';
  frame.position.set(0, 0, -COCKPIT_FRAME_DEPTH);
  frame.renderOrder = 10;
  group.add(frame);

  const pivot = new THREE.Group();
  // Put the wheel over the dial in the frame's central console. It sits on a
  // nearer plane, so its offset and size are scaled by the depth ratio.
  pivot.position.set(0, -0.2, -COCKPIT_WHEEL_DEPTH);
  // Steering wheels lean away at the top; spinning the inner mesh about its
  // own normal keeps the rim turning flat instead of wobbling.
  pivot.rotation.x = -0.2;
  group.add(pivot);

  const wheel = new THREE.Mesh(
    new THREE.PlaneGeometry(WHEEL_SIZE, WHEEL_SIZE),
    cockpitMaterial(loadTexture(loader, wheelUrl)),
  );
  wheel.name = 'steering-wheel';
  wheel.renderOrder = 11;
  pivot.add(wheel);

  let angle = 0;

  return {
    group,
    setVisible: (visible) => {
      group.visible = visible;
    },
    turn: (steer, delta) => {
      const target = steeringWheelAngle(steer);
      angle = THREE.MathUtils.damp(angle, target, COCKPIT_WHEEL_RESPONSE, delta);
      wheel.rotation.z = angle;
    },
    resize: (camera) => {
      const visibleHeight =
        2 *
        Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) *
        COCKPIT_FRAME_DEPTH;
      const visibleWidth = visibleHeight * camera.aspect;
      // The frame texture is 2:1; its geometry is 2 by 1, so scaling by the
      // view's half-width and full height fills the screen exactly.
      frame.scale.set(visibleWidth / 2, visibleHeight, 1);
    },
    dispose: () => {
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }
        object.geometry.dispose();
        const material = object.material;
        if (material instanceof THREE.MeshBasicMaterial) {
          material.map?.dispose();
          material.dispose();
        }
      });
      group.removeFromParent();
    },
  };
}

function loadTexture(
  loader: THREE.TextureLoader,
  url: string,
): THREE.Texture {
  const texture = loader.load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * An overlay material: unlit, untonemapped, and always drawn in front. The
 * cockpit is a view attachment, so a rail or the car's own shell must never
 * poke through it.
 */
function cockpitMaterial(map: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}
