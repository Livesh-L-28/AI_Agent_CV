/**
 * SENTINEL AI — Multi-Environment Procedural 3D Geometry Constructors
 * Creates realistic, optimized industrial 3D assets for:
 * 1. Manufacturing (Robotics, CNC, Conveyors)
 * 2. Warehouse & Logistics (Pallet Racks, Loading Docks, Docked Trailers, Wrappers)
 * 3. Process & Chemical (Storage Tanks, Distillation Columns, Pipe Racks, Pumps, Catwalks)
 * 4. Construction (Tower Cranes, Scaffolding, Excavators, Concrete Footings, Barricades)
 */

import * as THREE from 'three';

// ============================================================================
// 1. WAREHOUSE & LOGISTICS 3D ASSETS
// ============================================================================

/**
 * Creates a heavy-duty industrial high-bay pallet racking system with pallets and cartons.
 */
export function createWarehousePalletRack(
  width: number,
  height: number,
  depth: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'WarehousePalletRack';

  // Materials
  const uprightMat = new THREE.MeshStandardMaterial({
    color: 0x1d4ed8, // Industrial blue uprights
    roughness: 0.4,
    metalness: 0.6,
  });
  const beamMat = new THREE.MeshStandardMaterial({
    color: 0xf97316, // Safety orange crossbeams
    roughness: 0.5,
    metalness: 0.4,
  });
  const palletMat = new THREE.MeshStandardMaterial({
    color: 0xb45309, // Pine wood pallet
    roughness: 0.8,
    metalness: 0.1,
  });
  const boxMatA = new THREE.MeshStandardMaterial({
    color: 0xd97706, // Cardboard brown
    roughness: 0.9,
    metalness: 0.05,
  });
  const boxMatB = new THREE.MeshStandardMaterial({
    color: 0x0284c7, // Wrapped plastic / shrink wrap blue
    roughness: 0.3,
    metalness: 0.2,
    transparent: true,
    opacity: 0.85,
  });

  const numBays = Math.max(2, Math.floor(width / 3.0));
  const bayWidth = width / numBays;
  const numTiers = Math.max(2, Math.floor(height / 2.2));
  const tierHeight = height / numTiers;

  // Upright vertical posts (front and back)
  const postGeo = new THREE.BoxGeometry(0.12, height, 0.12);
  for (let b = 0; b <= numBays; b++) {
    const x = -width / 2 + b * bayWidth;
    // Front post
    const frontPost = new THREE.Mesh(postGeo, uprightMat);
    frontPost.position.set(x, height / 2, depth / 2);
    frontPost.castShadow = true;
    group.add(frontPost);

    // Back post
    const backPost = new THREE.Mesh(postGeo, uprightMat);
    backPost.position.set(x, height / 2, -depth / 2);
    backPost.castShadow = true;
    group.add(backPost);

    // Diagonal bracing
    const braceGeo = new THREE.BoxGeometry(0.04, tierHeight * 1.3, 0.04);
    for (let t = 0; t < numTiers; t++) {
      const brace = new THREE.Mesh(braceGeo, uprightMat);
      brace.position.set(x, (t + 0.5) * tierHeight, 0);
      brace.rotation.x = Math.PI / 4;
      group.add(brace);
    }
  }

  // Horizontal shelf load beams and pallets
  const beamFrontGeo = new THREE.BoxGeometry(width, 0.14, 0.08);
  const beamBackGeo = new THREE.BoxGeometry(width, 0.14, 0.08);
  const palletGeo = new THREE.BoxGeometry(1.2, 0.14, 1.0);

  for (let t = 1; t <= numTiers; t++) {
    const y = t * tierHeight;

    // Front horizontal beam
    const fb = new THREE.Mesh(beamFrontGeo, beamMat);
    fb.position.set(0, y, depth / 2);
    fb.castShadow = true;
    group.add(fb);

    // Back horizontal beam
    const bb = new THREE.Mesh(beamBackGeo, beamMat);
    bb.position.set(0, y, -depth / 2);
    bb.castShadow = true;
    group.add(bb);

    // Place pallets and cargo in each bay
    for (let b = 0; b < numBays; b++) {
      const bayCenterX = -width / 2 + (b + 0.5) * bayWidth;

      // 2 pallets per bay
      [-0.65, 0.65].forEach((offset, idx) => {
        const px = bayCenterX + offset;
        const pallet = new THREE.Mesh(palletGeo, palletMat);
        pallet.position.set(px, y + 0.07, 0);
        pallet.castShadow = true;
        group.add(pallet);

        // Cargo box on pallet
        const boxH = 0.8 + (b + t + idx) % 3 * 0.3;
        const boxGeo = new THREE.BoxGeometry(1.05, boxH, 0.9);
        const box = new THREE.Mesh(boxGeo, (b + t) % 2 === 0 ? boxMatA : boxMatB);
        box.position.set(px, y + 0.14 + boxH / 2, 0);
        box.castShadow = true;
        group.add(box);
      });
    }
  }

  return group;
}

/**
 * Creates an industrial warehouse loading dock bay with roll-up overhead door and dock bumpers.
 */
export function createLoadingDockBay(
  width: number,
  height: number,
  depth: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'LoadingDockBay';

  // Concrete pit wall
  const pitMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });
  const pitWall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), pitMat);
  pitWall.position.set(0, height / 2, 0);
  pitWall.receiveShadow = true;
  group.add(pitWall);

  // Roll-up industrial door (ribbed corrugated panels)
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.7,
    roughness: 0.3,
  });
  const doorWidth = width * 0.75;
  const doorHeight = height * 0.85;
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, 0.1), doorMat);
  door.position.set(0, doorHeight / 2, depth / 2 + 0.05);
  group.add(door);

  // Door yellow hazard stripes header
  const headerMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4 });
  const header = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.3, 0.3, 0.15), headerMat);
  header.position.set(0, doorHeight + 0.15, depth / 2 + 0.06);
  group.add(header);

  // Heavy rubber dock bumpers on both sides
  const bumperMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
  const bumperGeo = new THREE.BoxGeometry(0.3, 0.8, 0.35);
  [-doorWidth / 2 - 0.2, doorWidth / 2 + 0.2].forEach((bx) => {
    const bumper = new THREE.Mesh(bumperGeo, bumperMat);
    bumper.position.set(bx, 0.5, depth / 2 + 0.2);
    group.add(bumper);
  });

  return group;
}

/**
 * Creates a full-size parked logistics freight truck trailer docked at a bay.
 */
export function createDockedTruckTrailer(
  width: number,
  height: number,
  depth: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'DockedTruckTrailer';

  // Trailer body (White aluminum box with aerodynamic fairings)
  const trailerMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    metalness: 0.3,
    roughness: 0.3,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height - 1.0, depth), trailerMat);
  body.position.set(0, (height - 1.0) / 2 + 1.0, 0);
  body.castShadow = true;
  group.add(body);

  // Rear trailer door frame & red hazard reflectors
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.05, height - 0.95, 0.1), frameMat);
  frame.position.set(0, (height - 1.0) / 2 + 1.0, depth / 2 + 0.02);
  group.add(frame);

  // Heavy-duty dual rear axles and wheels
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
  const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.3, 16);
  wheelGeo.rotateZ(Math.PI / 2);

  [-1, 1].forEach((side) => {
    [-1.2, 0.0, 1.2].forEach((axleZ) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(side * (width / 2 + 0.1), 0.5, axleZ);
      wheel.castShadow = true;
      group.add(wheel);
    });
  });

  return group;
}

// ============================================================================
// 2. PROCESS & CHEMICAL PLANT 3D ASSETS
// ============================================================================

/**
 * Creates a large industrial vertical chemical storage tank with dome roof, ladder, and nozzles.
 */
export function createChemicalStorageTank(
  diameter: number,
  height: number,
  depth: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ChemicalStorageTank';

  const radius = Math.min(diameter, depth) / 2;
  const cylinderHeight = height * 0.82;

  // Main cylindrical vessel (Stainless steel / epoxy lined)
  const tankMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8, // Light steel gray
    metalness: 0.75,
    roughness: 0.25,
  });
  const cylinderGeo = new THREE.CylinderGeometry(radius, radius, cylinderHeight, 32);
  const tankCylinder = new THREE.Mesh(cylinderGeo, tankMat);
  tankCylinder.position.set(0, cylinderHeight / 2, 0);
  tankCylinder.castShadow = true;
  tankCylinder.receiveShadow = true;
  group.add(tankCylinder);

  // Domed roof
  const domeMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7, // Accent blue dome roof
    metalness: 0.6,
    roughness: 0.3,
  });
  const domeGeo = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.set(0, cylinderHeight, 0);
  dome.castShadow = true;
  group.add(dome);

  // Concrete foundation base ring
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 });
  const baseGeo = new THREE.CylinderGeometry(radius + 0.3, radius + 0.35, 0.4, 32);
  const baseRing = new THREE.Mesh(baseGeo, baseMat);
  baseRing.position.set(0, 0.2, 0);
  baseRing.receiveShadow = true;
  group.add(baseRing);

  // External vertical access caged ladder
  const ladderMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 }); // Safety yellow
  const railGeo = new THREE.CylinderGeometry(0.02, 0.02, cylinderHeight, 8);
  [-0.2, 0.2].forEach((xOff) => {
    const rail = new THREE.Mesh(railGeo, ladderMat);
    rail.position.set(xOff, cylinderHeight / 2, radius + 0.12);
    group.add(rail);
  });
  // Rungs
  const numRungs = Math.floor(cylinderHeight / 0.35);
  const rungGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.4, 8);
  rungGeo.rotateZ(Math.PI / 2);
  for (let r = 1; r < numRungs; r++) {
    const rung = new THREE.Mesh(rungGeo, ladderMat);
    rung.position.set(0, r * 0.35, radius + 0.12);
    group.add(rung);
  }

  // Top platform railing
  const topRailMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 });
  const topRailGeo = new THREE.TorusGeometry(radius * 0.5, 0.03, 8, 24);
  topRailGeo.rotateX(Math.PI / 2);
  const topRail = new THREE.Mesh(topRailGeo, topRailMat);
  topRail.position.set(0, cylinderHeight + radius * 0.4, 0);
  group.add(topRail);

  return group;
}

/**
 * Creates a tall vertical fractional distillation column with tray rings, external pipes, and condenser nozzle.
 */
export function createDistillationColumn(
  diameter: number,
  height: number,
  depth: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'DistillationColumn';

  const radius = Math.min(diameter, depth) / 2;

  // Tall column body
  const columnMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    metalness: 0.85,
    roughness: 0.2,
  });
  const bodyGeo = new THREE.CylinderGeometry(radius, radius, height, 32);
  const columnBody = new THREE.Mesh(bodyGeo, columnMat);
  columnBody.position.set(0, height / 2, 0);
  columnBody.castShadow = true;
  group.add(columnBody);

  // Horizontal welded tray stiffener rings every 1.8 meters
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7 });
  const numRings = Math.floor(height / 1.8);
  for (let i = 1; i <= numRings; i++) {
    const ringGeo = new THREE.TorusGeometry(radius + 0.04, 0.03, 8, 32);
    ringGeo.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, i * 1.8, 0);
    group.add(ring);
  }

  // Overhead vapor line pipe descending alongside the column
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.6, roughness: 0.3 });
  const vaporPipeGeo = new THREE.CylinderGeometry(0.12, 0.12, height * 0.9, 16);
  const vaporPipe = new THREE.Mesh(vaporPipeGeo, pipeMat);
  vaporPipe.position.set(radius + 0.25, (height * 0.9) / 2 + 0.5, 0);
  vaporPipe.castShadow = true;
  group.add(vaporPipe);

  return group;
}

/**
 * Creates an industrial structural steel pipe rack gantry carrying multiple process fluid pipes.
 */
export function createPipeRackGantry(
  width: number,
  height: number,
  depth: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'PipeRackGantry';

  // Structural H-beam frame (Industrial steel blue)
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a8a,
    metalness: 0.6,
    roughness: 0.4,
  });

  // Vertical support legs
  const legGeo = new THREE.BoxGeometry(0.2, height, 0.2);
  [-width / 2 + 0.2, width / 2 - 0.2].forEach((lx) => {
    [-depth / 2 + 0.2, depth / 2 - 0.2].forEach((lz) => {
      const leg = new THREE.Mesh(legGeo, steelMat);
      leg.position.set(lx, height / 2, lz);
      leg.castShadow = true;
      group.add(leg);
    });
  });

  // Cross horizontal beams at 2 tiers
  const tierHeights = [height * 0.55, height * 0.9];
  tierHeights.forEach((ty) => {
    const beamW = new THREE.Mesh(new THREE.BoxGeometry(width, 0.18, 0.12), steelMat);
    beamW.position.set(0, ty, depth / 2 - 0.2);
    group.add(beamW);

    const beamW2 = new THREE.Mesh(new THREE.BoxGeometry(width, 0.18, 0.12), steelMat);
    beamW2.position.set(0, ty, -depth / 2 + 0.2);
    group.add(beamW2);

    const beamD = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, depth), steelMat);
    beamD.position.set(-width / 2 + 0.2, ty, 0);
    group.add(beamD);

    const beamD2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, depth), steelMat);
    beamD2.position.set(width / 2 - 0.2, ty, 0);
    group.add(beamD2);
  });

  // Longitudinal process pipes spanning the rack (varying colors for steam, water, fuel)
  const pipeColors = [0xef4444, 0x3b82f6, 0xf59e0b, 0x10b981];
  pipeColors.forEach((color, idx) => {
    const pMat = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.3 });
    const pRadius = 0.08 + (idx % 2) * 0.04;
    const pGeo = new THREE.CylinderGeometry(pRadius, pRadius, width + 0.6, 16);
    pGeo.rotateZ(Math.PI / 2);

    const pMesh = new THREE.Mesh(pGeo, pMat);
    const zOffset = -depth / 2 + 0.5 + idx * (depth / 4);
    pMesh.position.set(0, height * 0.9 + 0.15, zOffset);
    pMesh.castShadow = true;
    group.add(pMesh);
  });

  return group;
}

/**
 * Creates heavy-duty centrifugal fluid transfer pumps mounted on a concrete inertia pad.
 */
export function createCentrifugalPump(
  width: number,
  _height: number,
  depth: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'CentrifugalPump';

  // Concrete base pad
  const padMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(width, 0.3, depth), padMat);
  pad.position.set(0, 0.15, 0);
  pad.receiveShadow = true;
  group.add(pad);

  // Electric drive motor (Cyan/Teal motor casing with cooling fins)
  const motorMat = new THREE.MeshStandardMaterial({ color: 0x0e7490, metalness: 0.6, roughness: 0.3 });
  const motorGeo = new THREE.CylinderGeometry(0.35, 0.35, width * 0.45, 20);
  motorGeo.rotateZ(Math.PI / 2);
  const motor = new THREE.Mesh(motorGeo, motorMat);
  motor.position.set(-width * 0.22, 0.65, 0);
  motor.castShadow = true;
  group.add(motor);

  // Centrifugal pump volute casing (Iron gray spiral)
  const voluteMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 });
  const voluteGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 24);
  const volute = new THREE.Mesh(voluteGeo, voluteMat);
  volute.position.set(width * 0.2, 0.65, 0);
  volute.castShadow = true;
  group.add(volute);

  // Vertical discharge pipe & pressure gauge
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7 });
  const dischargePipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 16), pipeMat);
  dischargePipe.position.set(width * 0.2, 1.1, 0);
  dischargePipe.castShadow = true;
  group.add(dischargePipe);

  // Dial pressure gauge
  const gaugeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16), gaugeMat);
  gauge.position.set(width * 0.2, 1.45, 0.12);
  gauge.rotation.x = Math.PI / 2;
  group.add(gauge);

  return group;
}

// ============================================================================
// 3. CONSTRUCTION SITE 3D ASSETS
// ============================================================================

/**
 * Creates a structural tower crane with lattice mast, operator cab, horizontal jib, and counterweights.
 */
export function createTowerCrane(
  width: number,
  height: number,
  depth: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'TowerCrane';

  // Safety construction yellow material
  const craneMat = new THREE.MeshStandardMaterial({
    color: 0xeab308, // High-vis construction yellow
    metalness: 0.5,
    roughness: 0.4,
  });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9 });
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9 });

  // Concrete foundation anchorage block
  const baseBlock = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.8, 3.5), concreteMat);
  baseBlock.position.set(0, 0.4, 0);
  baseBlock.receiveShadow = true;
  group.add(baseBlock);

  // Vertical lattice mast tower (chunky steel box representation)
  const mastWidth = 1.4;
  const mastHeight = height * 0.85;
  const mastGeo = new THREE.BoxGeometry(mastWidth, mastHeight, mastWidth);
  const mast = new THREE.Mesh(mastGeo, craneMat);
  mast.position.set(0, mastHeight / 2 + 0.8, 0);
  mast.castShadow = true;
  group.add(mast);

  // Turntable and slewing ring
  const slewMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 });
  const slewingRing = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.4, 24), slewMat);
  slewingRing.position.set(0, mastHeight + 1.0, 0);
  group.add(slewingRing);

  // Operator cab (glass window enclosure)
  const cabMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.7 });
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 1.6), cabMat);
  cab.position.set(1.2, mastHeight + 1.9, 0);
  group.add(cab);

  // Horizontal main jib boom (extending forward 18 meters)
  const jibLength = Math.max(width, depth) * 0.65;
  const jibGeo = new THREE.BoxGeometry(0.8, 0.9, jibLength);
  const jib = new THREE.Mesh(jibGeo, craneMat);
  jib.position.set(0, mastHeight + 2.3, jibLength / 2);
  jib.castShadow = true;
  group.add(jib);

  // Counter-jib extending backwards with concrete counterweights
  const counterJibLength = jibLength * 0.35;
  const cJib = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, counterJibLength), craneMat);
  cJib.position.set(0, mastHeight + 2.3, -counterJibLength / 2);
  group.add(cJib);

  // Heavy counterweight blocks
  const weightMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });
  const weights = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 2.0), weightMat);
  weights.position.set(0, mastHeight + 1.8, -counterJibLength + 1.0);
  group.add(weights);

  // Hoist cable and hook block suspended from jib
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 6.0, 8), cableMat);
  cable.position.set(0, mastHeight + 2.3 - 3.0, jibLength * 0.6);
  group.add(cable);

  // Crane hook payload
  const hookMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), hookMat);
  hook.position.set(0, mastHeight + 2.3 - 6.2, jibLength * 0.6);
  hook.castShadow = true;
  group.add(hook);

  return group;
}

/**
 * Creates modular construction scaffolding with galvanized pipe frames, wooden plank decks, and safety toe-boards.
 */
export function createConstructionScaffolding(
  width: number,
  height: number,
  depth: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ConstructionScaffolding';

  // Materials
  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8, // Galvanized zinc steel
    metalness: 0.75,
    roughness: 0.35,
  });
  const plankMat = new THREE.MeshStandardMaterial({
    color: 0xd97706, // Weathered wood planking
    roughness: 0.9,
    metalness: 0.05,
  });
  const netMat = new THREE.MeshStandardMaterial({
    color: 0x15803d, // Green safety debris netting
    transparent: true,
    opacity: 0.45,
    roughness: 0.9,
  });

  const numTiers = Math.max(2, Math.floor(height / 2.5));
  const tierHeight = height / numTiers;

  // Four vertical corner standards
  const legGeo = new THREE.CylinderGeometry(0.04, 0.04, height, 12);
  [-width / 2, width / 2].forEach((x) => {
    [-depth / 2, depth / 2].forEach((z) => {
      const leg = new THREE.Mesh(legGeo, pipeMat);
      leg.position.set(x, height / 2, z);
      leg.castShadow = true;
      group.add(leg);
    });
  });

  // Horizontal ledgers & walk decks at each tier
  for (let t = 1; t <= numTiers; t++) {
    const y = t * tierHeight;

    // Wooden walk deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(width - 0.08, 0.08, depth - 0.08), plankMat);
    deck.position.set(0, y, 0);
    deck.receiveShadow = true;
    group.add(deck);

    // Outer guardrail
    const railX1 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, width, 8), pipeMat);
    railX1.rotateZ(Math.PI / 2);
    railX1.position.set(0, y + 1.0, depth / 2);
    group.add(railX1);

    const railX2 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, width, 8), pipeMat);
    railX2.rotateZ(Math.PI / 2);
    railX2.position.set(0, y + 1.0, -depth / 2);
    group.add(railX2);
  }

  // Debris safety net backing
  const net = new THREE.Mesh(new THREE.PlaneGeometry(width, height), netMat);
  net.position.set(0, height / 2, depth / 2 + 0.02);
  group.add(net);

  return group;
}

/**
 * Creates a tracked heavy hydraulic excavator for construction and earthworks.
 */
export function createHydraulicExcavator(
  width: number,
  _height: number,
  depth: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'HydraulicExcavator';

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b, // CAT Caterpillar yellow
    metalness: 0.5,
    roughness: 0.35,
  });
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
  const cabGlass = new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 });

  // Dual crawler tracks (Steel treads)
  [-width * 0.35, width * 0.35].forEach((tx) => {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, depth * 0.8), trackMat);
    track.position.set(tx, 0.38, 0);
    track.castShadow = true;
    group.add(track);
  });

  // Revolving superstructure house
  const house = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, 1.2, depth * 0.6), bodyMat);
  house.position.set(0, 1.35, -0.2);
  house.castShadow = true;
  group.add(house);

  // Operator cabin
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 1.0), cabGlass);
  cab.position.set(-width * 0.22, 1.5, 0.4);
  group.add(cab);

  // Articulated boom arm extending forward
  const boomMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4 });
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 0.4), boomMat);
  boom.position.set(0.1, 2.3, 1.2);
  boom.rotation.x = -Math.PI / 5;
  boom.castShadow = true;
  group.add(boom);

  // Excavator digging bucket
  const bucket = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), trackMat);
  bucket.position.set(0.1, 1.1, 2.5);
  bucket.castShadow = true;
  group.add(bucket);

  return group;
}

/**
 * Creates structural steel building framing (columns, girders, cross-braces).
 */
export function createStructuralSteelFrame(
  width: number,
  height: number,
  depth: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'StructuralSteelFrame';

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b, // Red iron primer / structural steel red
    metalness: 0.6,
    roughness: 0.4,
  });

  // 4 Main corner I-beam columns
  const colGeo = new THREE.BoxGeometry(0.3, height, 0.3);
  [-width / 2, width / 2].forEach((x) => {
    [-depth / 2, depth / 2].forEach((z) => {
      const col = new THREE.Mesh(colGeo, steelMat);
      col.position.set(x, height / 2, z);
      col.castShadow = true;
      group.add(col);
    });
  });

  // Top horizontal perimeter girders
  const topGirderX = new THREE.Mesh(new THREE.BoxGeometry(width, 0.35, 0.2), steelMat);
  topGirderX.position.set(0, height - 0.2, depth / 2);
  group.add(topGirderX);

  const topGirderX2 = new THREE.Mesh(new THREE.BoxGeometry(width, 0.35, 0.2), steelMat);
  topGirderX2.position.set(0, height - 0.2, -depth / 2);
  group.add(topGirderX2);

  const topGirderZ = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, depth), steelMat);
  topGirderZ.position.set(-width / 2, height - 0.2, 0);
  group.add(topGirderZ);

  const topGirderZ2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, depth), steelMat);
  topGirderZ2.position.set(width / 2, height - 0.2, 0);
  group.add(topGirderZ2);

  return group;
}
