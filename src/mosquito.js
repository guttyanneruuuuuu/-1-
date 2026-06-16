import * as THREE from 'three';

/**
 * The player mosquito. Handles its 3D model, flight physics (velocity-based,
 * with up/down, dash, wing animation) and landing/feeding state.
 */
export class Mosquito {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.set(0, 4, 8);
    scene.add(this.group);

    this.pos = this.group.position;          // alias
    this.velocity = new THREE.Vector3();
    this.heading = 0;                         // yaw in radians (facing direction)
    this.pitch = 0;                           // visual pitch

    this.speed = 0;                           // current scalar speed (for noise calc)
    this.isLanded = false;
    this.landedOn = null;                     // {type, mesh, normal} or human spot
    this.feedingOn = null;                    // Human currently being fed on
    this.feedingSpot = null;

    this.wingPhase = 0;
    this._build();
  }

  _build() {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.5, metalness: 0.2 });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0xcfe4ff, roughness: 0.2, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const redMat = new THREE.MeshStandardMaterial({ color: 0x7a1020, roughness: 0.4 });

    const g = this.group;
    g.scale.setScalar(0.5);

    // thorax
    const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), bodyMat);
    g.add(thorax);
    // abdomen (this one fills red as it feeds)
    this.abdomen = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.4, 6, 12), bodyMat);
    this.abdomen.position.set(0, 0, -0.32);
    this.abdomen.rotation.x = Math.PI/2;
    g.add(this.abdomen);
    this.bellyMat = redMat;
    // head + proboscis
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), bodyMat);
    head.position.set(0, 0.02, 0.2); g.add(head);
    const prob = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6), bodyMat);
    prob.position.set(0, 0, 0.42); prob.rotation.x = Math.PI/2; g.add(prob);
    // eyes
    const eyeMat = new THREE.MeshStandardMaterial({color:0x551122, roughness:0.3});
    const eL = new THREE.Mesh(new THREE.SphereGeometry(0.05,8,8), eyeMat); eL.position.set(-0.07,0.05,0.22); g.add(eL);
    const eR = new THREE.Mesh(new THREE.SphereGeometry(0.05,8,8), eyeMat); eR.position.set(0.07,0.05,0.22); g.add(eR);

    // wings
    const wingGeo = new THREE.PlaneGeometry(0.5, 0.22);
    this.wingL = new THREE.Mesh(wingGeo, wingMat);
    this.wingL.position.set(-0.05, 0.12, -0.05);
    this.wingR = new THREE.Mesh(wingGeo, wingMat);
    this.wingR.position.set(0.05, 0.12, -0.05);
    g.add(this.wingL); g.add(this.wingR);

    // legs (just thin cylinders dangling)
    const legMat = new THREE.MeshStandardMaterial({color:0x1a1a1f});
    for (let i=0;i<6;i++){
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,0.4,4), legMat);
      const side = i<3 ? -1 : 1;
      leg.position.set(side*0.1, -0.08, (i%3-1)*0.12);
      leg.rotation.z = side*0.6; leg.rotation.x = 0.4;
      g.add(leg);
    }
  }

  /** Update wing animation + body color based on feeding fullness 0..1 */
  updateVisual(dt, fullness) {
    // wing flap speed scales with motion
    const flapSpeed = this.isLanded ? 0 : (35 + this.speed * 8);
    this.wingPhase += dt * flapSpeed;
    const flap = Math.sin(this.wingPhase) * 0.9;
    this.wingL.rotation.z = 0.3 + flap;
    this.wingR.rotation.z = -0.3 - flap;

    // belly redness
    const c = new THREE.Color(0x2b2b33).lerp(new THREE.Color(0x9c1a2e), fullness);
    this.abdomen.material.color.copy(c);
    // fat abdomen when full
    const s = 1 + fullness * 0.8;
    this.abdomen.scale.set(s, 1 + fullness*0.4, s);

    // orient model to heading + pitch + slight bank
    this.group.rotation.set(0, this.heading, 0);
    this.group.rotateX(this.pitch * 0.5);
  }

  /** kill / hide */
  setVisible(v) { this.group.visible = v; }
}
