import * as THREE from 'three';

/**
 * Environmental hazards:
 *  - MosquitoCoil: emits an expanding smoke zone that damages HP & raises panic.
 *  - Periodically a human may "spray" insecticide creating a temporary toxic cloud.
 */
export class MosquitoCoil {
  constructor(scene, pos) {
    this.scene = scene;
    this.pos = pos.clone();
    this.radius = 3.5;
    this.active = true;
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    scene.add(this.group);
    this._build();
    this._t = 0;
  }
  _build() {
    // dish + spiral coil
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.45,0.08,16), new THREE.MeshStandardMaterial({color:0x2b6b3b, roughness:0.6}));
    dish.position.y = 0.04; this.group.add(dish);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 8, 24), new THREE.MeshStandardMaterial({color:0x6b4226, roughness:0.9}));
    coil.rotation.x = Math.PI/2; coil.position.y = 0.1; this.group.add(coil);
    // glowing tip
    this.tip = new THREE.Mesh(new THREE.SphereGeometry(0.04,8,8), new THREE.MeshStandardMaterial({color:0xff6622, emissive:0xff4400, emissiveIntensity:1.5}));
    this.tip.position.set(0.22, 0.12, 0); this.group.add(this.tip);

    // smoke particle sprites
    this.smoke = [];
    const smokeMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.0, depthWrite: false });
    for (let i=0;i<14;i++){
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.8,0.8), smokeMat.clone());
      s.position.set((Math.random()-0.5), Math.random()*2.5, (Math.random()-0.5));
      s.userData.speed = 0.3 + Math.random()*0.4;
      s.userData.seed = Math.random()*Math.PI*2;
      this.group.add(s); this.smoke.push(s);
    }
  }
  update(dt, camera) {
    if (!this.active) return 0;
    this._t += dt;
    this.tip.material.emissiveIntensity = 1.2 + Math.sin(this._t*8)*0.4;
    for (const s of this.smoke) {
      s.position.y += s.userData.speed * dt;
      s.position.x += Math.sin(this._t + s.userData.seed)*dt*0.3;
      if (s.position.y > 3.2) { s.position.y = 0.1; }
      const fade = THREE.MathUtils.clamp(1 - s.position.y/3.2, 0, 1);
      s.material.opacity = fade * 0.35;
      if (camera) s.lookAt(camera.position);
    }
    return 0;
  }
  /** damage per second if mosquito within smoke radius (more near center) */
  damageAt(p) {
    if (!this.active) return 0;
    const d = p.distanceTo(this.pos);
    if (d > this.radius) return 0;
    return (1 - d/this.radius) * 12; // up to 12 hp/s at center
  }
}


/**
 * Mission/objective manager. Tracks goals; completing all = bonus & escalates.
 */
export class MissionManager {
  constructor() { this.reset(); }
  reset() {
    this.wave = 1;
    this.missions = this._makeWave(1);
    this.completedAll = false;
  }
  _makeWave(w) {
    const pool = [
      { id:'bite', label:(t)=>`吸血する (${'{n}'}/${t})`, target: 2 + w, key:'bites' },
      { id:'survive', label:(t)=>`${t}秒 生き延びる`, target: 25 + w*10, key:'survival', timeBased:true },
      { id:'feed', label:(t)=>`満腹ゲージMAXにする`, target: 1, key:'maxedBlood' },
    ];
    if (w >= 2) pool.push({ id:'egg', label:()=>`産卵する`, target:1, key:'eggs' });
    if (w >= 3) pool.push({ id:'hide', label:(t)=>`${t}回 服/物陰に隠れる`, target:3, key:'hides' });
    // pick up to 3
    const chosen = pool.slice(0, Math.min(3, 2 + Math.floor(w/2)));
    return chosen.map(m => ({ ...m, done: false, baseTarget: m.target }));
  }
  /** @param stats {bites, survival, eggs, hides, maxedBlood} */
  update(stats) {
    let allDone = true;
    let justCompleted = null;
    for (const m of this.missions) {
      if (m.done) continue;
      const v = stats[m.key] || 0;
      if (v >= m.target) { m.done = true; justCompleted = m; }
      else allDone = false;
    }
    let waveCleared = false;
    if (allDone && !this.completedAll) {
      waveCleared = true;
      this.wave++;
      this.missions = this._makeWave(this.wave);
    }
    return { justCompleted, waveCleared, wave: this.wave };
  }
  describe(stats) {
    return this.missions.map(m => {
      const v = Math.min(stats[m.key]||0, m.target);
      let label = m.label(m.target);
      label = label.replace('{n}', Math.floor(v));
      return { label, done: m.done };
    });
  }
}
