import * as THREE from 'three';

/**
 * A house cat that mostly lounges, but if the mosquito flies low and close,
 * it perks up and pounces — an instant kill if it connects. Adds a second
 * predator threat distinct from the swatting humans.
 */
export class Cat {
  constructor(scene, pos) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    scene.add(this.group);

    this.state = 'sleep';      // sleep | alert | pounce | recover
    this.timer = 3 + Math.random()*4;
    this.pounceCooldown = 0;
    this.facing = Math.random()*Math.PI*2;
    this.alertLevel = 0;
    this._build();
  }

  _build() {
    const furMat = new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.9 });
    const furMat2 = new THREE.MeshStandardMaterial({ color: 0x2c2c33, roughness: 0.9 });
    const g = this.group;
    g.scale.setScalar(0.9);

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.0, 6, 12), furMat);
    body.rotation.z = Math.PI/2; body.position.set(0, 0.5, 0); body.castShadow = true;
    g.add(body); this.body = body;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 14), furMat);
    head.position.set(0.75, 0.7, 0); head.castShadow = true; g.add(head); this.head = head;
    // ears
    const earGeo = new THREE.ConeGeometry(0.14, 0.3, 4);
    const e1 = new THREE.Mesh(earGeo, furMat2); e1.position.set(0.8, 1.0, 0.18); g.add(e1);
    const e2 = new THREE.Mesh(earGeo, furMat2); e2.position.set(0.8, 1.0, -0.18); g.add(e2);
    // eyes
    const eyeMat = new THREE.MeshStandardMaterial({color:0x8aff5a, emissive:0x224400, emissiveIntensity:0.4});
    this.eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06,8,8), eyeMat); this.eyeL.position.set(1.05,0.75,0.13); g.add(this.eyeL);
    this.eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.06,8,8), eyeMat); this.eyeR.position.set(1.05,0.75,-0.13); g.add(this.eyeR);
    // tail
    this.tail = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.04,1.2,6), furMat);
    this.tail.position.set(-0.7, 0.6, 0); this.tail.rotation.z = -0.6; g.add(this.tail);
    // legs (simple)
    const legGeo = new THREE.CylinderGeometry(0.1,0.09,0.5,6);
    for (const [x,z] of [[0.5,0.25],[0.5,-0.25],[-0.45,0.25],[-0.45,-0.25]]) {
      const leg = new THREE.Mesh(legGeo, furMat); leg.position.set(x,0.25,z); g.add(leg);
    }
  }

  get headWorld() { return this.head.getWorldPosition(new THREE.Vector3()); }

  /**
   * @returns {pounced:bool, hit:bool}
   */
  update(dt, mosquito) {
    this.pounceCooldown = Math.max(0, this.pounceCooldown - dt);
    this.timer -= dt;
    const mq = mosquito.pos;
    const headW = this.headWorld;
    const dist = mq.distanceTo(this.group.position.clone().setY(0.7));
    const lowEnough = mq.y < 2.6;

    let result = { pounced: false, hit: false };

    // tail flick / idle anim
    this.tail.rotation.z = -0.6 + Math.sin(performance.now()*0.003)*0.2;

    if (this.state === 'pounce') {
      const p = 1 - this.timer / 0.4;
      this.group.position.y = Math.sin(p*Math.PI) * 1.2;
      if (this.timer <= 0) { this.state = 'recover'; this.timer = 1.2; this.group.position.y = 0; }
    } else if (this.state === 'recover') {
      if (this.timer <= 0) { this.state = 'sleep'; this.timer = 2+Math.random()*3; this.alertLevel = 0; }
    } else if (this.state === 'alert') {
      // track mosquito
      const dir = mq.clone().sub(this.group.position).setY(0).normalize();
      this.facing = Math.atan2(dir.z, dir.x);
      this.alertLevel = Math.min(1, this.alertLevel + dt);
      this.eyeL.scale.setScalar(1.4); this.eyeR.scale.setScalar(1.4);
      if (dist < 3 && lowEnough && this.pounceCooldown <= 0) {
        // pounce!
        this.state = 'pounce'; this.timer = 0.4; this.pounceCooldown = 3;
        result.pounced = true;
        const hitChance = THREE.MathUtils.clamp(0.55 - mosquito.speed/16 + (mosquito.isLanded?0.3:0), 0.12, 0.9);
        result.hit = Math.random() < hitChance;
      }
      if (dist > 6) { this.state = 'sleep'; this.timer = 2; this.alertLevel = 0; this.eyeL.scale.setScalar(1); this.eyeR.scale.setScalar(1); }
    } else { // sleep
      this.eyeL.scale.setScalar(0.6); this.eyeR.scale.setScalar(0.6);
      // wake up if mosquito near & low
      if (dist < 5 && lowEnough && mosquito.speed > 1) {
        this.state = 'alert'; this.timer = 4;
      }
    }

    this.group.rotation.y = -this.facing + Math.PI/2;
    return result;
  }
}
