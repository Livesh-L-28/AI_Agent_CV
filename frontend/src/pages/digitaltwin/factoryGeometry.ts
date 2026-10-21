/**
 * SENTINEL AI — High-Fidelity Procedural Industrial Factory Geometry
 * Composed, recognizable industrial assets: 6-Axis Robotic Welding Cells,
 * 5-Axis CNC Milling Centers, Automated Conveyors, Heavy Pallet Racks,
 * Forklift Charging Stations, Structural Columns, Roof Trusses, and CCTV Cameras.
 */

import * as THREE from 'three';

// Shared PBR Material Cache for Maximum Rendering Performance & 0 Redundant Allocations
export class FactoryMaterialPalette {
  private static instance: FactoryMaterialPalette;

  public safetyYellow: THREE.MeshStandardMaterial;
  public safetyOrange: THREE.MeshStandardMaterial;
  public darkSteel: THREE.MeshStandardMaterial;
  public brushedMetal: THREE.MeshStandardMaterial;
  public machineCabinet: THREE.MeshStandardMaterial;
  public safetyCageMesh: THREE.MeshStandardMaterial;
  public safetyGlass: THREE.MeshStandardMaterial;
  public palletWood: THREE.MeshStandardMaterial;
  public cardboardBox: THREE.MeshStandardMaterial;
  public structuralBeam: THREE.MeshStandardMaterial;
  public wallConcrete: THREE.MeshStandardMaterial;
  public ledGreen: THREE.MeshBasicMaterial;
  public ledAmber: THREE.MeshBasicMaterial;
  public ledRed: THREE.MeshBasicMaterial;
  public guardrailYellow: THREE.MeshStandardMaterial;
  public workstationTop: THREE.MeshStandardMaterial;
  public highBayLightLens: THREE.MeshBasicMaterial;

  private constructor() {
    this.safetyYellow = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.35,
      metalness: 0.2,
    });
    this.safetyOrange = new THREE.MeshStandardMaterial({
      color: 0xea580c,
      roughness: 0.35,
      metalness: 0.25,
    });
    this.darkSteel = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.5,
      metalness: 0.8,
    });
    this.brushedMetal = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.25,
      metalness: 0.85,
    });
    this.machineCabinet = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.45,
      metalness: 0.3,
    });
    this.safetyCageMesh = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.6,
      metalness: 0.5,
      wireframe: true,
    });
    this.safetyGlass = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.35,
    });
    this.palletWood = new THREE.MeshStandardMaterial({
      color: 0xb45309,
      roughness: 0.8,
      metalness: 0.05,
    });
    this.cardboardBox = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.85,
      metalness: 0.0,
    });
    this.structuralBeam = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.6,
      metalness: 0.7,
    });
    this.wallConcrete = new THREE.MeshStandardMaterial({
      color: 0x0d1527,
      roughness: 0.9,
      metalness: 0.1,
    });
    this.ledGreen = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    this.ledAmber = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    this.ledRed = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    this.guardrailYellow = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.3,
      metalness: 0.35,
    });
    this.workstationTop = new THREE.MeshStandardMaterial({
      color: 0x78350f,
      roughness: 0.65,
      metalness: 0.05,
    });
    this.highBayLightLens = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
    });
  }

  public static get(): FactoryMaterialPalette {
    if (!FactoryMaterialPalette.instance) {
      FactoryMaterialPalette.instance = new FactoryMaterialPalette();
    }
    return FactoryMaterialPalette.instance;
  }
}

/**
 * 1. 6-Axis Robotic Welding / Assembly Cell
 * Complete with multi-axis articulated robot arm, protective cage fence,
 * floor controller cabinet, and 3-tier status tower light.
 */
export function createRoboticCell(
  width: number,
  height: number,
  depth: number,
  brandColor: 'yellow' | 'orange' = 'orange'
): THREE.Group {
  const mats = FactoryMaterialPalette.get();
  const group = new THREE.Group();
  const armColor = brandColor === 'orange' ? mats.safetyOrange : mats.safetyYellow;

  // A. Mounting Base Pedestal
  const basePlinth = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.4, 2.2),
    mats.darkSteel
  );
  basePlinth.position.y = 0.2;
  basePlinth.castShadow = true;
  group.add(basePlinth);

  const robotTurntable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.8, 0.5, 24),
    armColor
  );
  robotTurntable.position.y = 0.65;
  robotTurntable.castShadow = true;
  group.add(robotTurntable);

  // B. Articulated Robotic Arm Joints
  // Lower Shoulder
  const shoulder = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.2, 0.7),
    armColor
  );
  shoulder.position.set(0, 1.4, 0.2);
  shoulder.rotation.x = -0.3;
  shoulder.castShadow = true;
  group.add(shoulder);

  // Upper Arm (Cylinder / Beam)
  const elbow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 0.6, 16),
    mats.darkSteel
  );
  elbow.rotation.z = Math.PI / 2;
  elbow.position.set(0, 2.1, 0.5);
  group.add(elbow);

  const forearm = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 1.4, 0.5),
    armColor
  );
  forearm.position.set(0, 2.7, 0.2);
  forearm.rotation.x = 0.5;
  forearm.castShadow = true;
  group.add(forearm);

  // Wrist & End-Effector Tool (Welding Torch / Gripper)
  const wrist = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.4, 16),
    mats.brushedMetal
  );
  wrist.position.set(0, 3.3, -0.2);
  group.add(wrist);

  const endEffector = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, 0.5, 12),
    mats.darkSteel
  );
  endEffector.rotation.x = Math.PI;
  endEffector.position.set(0, 3.1, -0.2);
  group.add(endEffector);

  // C. Floor Controller Cabinet
  const cabinet = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 1.8, 0.8),
    mats.machineCabinet
  );
  cabinet.position.set(-width / 2 + 1.0, 0.9, depth / 2 - 0.8);
  cabinet.castShadow = true;
  group.add(cabinet);

  // Status Stack Light Tower on Cabinet
  const stackPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8),
    mats.brushedMetal
  );
  stackPole.position.set(-width / 2 + 1.0, 1.8 + 0.3, depth / 2 - 0.8);
  group.add(stackPole);

  const stackRed = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 12), mats.ledRed);
  stackRed.position.set(-width / 2 + 1.0, 2.35, depth / 2 - 0.8);
  group.add(stackRed);

  const stackGreen = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 12), mats.ledGreen);
  stackGreen.position.set(-width / 2 + 1.0, 2.2, depth / 2 - 0.8);
  group.add(stackGreen);

  // D. Perimeter Safety Cage Wire Mesh Fence
  const fenceH = Math.min(height * 0.65, 2.8);
  const postGeom = new THREE.CylinderGeometry(0.06, 0.06, fenceH, 8);

  const corners: Array<[number, number]> = [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2],
  ];

  corners.forEach(([px, pz]) => {
    const post = new THREE.Mesh(postGeom, mats.safetyYellow);
    post.position.set(px, fenceH / 2, pz);
    group.add(post);
  });

  // Mesh walls (North, South, East, West with safety gate opening)
  const meshMat = mats.safetyCageMesh;
  const wallN = new THREE.Mesh(new THREE.PlaneGeometry(width, fenceH - 0.4), meshMat);
  wallN.position.set(0, fenceH / 2, -depth / 2);
  group.add(wallN);

  const wallE = new THREE.Mesh(new THREE.PlaneGeometry(depth, fenceH - 0.4), meshMat);
  wallE.rotation.y = Math.PI / 2;
  wallE.position.set(width / 2, fenceH / 2, 0);
  group.add(wallE);

  const wallW = new THREE.Mesh(new THREE.PlaneGeometry(depth, fenceH - 0.4), meshMat);
  wallW.rotation.y = -Math.PI / 2;
  wallW.position.set(-width / 2, fenceH / 2, 0);
  group.add(wallW);

  return group;
}

/**
 * 2. 5-Axis CNC Milling Center / Precision Turning Lathe
 * Heavy machine enclosure with operator viewing glass window,
 * articulated control console pendant, and chip conveyor chute.
 */
export function createCncMillingCenter(
  width: number,
  height: number,
  depth: number
): THREE.Group {
  const mats = FactoryMaterialPalette.get();
  const group = new THREE.Group();

  // A. Main Enclosure Body
  const baseBody = new THREE.Mesh(
    new THREE.BoxGeometry(width, height * 0.9, depth),
    mats.machineCabinet
  );
  baseBody.position.y = (height * 0.9) / 2;
  baseBody.castShadow = true;
  group.add(baseBody);

  // Upper Hood / Headstock
  const hood = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.95, height * 0.15, depth * 0.95),
    mats.darkSteel
  );
  hood.position.y = height * 0.9 + (height * 0.15) / 2;
  group.add(hood);

  // B. Operator Viewing Window (Tinted Safety Glass)
  const windowMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.5, height * 0.45),
    mats.safetyGlass
  );
  windowMesh.position.set(0, height * 0.55, depth / 2 + 0.02);
  group.add(windowMesh);

  // Interior Workpiece Illumination Point Light
  const workLight = new THREE.PointLight(0xe2e8f0, 0.6, 4.0);
  workLight.position.set(0, height * 0.55, 0);
  group.add(workLight);

  // C. Articulated CNC Control Console Pendant
  const pendantArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8),
    mats.brushedMetal
  );
  pendantArm.position.set(width / 2 + 0.4, height * 0.7, depth / 2 - 0.2);
  pendantArm.rotation.z = -Math.PI / 4;
  group.add(pendantArm);

  const consoleBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.7, 0.25),
    mats.darkSteel
  );
  consoleBox.position.set(width / 2 + 0.7, height * 0.65, depth / 2);
  group.add(consoleBox);

  // Screen
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.45, 0.35),
    new THREE.MeshBasicMaterial({ color: 0x0284c7 })
  );
  screen.position.set(width / 2 + 0.7, height * 0.65, depth / 2 + 0.13);
  group.add(screen);

  // D. Status Tower Stack Light
  const stackPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8),
    mats.brushedMetal
  );
  stackPole.position.set(-width / 2 + 0.4, height + 0.25, -depth / 2 + 0.4);
  group.add(stackPole);

  const stackGreen = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.15, 12), mats.ledGreen);
  stackGreen.position.set(-width / 2 + 0.4, height + 0.45, -depth / 2 + 0.4);
  group.add(stackGreen);

  return group;
}

/**
 * 3. Automated Logistics Conveyor Line & Roller Bed
 * Steel H-frame leg stands, continuous roller bed, safety guide rails,
 * and staged pallet containers.
 */
export function createConveyorSystem(
  length: number,
  height: number,
  width: number
): THREE.Group {
  const mats = FactoryMaterialPalette.get();
  const group = new THREE.Group();

  // A. Structural Leg Stands (every 3 meters)
  const numLegs = Math.max(2, Math.floor(length / 3));
  const legSpacing = length / (numLegs - 1);

  for (let i = 0; i < numLegs; i++) {
    const lx = -length / 2 + i * legSpacing;
    const legLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, height, 0.1),
      mats.darkSteel
    );
    legLeft.position.set(lx, height / 2, -width / 2 + 0.05);
    group.add(legLeft);

    const legRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, height, 0.1),
      mats.darkSteel
    );
    legRight.position.set(lx, height / 2, width / 2 - 0.05);
    group.add(legRight);

    // Cross-brace
    const brace = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, width - 0.1),
      mats.darkSteel
    );
    brace.position.set(lx, height * 0.35, 0);
    group.add(brace);
  }

  // B. Main Roller Bed Deck
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.2, width),
    mats.brushedMetal
  );
  bed.position.set(0, height + 0.1, 0);
  bed.castShadow = true;
  group.add(bed);

  // Side Guide Rails (Safety Yellow)
  const railL = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.15, 0.05),
    mats.safetyYellow
  );
  railL.position.set(0, height + 0.25, -width / 2);
  group.add(railL);

  const railR = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.15, 0.05),
    mats.safetyYellow
  );
  railR.position.set(0, height + 0.25, width / 2);
  group.add(railR);

  // C. Staged Pallet Cargo / Tote Bins on Conveyor
  const cargoCount = Math.floor(length / 5);
  for (let j = 0; j < cargoCount; j++) {
    const cx = -length / 3 + j * 5.0;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.7, width * 0.7),
      mats.cardboardBox
    );
    box.position.set(cx, height + 0.2 + 0.35, 0);
    box.castShadow = true;
    group.add(box);
  }

  return group;
}

/**
 * 4. High-Bay Component Storage Racks & Pallet High-Bay
 * Industrial teardrop upright frames, dual horizontal load beams,
 * and pallets loaded with shrink-wrapped industrial components.
 */
export function createStorageRack(
  width: number,
  height: number,
  depth: number
): THREE.Group {
  const mats = FactoryMaterialPalette.get();
  const group = new THREE.Group();

  const numBays = Math.max(1, Math.floor(depth / 3));
  const baySpacing = depth / numBays;

  // Upright Vertical Frames (Safety Orange / Dark Steel)
  for (let i = 0; i <= numBays; i++) {
    const zPos = -depth / 2 + i * baySpacing;

    const postF = new THREE.Mesh(new THREE.BoxGeometry(0.12, height, 0.12), mats.safetyOrange);
    postF.position.set(-width / 2 + 0.06, height / 2, zPos);
    group.add(postF);

    const postB = new THREE.Mesh(new THREE.BoxGeometry(0.12, height, 0.12), mats.safetyOrange);
    postB.position.set(width / 2 - 0.06, height / 2, zPos);
    group.add(postB);

    // Cross Lacing Braces
    for (let h = 1.5; h < height; h += 2.0) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(width - 0.2, 0.08, 0.08), mats.darkSteel);
      brace.position.set(0, h, zPos);
      group.add(brace);
    }
  }

  // Horizontal Load Beams (3 tiers)
  const tiers = [1.2, 3.2, 5.2];
  tiers.forEach((yLevel) => {
    if (yLevel < height) {
      // Beam front & back
      const beamF = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, depth), mats.safetyOrange);
      beamF.position.set(-width / 2 + 0.1, yLevel, 0);
      group.add(beamF);

      const beamB = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, depth), mats.safetyOrange);
      beamB.position.set(width / 2 - 0.1, yLevel, 0);
      group.add(beamB);

      // Staged Pallets and Cargo Boxes
      for (let k = 0; k < numBays; k++) {
        const pz = -depth / 2 + (k + 0.5) * baySpacing;

        // Wood Pallet Base
        const pallet = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, 0.15, 1.2), mats.palletWood);
        pallet.position.set(0, yLevel + 0.08, pz);
        group.add(pallet);

        // Industrial Cargo Block
        const cargo = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.75, 1.2, 1.1),
          mats.cardboardBox
        );
        cargo.position.set(0, yLevel + 0.15 + 0.6, pz);
        cargo.castShadow = true;
        group.add(cargo);
      }
    }
  });

  return group;
}

/**
 * 5. Autonomous Forklift Bay & High-Voltage Charging Station
 * Floor guide rails, battery charger console with cable boom,
 * and staged AGV platform.
 */
export function createForkliftStation(
  width: number,
  height: number,
  depth: number
): THREE.Group {
  const mats = FactoryMaterialPalette.get();
  const group = new THREE.Group();

  // Charging Station Cabinet
  const chargerW = Math.min(width * 0.35, 2.2);
  const chargerH = Math.min(height * 0.85, 2.4);
  const charger = new THREE.Mesh(
    new THREE.BoxGeometry(chargerW, chargerH, 0.8),
    mats.machineCabinet
  );
  charger.position.set(0, chargerH / 2, -depth / 2 + 0.5);
  charger.castShadow = true;
  group.add(charger);

  // Meter Screen & Charging Cable Boom
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x10b981 })
  );
  screen.position.set(0, chargerH * 0.65, -depth / 2 + 0.91);
  group.add(screen);

  // Staged Electric Forklift / AGV Platform
  const agvChassis = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.6, 2.8),
    mats.safetyYellow
  );
  agvChassis.position.set(0, 0.35, 0.5);
  agvChassis.castShadow = true;
  group.add(agvChassis);

  // Overhead Guard Roll Cage
  const cagePillars = [
    [-0.8, -0.8],
    [0.8, -0.8],
    [-0.8, 0.8],
    [0.8, 0.8],
  ];
  cagePillars.forEach(([px, pz]) => {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8),
      mats.darkSteel
    );
    pillar.position.set(px, 1.4, 0.5 + pz);
    group.add(pillar);
  });

  const cageRoof = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.06, 1.7),
    mats.darkSteel
  );
  cageRoof.position.set(0, 2.2, 0.5);
  group.add(cageRoof);

  // Mast & Lift Forks
  const mast = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 2.4, 0.3),
    mats.darkSteel
  );
  mast.position.set(0, 1.2, 2.0);
  group.add(mast);

  return group;
}

/**
 * 6. Structural Factory Building Shell
 * Perimeter walls, heavy steel I-beam columns, overhead roof truss girders (8.5m),
 * and emergency exit doors with photoluminescent green safety signs.
 */
export function createFactoryBuildingShell(
  width: number,
  depth: number,
  height: number = 8.5
): THREE.Group {
  const mats = FactoryMaterialPalette.get();
  const group = new THREE.Group();

  // A. Structural I-Beam Columns along perimeter
  const colGeom = new THREE.BoxGeometry(0.45, height, 0.45);
  const columnPositions: Array<[number, number]> = [
    [0.2, 0.2],
    [width / 2, 0.2],
    [width - 0.2, 0.2],
    [0.2, depth / 2],
    [width - 0.2, depth / 2],
    [0.2, depth - 0.2],
    [width / 2, depth - 0.2],
    [width - 0.2, depth - 0.2],
  ];

  columnPositions.forEach(([cx, cz]) => {
    const col = new THREE.Mesh(colGeom, mats.structuralBeam);
    col.position.set(cx, height / 2, cz);
    col.castShadow = true;
    group.add(col);
  });

  // B. Overhead Roof Truss Framework (at y = height - 0.4m)
  const trussCount = 4;
  const trussSpacing = depth / (trussCount + 1);

  for (let t = 1; t <= trussCount; t++) {
    const tz = t * trussSpacing;
    // Main cross-girder
    const girder = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.45, 0.35),
      mats.structuralBeam
    );
    girder.position.set(width / 2, height - 0.3, tz);
    group.add(girder);

    // Diagonal truss web members
    const webMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, width * 0.95, 6),
      mats.darkSteel
    );
    webMesh.rotation.z = Math.PI / 2;
    webMesh.position.set(width / 2, height - 0.6, tz);
    group.add(webMesh);
  }

  // C. Perimeter Walls (Low concrete dado + dark metal industrial cladding)
  const wallH = 6.0;
  const wallMat = mats.wallConcrete;

  // Back North Wall
  const wallN = new THREE.Mesh(new THREE.PlaneGeometry(width, wallH), wallMat);
  wallN.position.set(width / 2, wallH / 2, 0);
  group.add(wallN);

  // West Wall
  const wallW = new THREE.Mesh(new THREE.PlaneGeometry(depth, wallH), wallMat);
  wallW.rotation.y = Math.PI / 2;
  wallW.position.set(0, wallH / 2, depth / 2);
  group.add(wallW);

  // East Wall
  const wallE = new THREE.Mesh(new THREE.PlaneGeometry(depth, wallH), wallMat);
  wallE.rotation.y = -Math.PI / 2;
  wallE.position.set(width, wallH / 2, depth / 2);
  group.add(wallE);

  // D. Emergency Exit Door & Photoluminescent Safety Sign (West Wall)
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 2.2, 1.2),
    mats.safetyYellow
  );
  door.position.set(0.06, 1.1, depth / 2);
  group.add(door);

  const exitSign = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.35, 0.7),
    new THREE.MeshBasicMaterial({ color: 0x10b981 })
  );
  exitSign.position.set(0.08, 2.5, depth / 2);
  group.add(exitSign);

  return group;
}

/**
 * 7. Realistic Industrial CCTV Bullet / PTZ Surveillance Camera
 * Replaces generic box markers with a recognizable machine-vision camera housing,
 * cylindrical lens barrel, drop-pendant pole, and active LED status beacon.
 */
export function createIndustrialCamera(
  cx: number,
  cy: number,
  cz: number,
  tx: number,
  ty: number,
  tz: number,
  status: string = 'LIVE'
): THREE.Group {
  const mats = FactoryMaterialPalette.get();
  const group = new THREE.Group();

  // A. Ceiling Mounting Flange & Drop Pendant Pole
  const dropH = Math.max(0.6, 8.5 - cy);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, dropH, 12),
    mats.darkSteel
  );
  pole.position.set(cx, cy + dropH / 2, cz);
  group.add(pole);

  // Mounting Flange Plate
  const flange = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16),
    mats.darkSteel
  );
  flange.position.set(cx, cy + dropH, cz);
  group.add(flange);

  // B. Swivel Ball-and-Socket Joint
  const swivel = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 16, 16),
    mats.brushedMetal
  );
  swivel.position.set(cx, cy, cz);
  group.add(swivel);

  // C. Camera Body Assembly (oriented towards target)
  const bodyGroup = new THREE.Group();
  bodyGroup.position.set(cx, cy, cz);
  bodyGroup.lookAt(tx, ty, tz);

  // Bullet Camera Housing
  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.65, 16),
    mats.brushedMetal
  );
  housing.rotation.x = Math.PI / 2;
  bodyGroup.add(housing);

  // Sunshield Hood
  const hood = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.45, 16, 1, true, 0, Math.PI),
    mats.darkSteel
  );
  hood.rotation.x = Math.PI / 2;
  hood.position.set(0, 0.05, 0.12);
  bodyGroup.add(hood);

  // Front Optical Glass Lens
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16),
    new THREE.MeshBasicMaterial({ color: 0x0284c7 })
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0, 0.34);
  bodyGroup.add(lens);

  // Active Status LED Beacon
  const ledMat =
    status === 'LIVE' ? mats.ledGreen : status === 'CONNECTING' ? mats.ledAmber : mats.ledRed;
  const statusLed = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 8, 8),
    ledMat
  );
  statusLed.position.set(0, 0.15, -0.2);
  bodyGroup.add(statusLed);

  group.add(bodyGroup);
  return group;
}

/**
 * 8. Realistic Industrial Worker Avatar (1.75m scale)
 * Protective hard hat, high-vis safety vest with retroreflective stripes,
 * utility trousers, work boots, and ground-contact safety status ring.
 */
export function createIndustrialWorkerAvatar(
  inViolation: boolean = false
): THREE.Group {
  const mats = FactoryMaterialPalette.get();
  const workerGroup = new THREE.Group();

  // Torso / High-vis vest (y = 0.8 to 1.35)
  const torsoGeo = new THREE.BoxGeometry(0.48, 0.55, 0.28);
  const vestMat = new THREE.MeshStandardMaterial({
    color: inViolation ? 0xef4444 : 0xf97316,
    roughness: 0.4,
    metalness: 0.1,
  });
  const torso = new THREE.Mesh(torsoGeo, vestMat);
  torso.name = 'workerTorso';
  torso.position.y = 1.05;
  torso.castShadow = true;
  workerGroup.add(torso);

  // Retroreflective Vest Stripes
  const stripeGeo = new THREE.BoxGeometry(0.5, 0.08, 0.3);
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.2,
    metalness: 0.8,
  });
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  stripe.position.y = 1.05;
  workerGroup.add(stripe);

  const harnessGeo = new THREE.BoxGeometry(0.1, 0.26, 0.3);
  const harnessL = new THREE.Mesh(harnessGeo, stripeMat);
  harnessL.position.set(-0.14, 1.2, 0);
  workerGroup.add(harnessL);
  const harnessR = new THREE.Mesh(harnessGeo, stripeMat);
  harnessR.position.set(0.14, 1.2, 0);
  workerGroup.add(harnessR);

  // Head
  const headGeo = new THREE.SphereGeometry(0.14, 16, 16);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    roughness: 0.7,
    metalness: 0.1,
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.48;
  head.castShadow = true;
  workerGroup.add(head);

  // Industrial Hard Hat
  const hatDomeGeo = new THREE.SphereGeometry(0.16, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const hatMat = mats.safetyYellow;
  const hatDome = new THREE.Mesh(hatDomeGeo, hatMat);
  hatDome.position.y = 1.54;
  workerGroup.add(hatDome);

  const brimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16);
  const brim = new THREE.Mesh(brimGeo, hatMat);
  brim.position.y = 1.54;
  workerGroup.add(brim);

  // Utility Work Trousers
  const legGeo = new THREE.BoxGeometry(0.18, 0.55, 0.2);
  const pantsMat = mats.darkSteel;
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.12, 0.5, 0);
  legL.castShadow = true;
  workerGroup.add(legL);

  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.12, 0.5, 0);
  legR.castShadow = true;
  workerGroup.add(legR);

  // Steel-Toe Work Boots
  const bootGeo = new THREE.BoxGeometry(0.19, 0.2, 0.28);
  const bootMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.9,
    metalness: 0.2,
  });
  const bootL = new THREE.Mesh(bootGeo, bootMat);
  bootL.position.set(-0.12, 0.1, 0.04);
  bootL.castShadow = true;
  workerGroup.add(bootL);

  const bootR = new THREE.Mesh(bootGeo, bootMat);
  bootR.position.set(0.12, 0.1, 0.04);
  bootR.castShadow = true;
  workerGroup.add(bootR);

  // Ground Contact Safety Status Ring
  const ringGeo = new THREE.RingGeometry(0.36, 0.46, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: inViolation ? 0xff0044 : 0x00f5d4,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.name = 'baseRing';
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = 0.02;
  workerGroup.add(ringMesh);

  return workerGroup;
}

/**
 * 9. Procedural Sealed Concrete Floor Texture with Safety Chevron Hazard Markings
 * Bakes high-precision expansion joints, green OSHA safety walkways,
 * yellow/black diagonal hazard stripes around robotic cells, and loading docks.
 */
export function createIndustrialFloorTexture(
  widthMeters: number = 60.0,
  depthMeters: number = 40.0
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  try {
    const canvas = document.createElement('canvas');
    // 2400 x 1600 provides exact 40 pixels per meter resolution
    const w = 2400;
    const h = 1600;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const scaleX = w / widthMeters;
    const scaleZ = h / depthMeters;

    // A. Sealed Concrete Base (Charcoal Industrial Slate)
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);

    // Subtle concrete aggregate / micro noise
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < 4000; i++) {
      const nx = Math.random() * w;
      const ny = Math.random() * h;
      ctx.fillRect(nx, ny, 2, 2);
    }

    // Concrete Slab Expansion Joint Seams (every 4 meters)
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 3;
    for (let x = 0; x <= widthMeters; x += 4.0) {
      ctx.beginPath();
      ctx.moveTo(x * scaleX, 0);
      ctx.lineTo(x * scaleX, h);
      ctx.stroke();
    }
    for (let z = 0; z <= depthMeters; z += 4.0) {
      ctx.beginPath();
      ctx.moveTo(0, z * scaleZ);
      ctx.lineTo(w, z * scaleZ);
      ctx.stroke();
    }

    // Joint edge highlight (1px subtle specular rim)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= widthMeters; x += 4.0) {
      ctx.beginPath();
      ctx.moveTo(x * scaleX + 2, 0);
      ctx.lineTo(x * scaleX + 2, h);
      ctx.stroke();
    }

    // B. OSHA Safety Green Pedestrian Walkway (Central East-West Corridor: z=18.75 to 21.25)
    const walkY1 = (20.0 - 1.25) * scaleZ;
    const walkH = 2.5 * scaleZ;
    const walkX1 = 2.0 * scaleX;
    const walkW = 56.0 * scaleX;

    ctx.fillStyle = '#065f46'; // Industrial safety green
    ctx.fillRect(walkX1, walkY1, walkW, walkH);

    // Yellow walkway perimeter boundary lines
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 4;
    ctx.strokeRect(walkX1, walkY1, walkW, walkH);

    // Dashed white centerline along walkway
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 16]);
    ctx.beginPath();
    ctx.moveTo(walkX1 + 10, 20.0 * scaleZ);
    ctx.lineTo(walkX1 + walkW - 10, 20.0 * scaleZ);
    ctx.stroke();
    ctx.setLineDash([]); // reset

    // North-South Logistics Walkway: x=25.9 to 28.1, z=2 to 38
    const logX1 = (27.0 - 1.1) * scaleX;
    const logW = 2.2 * scaleX;
    const logY1 = 2.0 * scaleZ;
    const logH = 36.0 * scaleZ;

    ctx.fillStyle = '#065f46';
    ctx.fillRect(logX1, logY1, logW, logH);

    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 4;
    ctx.strokeRect(logX1, logY1, logW, logH);

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 16]);
    ctx.beginPath();
    ctx.moveTo(27.0 * scaleX, logY1 + 10);
    ctx.lineTo(27.0 * scaleX, logY1 + logH - 10);
    ctx.stroke();
    ctx.setLineDash([]);

    // C. Yellow & Black Hazard Chevron Stripes Helper
    const drawHazardZoneBorder = (
      minX: number,
      minZ: number,
      maxX: number,
      maxZ: number,
      borderMeters: number = 0.5
    ) => {
      ctx.save();
      const px = minX * scaleX;
      const pz = minZ * scaleZ;
      const pw = (maxX - minX) * scaleX;
      const ph = (maxZ - minZ) * scaleZ;
      const bw = borderMeters * scaleX;

      // Draw striping pattern in clip rect
      ctx.beginPath();
      ctx.rect(px - bw, pz - bw, pw + 2 * bw, ph + 2 * bw);
      ctx.rect(px, pz, pw, ph);
      ctx.clip('evenodd');

      ctx.fillStyle = '#facc15';
      ctx.fillRect(px - bw, pz - bw, pw + 2 * bw, ph + 2 * bw);

      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 14;
      for (let d = -200; d < pw + ph + 200; d += 28) {
        ctx.beginPath();
        ctx.moveTo(px - bw + d, pz - bw);
        ctx.lineTo(px - bw + d - 60, pz + ph + bw);
        ctx.stroke();
      }
      ctx.restore();
    };

    // Hazard Stripes around Robotic Welding Cell A (Fanuc)
    drawHazardZoneBorder(13.0, 10.0, 21.0, 16.0, 0.5);

    // Hazard Stripes around Robotic Assembly Cell B (KUKA)
    drawHazardZoneBorder(33.0, 10.0, 41.0, 16.0, 0.5);

    // Hazard Stripes around Forklift Charging Bay
    drawHazardZoneBorder(48.0, 29.0, 56.0, 35.0, 0.6);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 4;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  } catch (err) {
    console.warn('Failed generating procedural floor texture:', err);
    return null;
  }
}

/**
 * 10. Industrial Safety Guardrails (OSHA Compliant)
 * Double horizontal tubular railing with stanchion posts and floor anchor flanges.
 */
export function createSafetyGuardrail(
  length: number,
  height: number = 1.1
): THREE.Group {
  const mats = FactoryMaterialPalette.get();
  const group = new THREE.Group();

  const numPosts = Math.max(2, Math.floor(length / 2.5) + 1);
  const spacing = length / (numPosts - 1);

  // Top Rail
  const topRail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, length, 12),
    mats.guardrailYellow
  );
  topRail.rotation.z = Math.PI / 2;
  topRail.position.set(0, height, 0);
  topRail.castShadow = true;
  group.add(topRail);

  // Mid Rail
  const midRail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, length, 12),
    mats.guardrailYellow
  );
  midRail.rotation.z = Math.PI / 2;
  midRail.position.set(0, height * 0.52, 0);
  midRail.castShadow = true;
  group.add(midRail);

  // Vertical Posts with Floor Flanges
  for (let i = 0; i < numPosts; i++) {
    const px = -length / 2 + i * spacing;

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, height, 12),
      mats.guardrailYellow
    );
    post.position.set(px, height / 2, 0);
    post.castShadow = true;
    group.add(post);

    // Floor Anchor Flange
    const flange = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.04, 16),
      mats.darkSteel
    );
    flange.position.set(px, 0.02, 0);
    group.add(flange);
  }

  return group;
}

/**
 * 11. Factory Quality Inspection Workstation
 * Heavy steel workbench, butcher-block surface, vertical tool backboard,
 * articulated LCD inspection display, and operator chair.
 */
export function createWorkstationBench(
  width: number = 2.4,
  depth: number = 1.2,
  height: number = 0.95
): THREE.Group {
  const mats = FactoryMaterialPalette.get();
  const group = new THREE.Group();

  // Steel Table Frame & Legs
  const legGeom = new THREE.BoxGeometry(0.08, height, 0.08);
  const legPositions = [
    [-width / 2 + 0.1, -depth / 2 + 0.1],
    [width / 2 - 0.1, -depth / 2 + 0.1],
    [-width / 2 + 0.1, depth / 2 - 0.1],
    [width / 2 - 0.1, depth / 2 - 0.1],
  ];
  legPositions.forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(legGeom, mats.darkSteel);
    leg.position.set(lx, height / 2, lz);
    leg.castShadow = true;
    group.add(leg);
  });

  // Tabletop
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.08, depth),
    mats.workstationTop
  );
  top.position.set(0, height + 0.04, 0);
  top.castShadow = true;
  group.add(top);

  // Rear Vertical Pegboard / Tool Panel
  const pegboard = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.9, 0.04),
    mats.machineCabinet
  );
  pegboard.position.set(0, height + 0.08 + 0.45, -depth / 2 + 0.05);
  pegboard.castShadow = true;
  group.add(pegboard);

  // Articulated Monitor VESA Stand & Dual LCD Screens
  const monitorStand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8),
    mats.brushedMetal
  );
  monitorStand.position.set(0, height + 0.08 + 0.25, -depth / 2 + 0.2);
  group.add(monitorStand);

  const screenL = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.35, 0.04),
    mats.darkSteel
  );
  screenL.position.set(-0.3, height + 0.08 + 0.45, -depth / 2 + 0.25);
  screenL.rotation.y = 0.15;
  group.add(screenL);

  const displayL = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.3),
    new THREE.MeshBasicMaterial({ color: 0x0284c7 })
  );
  displayL.position.set(-0.3, height + 0.08 + 0.45, -depth / 2 + 0.28);
  displayL.rotation.y = 0.15;
  group.add(displayL);

  const screenR = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.35, 0.04),
    mats.darkSteel
  );
  screenR.position.set(0.3, height + 0.08 + 0.45, -depth / 2 + 0.25);
  screenR.rotation.y = -0.15;
  group.add(screenR);

  const displayR = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.3),
    new THREE.MeshBasicMaterial({ color: 0x0f172a })
  );
  displayR.position.set(0.3, height + 0.08 + 0.45, -depth / 2 + 0.28);
  displayR.rotation.y = -0.15;
  group.add(displayR);

  // Ergonomic Operator Stool
  const stoolBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.06, 16),
    mats.darkSteel
  );
  stoolBase.position.set(0, 0.03, depth / 2 + 0.4);
  group.add(stoolBase);

  const stoolStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.6, 12),
    mats.brushedMetal
  );
  stoolStem.position.set(0, 0.33, depth / 2 + 0.4);
  group.add(stoolStem);

  const stoolSeat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.08, 20),
    mats.machineCabinet
  );
  stoolSeat.position.set(0, 0.65, depth / 2 + 0.4);
  group.add(stoolSeat);

  return group;
}

/**
 * 12. Industrial Motor Control Center (MCC) & Electrical Cabinet
 * NEMA-rated enclosure, ventilation louvers, rotary power disconnect switch,
 * overhead conduit connection, and High Voltage warning symbol.
 */
export function createElectricalCabinet(
  width: number = 1.2,
  height: number = 2.1,
  depth: number = 0.6
): THREE.Group {
  const mats = FactoryMaterialPalette.get();
  const group = new THREE.Group();

  // Cabinet Body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    mats.machineCabinet
  );
  body.position.set(0, height / 2, 0);
  body.castShadow = true;
  group.add(body);

  // Door Seam line
  const seam = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, height * 0.9, depth + 0.01),
    mats.darkSteel
  );
  seam.position.set(0, height / 2, 0);
  group.add(seam);

  // Rotary Power Disconnect Handle
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.08),
    mats.ledRed
  );
  handle.position.set(width * 0.35, height * 0.65, depth / 2 + 0.04);
  group.add(handle);

  // High-Voltage Warning Decal Plate
  const warningPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.22, 0.02),
    mats.safetyYellow
  );
  warningPlate.position.set(0, height * 0.75, depth / 2 + 0.02);
  group.add(warningPlate);

  // Overhead Steel Conduit Pipe
  const conduit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 6.4, 8),
    mats.brushedMetal
  );
  conduit.position.set(width * 0.25, height + 3.2, 0);
  group.add(conduit);

  return group;
}

/**
 * 13. Suspended Industrial High-Bay LED Fixture
 * UFO luminaire with radial heatsink fins, suspension cables reaching ceiling truss,
 * and downward illuminated optical lens.
 */
export function createSuspendedHighBayLight(
  cx: number,
  cy: number,
  cz: number,
  ceilingHeight: number = 8.5
): THREE.Group {
  const mats = FactoryMaterialPalette.get();
  const group = new THREE.Group();

  const dropLen = Math.max(0.5, ceilingHeight - cy);

  // Twin Suspension Cables
  const cableL = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, dropLen, 6),
    mats.darkSteel
  );
  cableL.position.set(cx - 0.2, cy + dropLen / 2, cz);
  group.add(cableL);

  const cableR = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, dropLen, 6),
    mats.darkSteel
  );
  cableR.position.set(cx + 0.2, cy + dropLen / 2, cz);
  group.add(cableR);

  // UFO Fixture Housing / Heat Sink
  const fixture = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.35, 0.15, 20),
    mats.darkSteel
  );
  fixture.position.set(cx, cy, cz);
  group.add(fixture);

  // Downward Emissive Optical Diffuser
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.38, 0.03, 20),
    mats.highBayLightLens
  );
  lens.position.set(cx, cy - 0.08, cz);
  group.add(lens);

  return group;
}

