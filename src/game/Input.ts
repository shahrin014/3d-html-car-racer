export type SteerDirection = -1 | 1;

const SWIPE_THRESHOLD = 26;
const TAP_THRESHOLD = 12;
const TAP_DURATION_MS = 320;

/**
 * Turns touch, mouse, and keyboard input into single lane-change intents.
 * Attached to the canvas so UI buttons never double-trigger steering.
 */
export class Input {
  private readonly element: HTMLElement;
  private readonly onSteer: (direction: SteerDirection) => void;
  private pointerStart: { x: number; y: number; time: number } | null = null;

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.pointerType === 'mouse') {
      return;
    }
    this.pointerStart = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
    this.element.setPointerCapture?.(event.pointerId);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const start = this.pointerStart;
    this.pointerStart = null;
    this.element.releasePointerCapture?.(event.pointerId);
    if (!start) {
      return;
    }

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const elapsed = performance.now() - start.time;

    if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      this.onSteer(dx > 0 ? 1 : -1);
      return;
    }

    if (Math.abs(dx) < TAP_THRESHOLD && Math.abs(dy) < TAP_THRESHOLD) {
      if (elapsed > TAP_DURATION_MS) {
        return;
      }
      // Tapping the left or right half of the track nudges the car that way.
      const bounds = this.element.getBoundingClientRect();
      const midpoint = bounds.left + bounds.width / 2;
      this.onSteer(event.clientX >= midpoint ? 1 : -1);
    }
  };

  private readonly handlePointerCancel = (): void => {
    this.pointerStart = null;
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
      event.preventDefault();
      this.onSteer(-1);
    } else if (
      event.key === 'ArrowRight' ||
      event.key === 'd' ||
      event.key === 'D'
    ) {
      event.preventDefault();
      this.onSteer(1);
    }
  };

  constructor(element: HTMLElement, onSteer: (direction: SteerDirection) => void) {
    this.element = element;
    this.onSteer = onSteer;
  }

  attach(): void {
    this.element.addEventListener('pointerdown', this.handlePointerDown);
    this.element.addEventListener('pointerup', this.handlePointerUp);
    this.element.addEventListener('pointercancel', this.handlePointerCancel);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  detach(): void {
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('pointerup', this.handlePointerUp);
    this.element.removeEventListener('pointercancel', this.handlePointerCancel);
    window.removeEventListener('keydown', this.handleKeyDown);
  }
}
