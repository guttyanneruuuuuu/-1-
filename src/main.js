import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Human } from './human.js';
import { Mosquito } from './mosquito.js';
import { InputManager } from './input.js';
import { AudioManager } from './audio.js';
import { UI } from './ui.js';
import { Cat } from './cat.js';
import { MosquitoCoil, MissionManager } from './hazards.js';

// ===================== Constants =====================
const CFG = {
  MAX_BLOOD: 100,
  MAX_STAMINA: 100,
  MAX_HEALTH: 100,
  BLOOD_DRAIN: 0.55,       // hunger drains per second
  STAMINA_DRAIN_FLY: 4.5,  // per second while flying
  STAMINA_DRAIN_BOOST: 16,
  STAMINA_REGEN: 14,       // per second while resting
  FEED_RATE: 26,           // blood gained per second while feeding
  BASE_ACCEL: 9,
  MAX_SPEED: 5.2,
  BOOST_SPEED: 9.5,
  VERT_SPEED: 3.4,
  DAMP: 0.86,
  EGG_COST: 60,            // blood needed to lay eggs
};

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 200);

    this.input = new InputManager(this.canvas);
    this.audio = new AudioManager();
    this.ui = new UI();

    this.state = 'title';  // title | playing | gameover
    this.clock = new THREE.Clock();

    this.world = buildWorld(this.scene);
    this.mosquito = new Mosquito(this.scene);
    this.humans = [];
    this._spawnHumans();

    // predator + hazards + missions
    this.cat = new Cat(this.scene, new THREE.Vector3(-7, 0, 4));
    this.coil = new MosquitoCoil(this.scene, new THREE.Vector3(5, 0, -5));
    this.missions = new MissionManager();
    this.minimap = document.getElementById('minimap');
    this.minimapCtx = this.minimap.getContext('2d');

    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._initUIEvents();
    this._checkOrientation();
    window.addEventListener('orientationchange', () => setTimeout(()=>this._checkOrientation(), 200));

    document.getElementById('loading-screen').classList.add('hidden');
    this.ui.setHighScore(this._loadHighScore());

    // camera follow params
    this.camYaw = 0; this.camPitch = -0.15;
    this.camDist = 1.8;

    this.animate();
  }

  _spawnHumans() {
    // Human on sofa
    this.humans.push(new Human(this.scene, {
      pos: new THREE.Vector3(-7, 0, 5.5),
      skinColor: 0xf0c8a0, shirtColor: 0x8e3b4f, pantsColor: 0x2c3e50,
      wanderRadius: 2.2, speed: 0.8, alertness: 0.9
    }));
    // Human wandering near dining/kitchen
    this.humans.push(new Human(this.scene, {
      pos: new THREE.Vector3(6, 0, -3),
      skinColor: 0xd8a87a, shirtColor: 0x3b6e8c, pantsColor: 0x444a3a,
      wanderRadius: 5, speed: 1.3, alertness: 1.25
    }));
    // Human near bookshelf
    this.humans.push(new Human(this.scene, {
      pos: new THREE.Vector3(3, 0, 7),
      skinColor: 0xe8b890, shirtColor: 0x556b2f, pantsColor: 0x333344,
      wanderRadius: 4, speed: 1.0, alertness: 1.05
    }));
  }

  // ===================== Game lifecycle =====================
  startGame() {
    this.audio.init();
    this.audio.resume();
    this.state = 'playing';
    this.input.setGameActive(true);

    // reset stats
    this.blood = 55;
    this.stamina = CFG.MAX_STAMINA;
    this.health = CFG.MAX_HEALTH;
    this.score = 0;
    this.bites = 0;
    this.eggs = 0;
    this.hides = 0;
    this.maxedBlood = 0;
    this.survival = 0;
    this.danger = 0;
    this.dayTime = 0;          // 0..1 night->day cycle progress

    this.missions.reset();
    this.coil.active = true;
    this._sprayTimer = 18 + Math.random()*12;
    this.spray = null;

    // reset mosquito
    const mq = this.mosquito;
    mq.group.position.set(0, 4.5, 8);
    mq.velocity.set(0,0,0);
    mq.heading = Math.PI; mq.pitch = 0;
    mq.isLanded = false; mq.landedOn = null; mq.feedingOn = null; mq.feedingSpot = null;
    mq.setVisible(true);
    this.camYaw = Math.PI; this.camPitch = -0.1;

    // reset humans awareness
    for (const h of this.humans) { h.awareness = 0; h.itch = 0; h.state='idle'; }
    // reset cat
    this.cat.state = 'sleep'; this.cat.timer = 3; this.cat.group.position.set(-7,0,4);
    this._refreshMissions();

    this.ui.showTitle(false);
    this.ui.showHowto(false);
    this.ui.showGameOver(false);
    this.ui.showHUD(true);
    this.ui.showTouch(this.input.isTouch);
    this.ui.toast('生き延びろ！人に近づいて吸血だ', 2600);
  }

  gameOver(reason, title) {
    if (this.state !== 'playing') return;
    this.state = 'gameover';
    this.input.setGameActive(false);
    document.exitPointerLock?.();
    this.audio.death();
    this.audio.updateBuzz(0, true);

    const hs = this._loadHighScore();
    const isNew = this.score > hs;
    if (isNew) this._saveHighScore(this.score);

    this.ui.showHUD(false);
    this.ui.showTouch(false);
    this.ui.showGameOver(true, {
      title, reason,
      score: Math.floor(this.score),
      bites: this.bites,
      time: Math.floor(this.survival),
      eggs: this.eggs,
      isNewHigh: isNew,
      highScore: Math.max(hs, this.score)
    });
  }

  // ===================== Main loop =====================
  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.state === 'playing') {
      this.update(dt);
    } else if (this.state === 'title') {
      // idle camera drift on title
      this._idleCamera(dt);
    }
    // on gameover: freeze scene, keep last camera
    this.renderer.render(this.scene, this.camera);
  }

  _idleCamera(dt) {
    this._idleT = (this._idleT || 0) + dt * 0.2;
    const r = 11;
    this.camera.position.set(Math.cos(this._idleT)*r, 5 + Math.sin(this._idleT*0.5)*1.5, Math.sin(this._idleT)*r);
    this.camera.lookAt(0, 3, 0);
    for (const h of this.humans) h.update(dt, { pos: new THREE.Vector3(0,99,0), speed:0, isLanded:true, feedingOn:null }, this.world);
    this.cat.update(dt, { pos: new THREE.Vector3(0,99,0), speed:0, isLanded:true });
    this.coil.update(dt, this.camera);
  }

  update(dt) {
    const ctrl = this.input.sample();
    const mq = this.mosquito;

    // ---------- Camera look ----------
    const lookSens = this.input.pointerLocked ? 0.0022 : 0.006;
    this.camYaw -= ctrl.look.dx * lookSens;
    this.camPitch -= ctrl.look.dy * lookSens;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch, -1.2, 1.0);

    // ---------- Movement ----------
    if (mq.isLanded) {
      this._updateLanded(dt, ctrl, mq);
    } else {
      this._updateFlying(dt, ctrl, mq);
    }

    // ---------- Hunger ----------
    this.blood -= CFG.BLOOD_DRAIN * dt;
    if (this.blood <= 0) {
      this.blood = 0;
      this.gameOver('お腹が空いて力尽きてしまった…', '☠️ 餓死');
      return;
    }

    // ---------- Humans + danger ----------
    let maxAware = 0;
    let beingSwatted = null;
    for (const h of this.humans) {
      const ev = h.update(dt, {
        pos: mq.group.position,
        speed: mq.speed,
        isLanded: mq.isLanded,
        feedingOn: mq.feedingOn
      }, this.world);
      maxAware = Math.max(maxAware, h.awareness);
      if (ev.swat) {
        this.audio.slap();
        this.ui.alert('バシッ！');
        if (Math.random() < ev.hitChance) beingSwatted = h;
        else {
          this.ui.toast('間一髪！避けた！', 1200);
          // getting swatted at scares mosquito off if landed
          if (mq.isLanded) this._takeOff(mq);
        }
      }
    }
    this.danger = maxAware;

    // bright zone increases perceived danger
    for (const bz of this.world.brightZones) {
      if (mq.group.position.distanceTo(bz.pos) < bz.radius) {
        this.danger = Math.min(100, this.danger + 8);
      }
    }

    if (beingSwatted) {
      this.ui.flashDamage(1.0);
      this.health -= 100; // a clean hit is lethal
      if (this.health <= 0) {
        this.gameOver('人間に気づかれて叩き潰された…', '☠️ 叩き潰された！');
        return;
      }
    }

    // ---------- Cat predator ----------
    const catRes = this.cat.update(dt, {
      pos: mq.group.position, speed: mq.speed, isLanded: mq.isLanded
    });
    if (catRes.pounced) {
      this.audio.slap();
      this.ui.alert('🐱 ネコの猫パンチ！');
      if (catRes.hit) {
        this.health = 0;
        this.gameOver('ネコに猫パンチで叩き落とされた…', '🐱 ネコに捕まった！');
        return;
      } else {
        this.ui.toast('ネコをかわした！', 1200);
        if (mq.isLanded) this._takeOff(mq);
      }
    }
    if (this.cat.state === 'alert') this.danger = Math.min(100, this.danger + 12);

    // ---------- Mosquito coil + insecticide spray (HP hazards) ----------
    this.coil.update(dt, this.camera);
    let hazardDmg = this.coil.damageAt(mq.group.position);
    // periodic spray event
    this._sprayTimer -= dt;
    if (this._sprayTimer <= 0 && !this.spray) {
      // a wandering human sprays toward the mosquito's area
      const src = this._nearestHuman(mq.group.position);
      if (src && src.awareness > 20) {
        this.spray = { pos: mq.group.position.clone(), radius: 3.2, life: 5 };
        this.audio.alert();
        this.ui.toast('💨 殺虫剤スプレー！その場から逃げろ！', 2200);
        this._sprayTimer = 16 + Math.random()*12;
      } else {
        this._sprayTimer = 5;
      }
    }
    if (this.spray) {
      this.spray.life -= dt;
      const d = mq.group.position.distanceTo(this.spray.pos);
      if (d < this.spray.radius) hazardDmg += (1 - d/this.spray.radius) * 18;
      if (this.spray.life <= 0) this.spray = null;
    }
    if (hazardDmg > 0) {
      this.health -= hazardDmg * dt;
      this.ui.alert('☠️ 煙が苦しい！');
      this.ui.flashDamage(0.4);
      this.danger = Math.min(100, this.danger + 20);
      if (this.health <= 0) {
        this.gameOver('煙にやられて力尽きた…', '☠️ 煙に巻かれた');
        return;
      }
    }

    // ---------- Day/night cycle (raises difficulty over time) ----------
    this.dayTime = Math.min(1, this.survival / 180); // fully "day" after 3 min
    this._applyDayNight();

    if (this.danger > 50) {
      this.ui.alert(this.danger > 80 ? '⚠️ 超危険！逃げろ！' : '⚠️ 警戒されてる！');
    } else if (hazardDmg <= 0 && this.cat.state !== 'alert') {
      this.ui.alert(null);
    }

    // ---------- Missions ----------
    const mres = this.missions.update({
      bites: this.bites, survival: this.survival, eggs: this.eggs,
      hides: this.hides, maxedBlood: this.maxedBlood
    });
    if (mres.justCompleted) {
      this.score += 100;
      this.audio.egg();
      this.ui.toast('✅ ミッション達成！ +100', 1500);
      this._refreshMissions();
    }
    if (mres.waveCleared) {
      this.score += 300;
      this.audio.feed();
      this.ui.toast(`🌊 WAVE ${mres.wave} 突入！ +300 (難易度UP)`, 2400);
      this._escalate(mres.wave);
      this._refreshMissions();
    }

    // ---------- Feeding ----------
    if (mq.feedingOn && mq.feedingSpot) {
      this._feed(dt, mq);
    }
    if (this.blood >= CFG.MAX_BLOOD) this.maxedBlood = 1;
    this.ui.feedActive(!!(mq.feedingOn && mq.feedingSpot));

    // ---------- Visuals ----------
    const fullness = this.blood / CFG.MAX_BLOOD;
    mq.updateVisual(dt, fullness);
    this._updateCamera(dt, mq);

    // ---------- Audio ----------
    const speed01 = Math.min(1, mq.speed / CFG.BOOST_SPEED);
    this.audio.updateBuzz(speed01, mq.isLanded);

    // ---------- Survival & HUD ----------
    this.survival += dt;
    this.score += dt * (1 + this.bites * 0.1); // passive survival score
    this._updateContextHint(mq);
    this.ui.updateHUD({
      blood: this.blood, maxBlood: CFG.MAX_BLOOD,
      stamina: this.stamina, maxStamina: CFG.MAX_STAMINA,
      health: this.health, maxHealth: CFG.MAX_HEALTH,
      score: Math.floor(this.score),
      danger: this.danger
    });
    this.ui.setVignetteDanger(this.danger > 60 || hazardDmg > 0);
    this.ui.setTimeOfDay(this.dayTime);
    this._drawMinimap();
  }

  _nearestHuman(p) {
    let best = null, bd = Infinity;
    for (const h of this.humans) {
      const d = p.distanceTo(h.group.position);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  _applyDayNight() {
    // brighten ambient & make humans more alert as it becomes "day"
    const t = this.dayTime;
    const bg = new THREE.Color(0x0c0e1a).lerp(new THREE.Color(0x2a3050), t);
    this.scene.background.copy(bg);
    if (this.scene.fog) this.scene.fog.color.copy(bg);
  }

  _escalate(wave) {
    // ramp human alertness & speed each wave
    for (const h of this.humans) {
      h.alertness += 0.18;
      h.speed += 0.12;
    }
    // spray events more frequent
    this._sprayTimer = Math.max(6, this._sprayTimer - 2);
  }

  _refreshMissions() {
    const list = this.missions.describe({
      bites: this.bites, survival: this.survival, eggs: this.eggs,
      hides: this.hides, maxedBlood: this.maxedBlood
    });
    this.ui.setMissions(list, this.missions.wave);
  }

  _drawMinimap() {
    const ctx = this.minimapCtx;
    const W = this.minimap.width, H = this.minimap.height;
    const R = this.world.ROOM;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = 'rgba(20,24,40,0.6)';
    ctx.fillRect(0,0,W,H);
    const toX = (x) => (x + R.w/2) / R.w * W;
    const toY = (z) => (z + R.d/2) / R.d * H;
    // humans
    for (const h of this.humans) {
      ctx.fillStyle = h.awareness > 50 ? '#ff5570' : '#ffd166';
      ctx.beginPath(); ctx.arc(toX(h.group.position.x), toY(h.group.position.z), 4, 0, Math.PI*2); ctx.fill();
    }
    // cat
    ctx.fillStyle = this.cat.state==='alert' ? '#ff8f1f' : '#9aa0b8';
    ctx.beginPath(); ctx.arc(toX(this.cat.group.position.x), toY(this.cat.group.position.z), 4, 0, Math.PI*2); ctx.fill();
    // coil hazard
    if (this.coil.active) {
      ctx.strokeStyle = 'rgba(255,120,80,0.5)';
      ctx.beginPath(); ctx.arc(toX(this.coil.pos.x), toY(this.coil.pos.z), this.coil.radius/R.w*W, 0, Math.PI*2); ctx.stroke();
    }
    // mosquito (player)
    const mp = this.mosquito.group.position;
    ctx.fillStyle = '#74e0ff';
    ctx.beginPath(); ctx.arc(toX(mp.x), toY(mp.z), 5, 0, Math.PI*2); ctx.fill();
    // heading triangle
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(toX(mp.x), toY(mp.z));
    ctx.lineTo(toX(mp.x)+Math.sin(this.camYaw)*9, toY(mp.z)+Math.cos(this.camYaw)*9);
    ctx.stroke();
  }

  _updateFlying(dt, ctrl, mq) {
    // camera-relative movement
    const forward = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);

    const wish = new THREE.Vector3();
    wish.addScaledVector(forward, ctrl.move.z);
    wish.addScaledVector(right, ctrl.move.x);
    if (wish.lengthSq() > 1) wish.normalize();

    const wantBoost = ctrl.boost && this.stamina > 0 && wish.lengthSq() > 0.01;
    const maxSpeed = wantBoost ? CFG.BOOST_SPEED : CFG.MAX_SPEED;
    const accel = CFG.BASE_ACCEL * (wantBoost ? 1.7 : 1);

    mq.velocity.addScaledVector(wish, accel * dt);
    // vertical
    mq.velocity.y += ctrl.vertical * CFG.VERT_SPEED * dt * 4;

    // damping
    mq.velocity.multiplyScalar(Math.pow(CFG.DAMP, dt * 60));
    // clamp horizontal speed
    const horiz = new THREE.Vector3(mq.velocity.x, 0, mq.velocity.z);
    if (horiz.length() > maxSpeed) { horiz.setLength(maxSpeed); mq.velocity.x = horiz.x; mq.velocity.z = horiz.z; }
    mq.velocity.y = THREE.MathUtils.clamp(mq.velocity.y, -CFG.VERT_SPEED, CFG.VERT_SPEED);

    // proposed move + collision
    const next = mq.group.position.clone().addScaledVector(mq.velocity, dt);
    this._collide(mq.group.position, next, mq.velocity);
    // clamp to bounds
    next.x = THREE.MathUtils.clamp(next.x, this.world.bounds.min.x, this.world.bounds.max.x);
    next.y = THREE.MathUtils.clamp(next.y, this.world.bounds.min.y, this.world.bounds.max.y);
    next.z = THREE.MathUtils.clamp(next.z, this.world.bounds.min.z, this.world.bounds.max.z);
    mq.group.position.copy(next);

    mq.speed = mq.velocity.length();
    // heading follows velocity (so the body points where it flies)
    if (horiz.length() > 0.3) mq.heading = Math.atan2(mq.velocity.x, mq.velocity.z);
    else mq.heading = THREE.MathUtils.lerp(mq.heading, this.camYaw, 0.1);
    mq.pitch = THREE.MathUtils.clamp(-mq.velocity.y * 0.2, -0.6, 0.6);

    // stamina
    const drain = wantBoost ? CFG.STAMINA_DRAIN_BOOST : CFG.STAMINA_DRAIN_FLY;
    this.stamina -= drain * dt;
    if (this.stamina <= 0) {
      this.stamina = 0;
      // exhausted: forced slow + can't boost; lose a tiny bit of control
      mq.velocity.multiplyScalar(0.96);
    }

    // action while flying = try to land/feed on nearest spot
    if (ctrl.actionPressed) this._tryLand(mq);
  }

  _updateLanded(dt, ctrl, mq) {
    // stick to the surface; recover stamina; awareness decays handled in humans
    this.stamina = Math.min(CFG.MAX_STAMINA, this.stamina + CFG.STAMINA_REGEN * dt);
    mq.speed = 0;
    mq.velocity.set(0,0,0);

    // keep position glued to spot/human (human may move)
    if (mq.feedingOn && mq.feedingSpot) {
      mq.group.position.copy(mq.feedingSpot.world);
      mq.group.position.y += 0.05;
    }

    // take off
    if (ctrl.actionPressed || (ctrl.move.x || ctrl.move.z || ctrl.vertical > 0)) {
      this._takeOff(mq);
    }
  }

  _tryLand(mq) {
    const p = mq.group.position;
    // 1) Look for a human feeding/perch spot within reach
    let best = null, bestD = 0.9;
    for (const h of this.humans) {
      for (const s of h.spots) {
        const d = p.distanceTo(s.world);
        if (d < bestD) { bestD = d; best = { human: h, spot: s }; }
      }
    }
    if (best) {
      mq.isLanded = true;
      mq.feedingOn = best.spot.type === 'skin' ? best.human : null;
      mq.feedingSpot = best.spot;
      mq.landedOn = { type: best.spot.type };
      this.audio.land();
      if (best.spot.type === 'skin') this.ui.toast(`🩸 ${best.spot.name}に着地！吸血開始`, 1400);
      else { this.ui.toast(`🧥 ${best.spot.name}に隠れた（安全）`, 1400); this.hides++; }
      return true;
    }
    // 2) furniture / wall rest surfaces
    for (const rs of this.world.restSurfaces) {
      const d = this._distToBox(p, rs.box);
      if (d < 0.6) {
        mq.isLanded = true;
        mq.feedingOn = null; mq.feedingSpot = null;
        mq.landedOn = { type: rs.type };
        this.audio.land();
        const label = { floor:'床', ceiling:'天井', wall:'壁', furniture:'家具', plant:'観葉植物' }[rs.type] || '物陰';
        this.ui.toast(`🛬 ${label}で休憩（スタミナ回復）`, 1200);
        if (rs.type !== 'floor') this.hides++;
        return true;
      }
    }
    return false;
  }

  _takeOff(mq) {
    if (!mq.isLanded) return;
    mq.isLanded = false;
    mq.feedingOn = null; mq.feedingSpot = null; mq.landedOn = null;
    mq.velocity.y = 1.2;
  }

  _feed(dt, mq) {
    if (this.blood >= CFG.MAX_BLOOD) {
      // overfull: keep feeding raises itch/awareness fast (greedy = risky)
      mq.feedingOn.bite(dt * 2.5, mq.feedingSpot);
      if (Math.random() < dt*2) this.audio.feedTick();
      // try lay eggs when very full
      this._tryLayEggs();
      return;
    }
    const gain = CFG.FEED_RATE * dt;
    this.blood = Math.min(CFG.MAX_BLOOD, this.blood + gain);
    this.score += gain * 1.5;
    mq.feedingOn.bite(dt, mq.feedingSpot);
    if (Math.random() < dt*4) this.audio.feedTick();

    // count a "bite" milestone every time blood crosses 10 units fed
    this._feedAccum = (this._feedAccum || 0) + gain;
    if (this._feedAccum >= 12) {
      this._feedAccum = 0;
      this.bites++;
      this.score += 40;
      this.audio.feed();
      this.ui.toast(`+40 吸血成功！ (計${this.bites}回)`, 1000);
    }
  }

  _tryLayEggs() {
    this._eggTimer = (this._eggTimer || 0);
    if (this.blood >= CFG.MAX_BLOOD && this.bites >= 2) {
      this._eggTimer += 1;
      if (this._eggTimer > 60) {
        this._eggTimer = 0;
        this.eggs++;
        this.blood -= CFG.EGG_COST;
        this.score += 150;
        this.audio.egg();
        this.ui.toast('🥚 産卵成功！ +150 ボーナス', 1600);
      }
    }
  }

  // ===================== Camera =====================
  _updateCamera(dt, mq) {
    // third-person chase cam behind heading, with mouse orbit (camYaw/Pitch)
    const target = mq.group.position;
    const dist = this.camDist + (mq.speed * 0.05);
    const offset = new THREE.Vector3(
      Math.sin(this.camYaw) * Math.cos(this.camPitch),
      Math.sin(this.camPitch) + 0.4,
      Math.cos(this.camYaw) * Math.cos(this.camPitch)
    ).multiplyScalar(-dist);

    const desired = target.clone().add(offset);
    // avoid clipping into walls roughly
    desired.x = THREE.MathUtils.clamp(desired.x, -this.world.ROOM.w/2+0.4, this.world.ROOM.w/2-0.4);
    desired.z = THREE.MathUtils.clamp(desired.z, -this.world.ROOM.d/2+0.4, this.world.ROOM.d/2-0.4);
    desired.y = THREE.MathUtils.clamp(desired.y, 0.3, this.world.ROOM.h-0.3);

    this.camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
    const lookAt = target.clone().add(new THREE.Vector3(Math.sin(this.camYaw)*0.5, 0.1, Math.cos(this.camYaw)*0.5));
    this.camera.lookAt(lookAt);
  }

  // ===================== Collision helpers =====================
  _collide(from, to, vel) {
    for (const box of this.world.collidables) {
      if (this._pointInBox(to, box, 0.12)) {
        // push back along smallest penetration axis (simple)
        const center = new THREE.Vector3(); box.getCenter(center);
        const d = to.clone().sub(center);
        const ax = Math.abs(d.x), az = Math.abs(d.z), ay = Math.abs(d.y);
        if (ay > ax && ay > az) { to.y = from.y; vel.y *= -0.2; }
        else if (ax > az) { to.x = from.x; vel.x *= -0.2; }
        else { to.z = from.z; vel.z *= -0.2; }
      }
    }
  }
  _pointInBox(p, box, m=0) {
    return p.x>box.min.x-m && p.x<box.max.x+m && p.y>box.min.y-m && p.y<box.max.y+m && p.z>box.min.z-m && p.z<box.max.z+m;
  }
  _distToBox(p, box) {
    const cx = THREE.MathUtils.clamp(p.x, box.min.x, box.max.x);
    const cy = THREE.MathUtils.clamp(p.y, box.min.y, box.max.y);
    const cz = THREE.MathUtils.clamp(p.z, box.min.z, box.max.z);
    return Math.hypot(p.x-cx, p.y-cy, p.z-cz);
  }

  _updateContextHint(mq) {
    if (mq.isLanded) {
      if (mq.feedingOn) this.ui.contextHint('吸血中… [動く/E] で離陸');
      else this.ui.contextHint('休憩中… [動く/E] で離陸');
      return;
    }
    const p = mq.group.position;
    let near = null, nd = 0.9;
    for (const h of this.humans) for (const s of h.spots) {
      const d = p.distanceTo(s.world);
      if (d < nd) { nd = d; near = s; }
    }
    if (near) {
      this.ui.contextHint(near.type==='skin' ? `🩸 [クリック/E] ${near.name}で吸血` : `🧥 [クリック/E] ${near.name}に隠れる`);
    } else {
      let restNear = false;
      for (const rs of this.world.restSurfaces) if (this._distToBox(p, rs.box) < 0.6) { restNear = true; break; }
      this.ui.contextHint(restNear ? '🛬 [クリック/E] ここで休憩' : null);
    }
  }

  // ===================== UI events =====================
  _initUIEvents() {
    document.getElementById('start-btn').onclick = () => this.startGame();
    document.getElementById('retry-btn').onclick = () => this.startGame();
    document.getElementById('howto-btn').onclick = () => this.ui.showHowto(true);
    document.getElementById('howto-back').onclick = () => this.ui.showHowto(false);
    document.getElementById('totitle-btn').onclick = () => {
      this.state = 'title';
      this.ui.showGameOver(false);
      this.ui.showTitle(true);
      this.ui.setHighScore(this._loadHighScore());
    };
  }

  _checkOrientation() {
    const hint = document.getElementById('rotate-hint');
    const portrait = window.innerHeight > window.innerWidth;
    if (this.input.isTouch && portrait) hint.classList.remove('hidden');
    else hint.classList.add('hidden');
  }

  // ===================== Persistence =====================
  _loadHighScore() { return parseInt(localStorage.getItem('mosquito_highscore') || '0', 10); }
  _saveHighScore(s) { localStorage.setItem('mosquito_highscore', String(Math.floor(s))); }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._checkOrientation();
  }
}

window.addEventListener('load', () => {
  const game = new Game();
  window.__game = game;
  // dev auto-start + error surfacing for automated smoke tests (?autostart=1)
  if (new URLSearchParams(location.search).get('autostart') === '1') {
    setTimeout(() => game.startGame(), 500);
  }
});

window.addEventListener('error', (e) => {
  console.error('GAME_RUNTIME_ERROR:', e.message, e.filename, e.lineno);
});
