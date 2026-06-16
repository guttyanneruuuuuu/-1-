import * as THREE from 'three';

/**
 * Unified input for PC (keyboard + mouse look) and mobile (joystick + buttons).
 * Produces an abstract control state each frame:
 *   move: {x, z}     -1..1 (strafe, forward)  [camera-relative]
 *   vertical: -1..1  (down..up)
 *   look: {dx, dy}   accumulated yaw/pitch delta (consumed each frame)
 *   boost: bool
 *   actionPressed: bool (edge — true once per press)
 */
export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.move = { x: 0, z: 0 };
    this.vertical = 0;
    this.look = { dx: 0, dy: 0 };
    this.boost = false;
    this._actionQueued = false;
    this.pointerLocked = false;
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    this._initKeyboard();
    this._initMouse();
    if (this.isTouch) this._initTouch();
  }

  // ---------------- Keyboard ----------------
  _initKeyboard() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (k === 'e') this._actionQueued = true;
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
  }

  // ---------------- Mouse look ----------------
  _initMouse() {
    this.canvas.addEventListener('click', () => {
      if (!this.isTouch && !this.pointerLocked && this._gameActive) {
        this.canvas.requestPointerLock?.();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
      }
    });
    window.addEventListener('mousedown', (e) => {
      if (this.pointerLocked && e.button === 0) this._actionQueued = true;
    });
  }

  // ---------------- Touch ----------------
  _initTouch() {
    const joy = document.getElementById('joystick');
    const knob = document.getElementById('joystick-knob');
    let joyId = null, jcx = 0, jcy = 0, jr = 55;

    const startJoy = (t, rect) => {
      joyId = t.identifier;
      jcx = rect.left + rect.width/2;
      jcy = rect.top + rect.height/2;
    };
    const moveJoy = (t) => {
      let dx = t.clientX - jcx, dy = t.clientY - jcy;
      const len = Math.hypot(dx, dy);
      if (len > jr) { dx = dx/len*jr; dy = dy/len*jr; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.move.x = dx / jr;
      this.move.z = -dy / jr;       // up on screen = forward
    };
    const endJoy = () => {
      joyId = null;
      knob.style.transform = 'translate(0,0)';
      this.move.x = 0; this.move.z = 0;
    };

    joy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      startJoy(t, joy.getBoundingClientRect());
      moveJoy(t);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) { moveJoy(t); }
        else this._handleLookTouch(t);
      }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) endJoy();
        if (t.identifier === this._lookId) this._lookId = null;
      }
    });

    // Right-half drag for camera look
    this._lookId = null; this._lookLast = null;
    window.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) continue;
        // ignore touches on buttons
        if (t.target.closest('.action-buttons') || t.target.closest('#joystick')) continue;
        if (this._lookId === null) {
          this._lookId = t.identifier;
          this._lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: false });

    // Action buttons
    const bind = (id, on, off) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e)=>{ e.preventDefault(); on(); }, {passive:false});
      if (off) el.addEventListener('touchend', (e)=>{ e.preventDefault(); off(); }, {passive:false});
    };
    bind('btn-up', () => this._upHeld = true, () => this._upHeld = false);
    bind('btn-down', () => this._downHeld = true, () => this._downHeld = false);
    bind('btn-boost', () => this.boost = true, () => this.boost = false);
    bind('btn-action', () => this._actionQueued = true);
  }

  _handleLookTouch(t) {
    if (t.identifier !== this._lookId || !this._lookLast) return;
    this.look.dx += (t.clientX - this._lookLast.x);
    this.look.dy += (t.clientY - this._lookLast.y);
    this._lookLast = { x: t.clientX, y: t.clientY };
  }

  setGameActive(active) { this._gameActive = active; }

  /** Read & reset per-frame edge state. Returns a control snapshot. */
  sample() {
    const k = this.keys;
    // keyboard movement
    let mx = this.move.x, mz = this.move.z;
    if (!this.isTouch || (mx === 0 && mz === 0)) {
      let kx = 0, kz = 0;
      if (k['w'] || k['arrowup']) kz += 1;
      if (k['s'] || k['arrowdown']) kz -= 1;
      if (k['a'] || k['arrowleft']) kx -= 1;
      if (k['d'] || k['arrowright']) kx += 1;
      if (kx || kz) { mx = kx; mz = kz; }
    }
    // vertical
    let v = 0;
    if (k[' '] ) v += 1;
    if (k['shift']) v -= 1;
    if (this._upHeld) v += 1;
    if (this._downHeld) v -= 1;

    // boost
    const boost = this.boost || !!k['control'];

    const snap = {
      move: { x: mx, z: mz },
      vertical: v,
      look: { dx: this.look.dx, dy: this.look.dy },
      boost,
      actionPressed: this._actionQueued
    };
    // reset edges
    this.look.dx = 0; this.look.dy = 0;
    this._actionQueued = false;
    return snap;
  }
}
