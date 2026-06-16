import * as THREE from 'three';

/**
 * Builds the 3D living-room environment that the mosquito flies around in.
 * Returns useful references (collision boxes, rest surfaces, lights, etc).
 */
export function buildWorld(scene) {
  const collidables = [];   // AABB boxes the mosquito shouldn't pass through (walls)
  const restSurfaces = [];  // {box, type} surfaces the mosquito can land/hide on
  const decor = new THREE.Group();
  scene.add(decor);

  const ROOM = { w: 24, d: 24, h: 9 };

  // ---- Materials ----
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.95 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x9c7a52, roughness: 0.8 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x7b5230, roughness: 0.7 });
  const fabricMat = new THREE.MeshStandardMaterial({ color: 0x3b6e8c, roughness: 1.0 });
  const fabricMat2 = new THREE.MeshStandardMaterial({ color: 0x7a4a6e, roughness: 1.0 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.35, metalness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd0e0, roughness: 0.1, transparent: true, opacity: 0.35 });

  // ---- Floor ----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  decor.add(floor);
  // floor as rest surface
  restSurfaces.push({ box: new THREE.Box3(new THREE.Vector3(-ROOM.w/2, -0.1, -ROOM.d/2), new THREE.Vector3(ROOM.w/2, 0.05, ROOM.d/2)), type: 'floor', normal: new THREE.Vector3(0,1,0) });

  // ---- Ceiling ----
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), wallMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = ROOM.h;
  decor.add(ceil);
  restSurfaces.push({ box: new THREE.Box3(new THREE.Vector3(-ROOM.w/2, ROOM.h-0.05, -ROOM.d/2), new THREE.Vector3(ROOM.w/2, ROOM.h+0.1, ROOM.d/2)), type: 'ceiling', normal: new THREE.Vector3(0,-1,0) });

  // ---- Walls (4) ----
  function addWall(x, z, rotY) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.h), wallMat);
    w.position.set(x, ROOM.h / 2, z);
    w.rotation.y = rotY;
    w.receiveShadow = true;
    decor.add(w);
  }
  addWall(0, -ROOM.d/2, 0);
  addWall(0, ROOM.d/2, Math.PI);
  addWall(-ROOM.w/2, 0, Math.PI/2);
  addWall(ROOM.w/2, 0, -Math.PI/2);

  // wall collidables (thin slabs just outside playable area)
  const t = 0.5;
  collidables.push(new THREE.Box3(new THREE.Vector3(-ROOM.w/2-t, 0, -ROOM.d/2-t), new THREE.Vector3(ROOM.w/2+t, ROOM.h, -ROOM.d/2)));
  collidables.push(new THREE.Box3(new THREE.Vector3(-ROOM.w/2-t, 0, ROOM.d/2), new THREE.Vector3(ROOM.w/2+t, ROOM.h, ROOM.d/2+t)));
  collidables.push(new THREE.Box3(new THREE.Vector3(-ROOM.w/2-t, 0, -ROOM.d/2-t), new THREE.Vector3(-ROOM.w/2, ROOM.h, ROOM.d/2+t)));
  collidables.push(new THREE.Box3(new THREE.Vector3(ROOM.w/2, 0, -ROOM.d/2-t), new THREE.Vector3(ROOM.w/2+t, ROOM.h, ROOM.d/2+t)));
  // wall rest surfaces
  restSurfaces.push({ box: new THREE.Box3(new THREE.Vector3(-ROOM.w/2, 0.3, -ROOM.d/2), new THREE.Vector3(ROOM.w/2, ROOM.h, -ROOM.d/2+0.1)), type: 'wall', normal: new THREE.Vector3(0,0,1) });

  // ---- helper to add a box piece of furniture ----
  function addBox(w, h, d, x, y, z, mat, opts = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    decor.add(m);
    const half = new THREE.Vector3(w/2, h/2, d/2);
    const box = new THREE.Box3(new THREE.Vector3(x-half.x, y-half.y, z-half.z), new THREE.Vector3(x+half.x, y+half.y, z+half.z));
    if (opts.collide !== false) collidables.push(box);
    if (opts.rest) restSurfaces.push({ box, type: opts.rest, normal: new THREE.Vector3(0,1,0), mesh: m });
    return m;
  }

  // ---- Sofa ----
  const sofaG = new THREE.Group();
  addBox(6, 0.8, 2.6, -7, 0.6, 6, fabricMat, { rest: 'furniture' });        // seat
  addBox(6, 1.6, 0.6, -7, 1.4, 7.0, fabricMat, { rest: 'furniture' });      // back
  addBox(0.6, 1.2, 2.6, -10, 1.0, 6, fabricMat, { rest: 'furniture' });     // arm
  addBox(0.6, 1.2, 2.6, -4, 1.0, 6, fabricMat, { rest: 'furniture' });      // arm
  decor.add(sofaG);

  // ---- Coffee table ----
  addBox(3.4, 0.25, 2, -7, 1.3, 2.5, woodMat, { rest: 'furniture' });
  addBox(0.18,1.3,0.18,-8.4,0.65,1.7,woodMat); addBox(0.18,1.3,0.18,-5.6,0.65,1.7,woodMat);
  addBox(0.18,1.3,0.18,-8.4,0.65,3.3,woodMat); addBox(0.18,1.3,0.18,-5.6,0.65,3.3,woodMat);

  // ---- Dining table + chairs ----
  addBox(4, 0.2, 3, 7, 2.0, -5, woodMat, { rest: 'furniture' });
  for (const [cx,cz] of [[5.2,-5],[8.8,-5],[7,-6.6],[7,-3.4]]) {
    addBox(0.2,2.0,0.2,cx,1.0,cz,woodMat,{collide:false});
  }
  addBox(0.18,2,0.18,5.4,1,-3.6,woodMat); addBox(0.18,2,0.18,8.6,1,-3.6,woodMat);

  // ---- TV stand + TV ----
  addBox(5, 1.2, 1.2, 0, 0.6, -11, woodMat, { rest: 'furniture' });
  addBox(4.6, 2.6, 0.25, 0, 2.6, -11.2, new THREE.MeshStandardMaterial({ color: 0x101015, roughness: 0.4 }), { rest: 'furniture' });

  // ---- Bookshelf ----
  addBox(3, 5, 1, 10, 2.5, 9, woodMat, { rest: 'furniture' });
  const bookColors = [0xc0392b, 0x27ae60, 0x2980b9, 0xd4ac0d, 0x8e44ad];
  for (let i=0;i<5;i++){
    addBox(0.4, 1.2, 0.8, 9 + i*0.45, 1.0 + Math.random()*0.3, 9, new THREE.MeshStandardMaterial({color: bookColors[i%5], roughness:0.9}), {collide:false});
  }

  // ---- Lamp (light source, also makes nearby area bright/dangerous) ----
  const lampBase = addBox(0.6, 0.2, 0.6, 9, 0.1, -8, metalMat);
  addBox(0.12, 3, 0.12, 9, 1.5, -8, metalMat);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.0, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffcc66, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
  shade.position.set(9, 3.2, -8);
  decor.add(shade);
  const lampLight = new THREE.PointLight(0xffd9a0, 1.4, 14, 1.6);
  lampLight.position.set(9, 3.0, -8);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);
  scene.add(lampLight);

  // ---- Window (moonlight) ----
  const win = new THREE.Mesh(new THREE.PlaneGeometry(5, 4), glassMat);
  win.position.set(0, 4.5, ROOM.d/2 - 0.05);
  win.rotation.y = Math.PI;
  decor.add(win);
  addBox(5.4, 0.25, 0.25, 0, 6.6, ROOM.d/2-0.1, woodMat, {collide:false});
  addBox(5.4, 0.25, 0.25, 0, 2.4, ROOM.d/2-0.1, woodMat, {collide:false});

  // ---- Potted plant (good hiding spot) ----
  const pot = addBox(1, 1, 1, -11, 0.5, -9, new THREE.MeshStandardMaterial({color:0xb5651d, roughness:0.9}), {rest:'furniture'});
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.85 });
  for (let i=0;i<8;i++){
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.6, 5), leafMat);
    const a = (i/8)*Math.PI*2;
    leaf.position.set(-11 + Math.cos(a)*0.4, 1.7 + Math.random()*0.5, -9 + Math.sin(a)*0.4);
    leaf.rotation.z = Math.cos(a)*0.4; leaf.rotation.x = Math.sin(a)*0.4;
    leaf.castShadow = true;
    decor.add(leaf);
    restSurfaces.push({ box: new THREE.Box3().setFromObject(leaf), type: 'plant', normal: new THREE.Vector3(0,1,0), mesh: leaf });
  }

  // ---- Rug ----
  const rug = new THREE.Mesh(new THREE.CircleGeometry(4, 32), new THREE.MeshStandardMaterial({ color: 0xb03a4a, roughness: 1 }));
  rug.rotation.x = -Math.PI/2; rug.position.set(-7, 0.02, 4);
  rug.receiveShadow = true;
  decor.add(rug);

  // ---- Lights ----
  const ambient = new THREE.AmbientLight(0x404a6e, 0.7);
  scene.add(ambient);
  const moon = new THREE.DirectionalLight(0x9fb6ff, 0.55);
  moon.position.set(6, 12, 14);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -16; moon.shadow.camera.right = 16;
  moon.shadow.camera.top = 16; moon.shadow.camera.bottom = -16;
  moon.shadow.camera.far = 40;
  scene.add(moon);

  // fog for atmosphere
  scene.fog = new THREE.FogExp2(0x0c0e1a, 0.012);
  scene.background = new THREE.Color(0x0c0e1a);

  // Bright zones (near lamp) increase danger detection
  const brightZones = [{ pos: new THREE.Vector3(9, 0, -8), radius: 6 }];

  return {
    ROOM,
    collidables,
    restSurfaces,
    brightZones,
    lampLight,
    decor,
    bounds: new THREE.Box3(
      new THREE.Vector3(-ROOM.w/2 + 0.3, 0.05, -ROOM.d/2 + 0.3),
      new THREE.Vector3(ROOM.w/2 - 0.3, ROOM.h - 0.2, ROOM.d/2 - 0.3)
    )
  };
}
