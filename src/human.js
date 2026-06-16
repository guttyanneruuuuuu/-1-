import * as THREE from 'three';

/**
 * A simple low-poly human that wanders, relaxes, gets itchy, and swats at the
 * mosquito when it notices it. Exposes blood "feeding spots" (skin) the
 * mosquito can land on, plus "cloth" spots that are safe to perch on.
 */
export class Human {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.skinColor = opts.skinColor ?? 0xf0c8a0;
    this.shirtColor = opts.shirtColor ?? 0x3b6e8c;
    this.pantsColor = opts.pantsColor ?? 0x2c3e50;
    this.homePos = opts.pos ? opts.pos.clone() : new THREE.Vector3(0, 0, 0);
    this.wanderRadius = opts.wanderRadius ?? 6;
    this.speed = opts.speed ?? 1.0;
    this.alertness = opts.alertness ?? 1.0; // multiplier on how fast it notices

    this.group = new THREE.Group();
    this.group.position.copy(this.homePos);
    scene.add(this.group);

    // body state
    this.awareness = 0;     // 0..100 how aware of mosquito it is
    this.itch = 0;          // 0..100 accumulated bite irritation -> triggers swat
    this.state = 'idle';    // idle | walk | swat | scratch
    this.stateTimer = 2 + Math.random() * 3;
    this.target = this.homePos.clone();
    this.swatCooldown = 0;
    this.facing = Math.random() * Math.PI * 2;
    this.bob = Math.random() * Math.PI * 2;

    // feeding spots (world-space updated each frame): skin = bloody, cloth = safe
    this.spots = []; // {local: Vector3, type:'skin'|'cloth', world:Vector3, exposed:bool}

    this._build();
  }

  _build() {
    const skinMat = new THREE.MeshStandardMaterial({ color: this.skinColor, roughness: 0.7 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: this.shirtColor, roughness: 1.0 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: this.pantsColor, roughness: 1.0 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });

    const g = this.group;

    // legs
    const legGeo = new THREE.CylinderGeometry(0.18, 0.16, 1.6, 10);
    this.legL = new THREE.Mesh(legGeo, pantsMat); this.legL.position.set(-0.2, 0.8, 0); g.add(this.legL);
    this.legR = new THREE.Mesh(legGeo, pantsMat); this.legR.position.set(0.2, 0.8, 0); g.add(this.legR);
    this.legL.castShadow = this.legR.castShadow = true;

    // torso (shirt)
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.0, 6, 12), shirtMat);
    torso.position.set(0, 2.2, 0); torso.castShadow = true; g.add(torso);
    this.torso = torso;

    // arms (skin - forearm exposed)
    const upperArmGeo = new THREE.CylinderGeometry(0.13, 0.12, 0.7, 8);
    const foreArmGeo = new THREE.CylinderGeometry(0.11, 0.10, 0.7, 8);
    this.armL = new THREE.Group(); this.armR = new THREE.Group();
    const uaL = new THREE.Mesh(upperArmGeo, shirtMat); uaL.position.y = -0.35;
    const faL = new THREE.Mesh(foreArmGeo, skinMat); faL.position.y = -1.0;
    this.armL.add(uaL); this.armL.add(faL); this.armL.position.set(-0.55, 2.6, 0);
    const uaR = new THREE.Mesh(upperArmGeo, shirtMat); uaR.position.y = -0.35;
    const faR = new THREE.Mesh(foreArmGeo, skinMat); faR.position.y = -1.0;
    this.armR.add(uaR); this.armR.add(faR); this.armR.position.set(0.55, 2.6, 0);
    uaL.castShadow = faL.castShadow = uaR.castShadow = faR.castShadow = true;
    g.add(this.armL); g.add(this.armR);
    this.faL = faL; this.faR = faR;

    // hands
    const handGeo = new THREE.SphereGeometry(0.14, 8, 8);
    this.handL = new THREE.Mesh(handGeo, skinMat); this.handL.position.y = -1.45; this.armL.add(this.handL);
    this.handR = new THREE.Mesh(handGeo, skinMat); this.handR.position.y = -1.45; this.armR.add(this.handR);

    // neck + head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,0.25,8), skinMat); neck.position.set(0,2.9,0); g.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), skinMat);
    head.position.set(0, 3.35, 0); head.castShadow = true; g.add(head);
    this.head = head;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12, 0, Math.PI*2, 0, Math.PI*0.6), hairMat);
    hair.position.set(0, 3.45, 0); g.add(hair);
    // eyes
    const eyeMat = new THREE.MeshStandardMaterial({color:0x222222});
    const eL = new THREE.Mesh(new THREE.SphereGeometry(0.05,8,8), eyeMat); eL.position.set(-0.15,3.4,0.38); g.add(eL);
    const eR = new THREE.Mesh(new THREE.SphereGeometry(0.05,8,8), eyeMat); eR.position.set(0.15,3.4,0.38); g.add(eR);

    // ---- feeding/perch spots (local coords) ----
    this.spots = [
      { local: new THREE.Vector3(-0.55, 1.6, 0.0), type: 'skin', name: '左腕' },
      { local: new THREE.Vector3( 0.55, 1.6, 0.0), type: 'skin', name: '右腕' },
      { local: new THREE.Vector3( 0.0,  3.35, 0.35), type: 'skin', name: '顔' },
      { local: new THREE.Vector3(-0.18, 3.05, 0.3), type: 'skin', name: '首' },
      { local: new THREE.Vector3( 0.2, 0.6, 0.2), type: 'skin', name: '足首' },
      { local: new THREE.Vector3( 0.0, 2.2, 0.45), type: 'cloth', name: '胸元(服)' },
      { local: new THREE.Vector3( 0.0, 2.0, -0.45), type: 'cloth', name: '背中(服)' },
      { local: new THREE.Vector3(-0.3, 1.0, 0.0), type: 'cloth', name: 'ズボン' },
    ];
    for (const s of this.spots) { s.world = new THREE.Vector3(); s.fedAmount = 0; }
  }

  /** world-space head position (for proximity detection) */
  get headWorld() {
    return this.head.getWorldPosition(new THREE.Vector3());
  }

  /**
   * @param dt seconds
   * @param mosquito {pos, speed, isLanded, landedOn}
   * @param world bounds for wandering
   * @returns events {swatted:bool, swatPos:Vector3}
   */
  update(dt, mosquito, world) {
    this.swatCooldown = Math.max(0, this.swatCooldown - dt);
    this.bob += dt * (this.state === 'walk' ? 8 : 2);

    // update spot world positions
    for (const s of this.spots) {
      s.world.copy(s.local).applyEuler(new THREE.Euler(0, this.facing, 0)).add(this.group.position);
    }

    const mq = mosquito.pos;
    const headW = this.headWorld;
    const dist = mq.distanceTo(this.group.position.clone().setY(2));

    // ---------- Awareness build-up ----------
    // Factors: proximity, mosquito speed (wing noise), whether feeding on this human.
    let detect = 0;
    if (dist < 7) {
      const prox = (7 - dist) / 7;                  // 0..1
      const noise = Math.min(1, mosquito.speed / 6); // faster = louder
      detect = (prox * 0.6 + prox * noise * 1.2) * this.alertness;
      // if mosquito is biting THIS human, strong detection ramp
      if (mosquito.feedingOn === this) detect += 0.8 * this.alertness;
      // landing still & quiet reduces detection
      if (mosquito.isLanded && mosquito.feedingOn !== this) detect *= 0.25;
    }
    this.awareness += detect * dt * 22;
    // decay when not detecting
    this.awareness -= dt * 9;
    this.awareness = THREE.MathUtils.clamp(this.awareness, 0, 100);

    // ---------- Itch from bites ----------
    this.itch = Math.max(0, this.itch - dt * 3);

    let event = { swatted: false };

    // ---------- State machine ----------
    this.stateTimer -= dt;

    if (this.state === 'swat') {
      // animate swat (handled in animateSwat); end after timer
      if (this.stateTimer <= 0) { this.state = 'idle'; this.stateTimer = 1 + Math.random()*2; this._resetArms(); }
    } else if (this.state === 'scratch') {
      if (this.stateTimer <= 0) { this.state = 'idle'; this.stateTimer = 1 + Math.random()*2; this._resetArms(); }
    } else {
      // decide to swat if aware enough and mosquito close
      const willSwat = (this.awareness > 55 || this.itch > 50) && dist < 3.2 && this.swatCooldown <= 0;
      if (willSwat) {
        this.state = 'swat';
        this.stateTimer = 0.55;
        this.swatCooldown = 1.6 + Math.random()*1.0;
        this._swatTarget = mq.clone();
        // success chance: higher awareness & lower mosquito speed (slow target easier... actually faster harder)
        const base = 0.35 + this.awareness/250;
        const evasion = Math.min(0.5, mosquito.speed/14);
        this._swatHitChance = THREE.MathUtils.clamp(base - evasion + (mosquito.isLanded?0.35:0), 0.08, 0.95);
        event.swat = true;
        event.swatPos = mq.clone();
        event.hitChance = this._swatHitChance;
      } else if (this.itch > 25 && Math.random() < dt*0.5) {
        this.state = 'scratch';
        this.stateTimer = 0.8;
      } else {
        // wander
        if (this.stateTimer <= 0) {
          if (this.state === 'walk') { this.state = 'idle'; this.stateTimer = 1.5 + Math.random()*3; }
          else {
            this.state = 'walk'; this.stateTimer = 2 + Math.random()*3;
            const a = Math.random()*Math.PI*2;
            const r = Math.random()*this.wanderRadius;
            this.target.set(
              this.homePos.x + Math.cos(a)*r,
              0,
              this.homePos.z + Math.sin(a)*r
            );
          }
        }
        if (this.state === 'walk') {
          const dir = this.target.clone().sub(this.group.position).setY(0);
          const d = dir.length();
          if (d < 0.3) { this.state='idle'; this.stateTimer = 1+Math.random()*2; }
          else {
            dir.normalize();
            this.group.position.addScaledVector(dir, this.speed * dt);
            this.facing = Math.atan2(dir.x, dir.z);
          }
        }
      }
    }

    this.group.rotation.y = this.facing;
    this._animate(dt);

    return event;
  }

  bite(amount, spot) {
    this.itch += amount * 9;
    if (spot) spot.fedAmount += amount;
    // biting also raises awareness slightly
    this.awareness += amount * 4;
  }

  _resetArms() {
    this.armL.rotation.set(0,0,0);
    this.armR.rotation.set(0,0,0);
  }

  _animate(dt) {
    // idle breathing / walk leg swing
    if (this.state === 'walk') {
      this.legL.rotation.x = Math.sin(this.bob)*0.6;
      this.legR.rotation.x = -Math.sin(this.bob)*0.6;
      this.armL.rotation.x = -Math.sin(this.bob)*0.4;
      this.armR.rotation.x = Math.sin(this.bob)*0.4;
    } else if (this.state === 'swat') {
      // raise the nearest arm and slap toward target
      const p = 1 - (this.stateTimer / 0.55);
      const swing = Math.sin(p * Math.PI);
      // pick arm based on swat side
      const local = this._swatTarget ? this._swatTarget.clone().sub(this.group.position) : new THREE.Vector3();
      if (local.x < 0) { this.armL.rotation.z = swing*1.6; this.armL.rotation.x = -swing*1.2; }
      else { this.armR.rotation.z = -swing*1.6; this.armR.rotation.x = -swing*1.2; }
    } else if (this.state === 'scratch') {
      const p = Math.sin(this.stateTimer * 18);
      this.armR.rotation.x = -1.0 + p*0.2;
      this.armR.rotation.z = -0.5;
    } else {
      // idle: gentle breathing bob
      this.torso.position.y = 2.2 + Math.sin(this.bob)*0.02;
      this.legL.rotation.x *= 0.85; this.legR.rotation.x *= 0.85;
      this.armL.rotation.x *= 0.85; this.armR.rotation.x *= 0.85;
      this.armL.rotation.z *= 0.85; this.armR.rotation.z *= 0.85;
    }
  }
}
