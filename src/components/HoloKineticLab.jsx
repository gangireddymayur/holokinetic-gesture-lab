import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  Sparkles,
  Zap,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Activity,
  Layers,
  Camera as CameraIcon,
  RotateCcw,
  HandMetal,
  Move3d,
  Magnet,
  ArrowRightLeft,
  X
} from 'lucide-react';
import './HoloKineticLab.css';

// Audio Synthesizer using Web Audio API
class SciFiAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }

  playCatch() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  playBounce() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.18);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.18);
  }

  playScale() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(700, now + 0.08);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  }
}

const audio = new SciFiAudioEngine();

const ARSENAL_SHAPES = [
  {
    id: 'basketball',
    name: 'Quantum Basketball',
    type: 'Bouncing Kinetic Sphere',
    icon: '🏀',
    color: 0xff6600
  },
  {
    id: 'tesseract',
    name: 'Tesseract Core',
    type: 'Cosmic Hypercube',
    icon: '🔷',
    color: 0x00f2fe
  },
  {
    id: 'reactor',
    name: 'Arc Reactor MK-50',
    type: 'Vibranium Power Unit',
    icon: '⚛️',
    color: 0x00ffcc
  },
  {
    id: 'polyhedron',
    name: 'Vibranium Crystal',
    type: 'Icosahedral Mesh',
    icon: '💎',
    color: 0xd946ef
  },
  {
    id: 'torus',
    name: 'Quantum Rings',
    type: 'Nested Gyroscope',
    icon: '🪐',
    color: 0xffb703
  }
];

export default function HoloKineticLab({ onSwitchMode }) {
  const [selectedShapeId, setSelectedShapeId] = useState('basketball');
  const [arFeedActive, setArFeedActive] = useState(true);
  const [muted, setMuted] = useState(false);
  const [bouncesCount, setBouncesCount] = useState(0);
  const [interactionStatus, setInteractionStatus] = useState('Bring your hand near the shape to CATCH it!');

  // Telemetry for Left & Right Hands
  const [leftHand, setLeftHand] = useState({ detected: false, pinching: false, x: 0, y: 0 });
  const [rightHand, setRightHand] = useState({ detected: false, pinching: false, x: 0, y: 0 });
  const [holoScale, setHoloScale] = useState(1.0);
  const [heldByState, setHeldByState] = useState(null);

  // Refs
  const mountRef = useRef(null);
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const activeMeshGroup = useRef(null);
  const sparksParticleSystem = useRef(null);

  // 3D Hand Reticle Meshes
  const leftHandCursorMesh = useRef(null);
  const rightHandCursorMesh = useRef(null);
  const tetherLineMesh = useRef(null);

  // Physics State
  const physicsState = useRef({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    rotX: 0,
    rotY: 0,
    scale: 1.0,
    heldBy: null, // 'left' | 'right' | 'both' | null
    isInFlight: false,
    prevHandDist: null,
    lastLeftPos: { x: 0, y: 0 },
    lastRightPos: { x: 0, y: 0 },
    leftVelocity: { x: 0, y: 0 },
    rightVelocity: { x: 0, y: 0 },
    leftHandWorld: { x: 0, y: 0, active: false, pinching: false },
    rightHandWorld: { x: 0, y: 0, active: false, pinching: false },
    viewportWidth: 14,
    viewportHeight: 9
  });

  const isProcessingCamera = useRef(false);

  // Helper to build 3D geometry
  const createShapeMesh = (shapeId) => {
    const group = new THREE.Group();

    if (shapeId === 'basketball') {
      const sphereGeo = new THREE.SphereGeometry(1.6, 32, 32);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: 0xff6600,
        emissive: 0xff3300,
        emissiveIntensity: 0.35,
        roughness: 0.4,
        metalness: 0.2
      });
      const ball = new THREE.Mesh(sphereGeo, sphereMat);

      const seamGeo = new THREE.TorusGeometry(1.61, 0.045, 16, 64);
      const seamMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe });
      const seam1 = new THREE.Mesh(seamGeo, seamMat);
      const seam2 = new THREE.Mesh(seamGeo, seamMat);
      seam2.rotation.x = Math.PI / 2;

      group.add(ball);
      group.add(seam1);
      group.add(seam2);
    } else if (shapeId === 'tesseract') {
      const outerGeo = new THREE.BoxGeometry(2.5, 2.5, 2.5);
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0x00f2fe,
        wireframe: true,
        transparent: true,
        opacity: 0.85
      });
      const outerCube = new THREE.Mesh(outerGeo, outerMat);

      const innerGeo = new THREE.BoxGeometry(1.3, 1.3, 1.3);
      const innerMat = new THREE.MeshStandardMaterial({
        color: 0x0088ff,
        emissive: 0x00f2fe,
        emissiveIntensity: 0.8
      });
      const innerCube = new THREE.Mesh(innerGeo, innerMat);

      group.add(outerCube);
      group.add(innerCube);
    } else if (shapeId === 'reactor') {
      const ringGeo1 = new THREE.TorusGeometry(1.8, 0.12, 16, 64);
      const ringMat1 = new THREE.MeshStandardMaterial({ color: 0x00f2fe, emissive: 0x00f2fe, emissiveIntensity: 0.9 });
      const ring1 = new THREE.Mesh(ringGeo1, ringMat1);

      const ringGeo2 = new THREE.TorusGeometry(1.1, 0.09, 16, 48);
      const ring2 = new THREE.Mesh(ringGeo2, ringMat1);

      const coreGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 32);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.rotation.x = Math.PI / 2;

      group.add(ring1);
      group.add(ring2);
      group.add(core);
    } else if (shapeId === 'polyhedron') {
      const icoGeo = new THREE.IcosahedronGeometry(1.6, 0);
      const icoMat = new THREE.MeshStandardMaterial({
        color: 0xd946ef,
        emissive: 0xa855f7,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.8
      });
      const crystal = new THREE.Mesh(icoGeo, icoMat);

      const wireGeo = new THREE.IcosahedronGeometry(1.65, 0);
      const wireMat = new THREE.MeshBasicMaterial({ color: 0xff00cc, wireframe: true });
      const wire = new THREE.Mesh(wireGeo, wireMat);

      group.add(crystal);
      group.add(wire);
    } else if (shapeId === 'torus') {
      const ring1Geo = new THREE.TorusGeometry(1.8, 0.08, 16, 64);
      const ring1Mat = new THREE.MeshBasicMaterial({ color: 0xffb703 });
      const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);

      const ring2Geo = new THREE.TorusGeometry(1.3, 0.06, 16, 48);
      const ring2Mat = new THREE.MeshBasicMaterial({ color: 0x00f2fe });
      const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
      ring2.rotation.x = Math.PI / 3;

      group.add(ring1);
      group.add(ring2);
    }

    return group;
  };

  const triggerSparks = (x, y, z) => {
    if (!sparksParticleSystem.current) return;
    const positions = sparksParticleSystem.current.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = x + (Math.random() - 0.5) * 1.8;
      positions[i + 1] = y + (Math.random() - 0.5) * 1.8;
      positions[i + 2] = z + (Math.random() - 0.5) * 1.8;
    }
    sparksParticleSystem.current.geometry.attributes.position.needsUpdate = true;
    sparksParticleSystem.current.visible = true;
    setTimeout(() => {
      if (sparksParticleSystem.current) sparksParticleSystem.current.visible = false;
    }, 280);
  };

  // Explicit Action: Snap to Hand
  const snapToHand = (side) => {
    const p = physicsState.current;
    if (side === 'left' && p.leftHandWorld.active) {
      p.heldBy = 'left';
      p.isInFlight = false;
      p.x = p.leftHandWorld.x;
      p.y = p.leftHandWorld.y;
      p.vx = 0;
      p.vy = 0;
      audio.playCatch();
      setHeldByState('left');
      setInteractionStatus('MAGNETICALLY CAUGHT IN LEFT HAND! Move your hand to carry it.');
    } else if (side === 'right' && p.rightHandWorld.active) {
      p.heldBy = 'right';
      p.isInFlight = false;
      p.x = p.rightHandWorld.x;
      p.y = p.rightHandWorld.y;
      p.vx = 0;
      p.vy = 0;
      audio.playCatch();
      setHeldByState('right');
      setInteractionStatus('MAGNETICALLY CAUGHT IN RIGHT HAND! Move your hand to carry it.');
    }
  };

  // Explicit Action: Toss across to other hand
  const tossToOtherHand = () => {
    const p = physicsState.current;
    if (p.heldBy === 'left') {
      p.heldBy = null;
      p.isInFlight = true;
      p.vx = 0.28; // Shoot rightwards
      p.vy = 0.08;
      setHeldByState(null);
      audio.playBounce();
      setInteractionStatus('THROWN! Put your Right Hand in path to CATCH or BOUNCE!');
    } else if (p.heldBy === 'right') {
      p.heldBy = null;
      p.isInFlight = true;
      p.vx = -0.28; // Shoot leftwards
      p.vy = 0.08;
      setHeldByState(null);
      audio.playBounce();
      setInteractionStatus('THROWN! Put your Left Hand in path to CATCH or BOUNCE!');
    } else {
      // Launch center
      p.vx = (Math.random() > 0.5 ? 1 : -1) * 0.22;
      p.vy = 0.12;
      p.isInFlight = true;
      audio.playBounce();
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '1') snapToHand('left');
      if (e.key === '2') snapToHand('right');
      if (e.key === 't' || e.key === 'T' || e.key === ' ') {
        e.preventDefault();
        tossToOtherHand();
      }
      if (e.key === 'r' || e.key === 'R') {
        physicsState.current.x = 0;
        physicsState.current.y = 0;
        physicsState.current.vx = 0;
        physicsState.current.vy = 0;
        physicsState.current.heldBy = null;
        physicsState.current.isInFlight = false;
        setHeldByState(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Three.js Setup
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.z = 10;
    cameraRef.current = camera;

    // Calculate exact viewport dimensions at z=0 plane
    const vHeight = 2 * Math.tan((50 * Math.PI / 180) / 2) * 10;
    const vWidth = vHeight * (width / height);
    physicsState.current.viewportWidth = vWidth;
    physicsState.current.viewportHeight = vHeight;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // Ambient & Point Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0x00f2fe, 3, 25);
    pointLight1.position.set(5, 5, 5);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xd946ef, 3, 25);
    pointLight2.position.set(-5, -5, 5);
    scene.add(pointLight2);

    // 3D Left Hand Stark Repulsor Ring
    const cursorGeo = new THREE.TorusGeometry(0.85, 0.05, 16, 48);
    const leftCursorMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.8 });
    const leftCursor = new THREE.Mesh(cursorGeo, leftCursorMat);
    leftCursor.visible = false;
    scene.add(leftCursor);
    leftHandCursorMesh.current = leftCursor;

    // 3D Right Hand Stark Repulsor Ring
    const rightCursorMat = new THREE.MeshBasicMaterial({ color: 0xd946ef, transparent: true, opacity: 0.8 });
    const rightCursor = new THREE.Mesh(cursorGeo, rightCursorMat);
    rightCursor.visible = false;
    scene.add(rightCursor);
    rightHandCursorMesh.current = rightCursor;

    // Magnetic Energy Tether Line
    const tetherGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]);
    const tetherMat = new THREE.LineBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.7, linewidth: 2 });
    const tetherLine = new THREE.Line(tetherGeo, tetherMat);
    tetherLine.visible = false;
    scene.add(tetherLine);
    tetherLineMesh.current = tetherLine;

    // Spark Particles System
    const particleCount = 70;
    const particlesGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x00f2fe,
      size: 0.22,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    const sparks = new THREE.Points(particlesGeo, particleMat);
    sparks.visible = false;
    scene.add(sparks);
    sparksParticleSystem.current = sparks;

    // Active Mesh
    const initialMesh = createShapeMesh(selectedShapeId);
    scene.add(initialMesh);
    activeMeshGroup.current = initialMesh;

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);

      const newVHeight = 2 * Math.tan((50 * Math.PI / 180) / 2) * 10;
      physicsState.current.viewportHeight = newVHeight;
      physicsState.current.viewportWidth = newVHeight * (w / h);
    };
    window.addEventListener('resize', handleResize);

    // 120Hz Animation & Physics Loop
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      const p = physicsState.current;
      const mesh = activeMeshGroup.current;
      const boundX = p.viewportWidth / 2 - 1.2;
      const boundY = p.viewportHeight / 2 - 1.2;

      // Update 3D Hand Cursors in Three.js Scene
      if (leftHandCursorMesh.current) {
        if (p.leftHandWorld.active) {
          leftHandCursorMesh.current.position.set(p.leftHandWorld.x, p.leftHandWorld.y, 0);
          leftHandCursorMesh.current.rotation.z += 0.03;
          leftHandCursorMesh.current.visible = true;
        } else {
          leftHandCursorMesh.current.visible = false;
        }
      }

      if (rightHandCursorMesh.current) {
        if (p.rightHandWorld.active) {
          rightHandCursorMesh.current.position.set(p.rightHandWorld.x, p.rightHandWorld.y, 0);
          rightHandCursorMesh.current.rotation.z -= 0.03;
          rightHandCursorMesh.current.visible = true;
        } else {
          rightHandCursorMesh.current.visible = false;
        }
      }

      // Update Magnetic Tether Line
      if (tetherLineMesh.current) {
        if (p.heldBy === 'left' && p.leftHandWorld.active) {
          tetherLineMesh.current.geometry.setFromPoints([
            new THREE.Vector3(p.leftHandWorld.x, p.leftHandWorld.y, 0),
            new THREE.Vector3(p.x, p.y, p.z)
          ]);
          tetherLineMesh.current.visible = true;
        } else if (p.heldBy === 'right' && p.rightHandWorld.active) {
          tetherLineMesh.current.geometry.setFromPoints([
            new THREE.Vector3(p.rightHandWorld.x, p.rightHandWorld.y, 0),
            new THREE.Vector3(p.x, p.y, p.z)
          ]);
          tetherLineMesh.current.visible = true;
        } else {
          tetherLineMesh.current.visible = false;
        }
      }

      if (mesh) {
        // Free Flight Physics
        if (!p.heldBy) {
          p.x += p.vx;
          p.y += p.vy;
          p.z += p.vz;

          p.vx *= 0.985;
          p.vy *= 0.985;

          // Gentle gravity for basketball
          if (selectedShapeId === 'basketball') {
            p.vy -= 0.0025;
          }

          // Wall Rebounds
          if (p.x > boundX) { p.x = boundX; p.vx = -p.vx * 0.85; audio.playBounce(); triggerSparks(p.x, p.y, p.z); }
          if (p.x < -boundX) { p.x = -boundX; p.vx = -p.vx * 0.85; audio.playBounce(); triggerSparks(p.x, p.y, p.z); }
          if (p.y > boundY) { p.y = boundY; p.vy = -p.vy * 0.85; audio.playBounce(); triggerSparks(p.x, p.y, p.z); }
          if (p.y < -boundY) { p.y = -boundY; p.vy = -p.vy * 0.85; audio.playBounce(); triggerSparks(p.x, p.y, p.z); }

          p.rotX += 0.01;
          p.rotY += 0.015;
        }

        mesh.position.set(p.x, p.y, p.z);
        mesh.rotation.set(p.rotX, p.rotY, 0);
        mesh.scale.set(p.scale, p.scale, p.scale);
      }

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update Model on Selection
  useEffect(() => {
    if (!sceneRef.current) return;
    if (activeMeshGroup.current) {
      sceneRef.current.remove(activeMeshGroup.current);
    }
    const newMesh = createShapeMesh(selectedShapeId);
    sceneRef.current.add(newMesh);
    activeMeshGroup.current = newMesh;

    physicsState.current.x = 0;
    physicsState.current.y = 0;
    physicsState.current.vx = 0;
    physicsState.current.vy = 0;
    physicsState.current.scale = 1.0;
    physicsState.current.heldBy = null;
    physicsState.current.isInFlight = false;
    setHeldByState(null);
    setHoloScale(1.0);
    audio.playCatch();
  }, [selectedShapeId]);

  // Dual-Hand MediaPipe Hands Tracking Loop
  useEffect(() => {
    let hands = null;
    let camera = null;
    let isCancelled = false;

    const setupHands = async () => {
      const HandsClass = window.Hands;
      const CameraClass = window.Camera;
      if (!HandsClass || !CameraClass) {
        setTimeout(setupHands, 250);
        return;
      }

      hands = new HandsClass({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      hands.onResults((results) => {
        if (isCancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let detectedLeft = null;
        let detectedRight = null;
        const p = physicsState.current;

        if (results.multiHandLandmarks && results.multiHandedness) {
          for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i].label; // "Left" or "Right"
            const isUserLeft = handedness === 'Right'; // Invert for mirrored camera

            // Draw Skeleton on PIP canvas
            if (window.drawConnectors && window.HAND_CONNECTIONS) {
              window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {
                color: isUserLeft ? '#00f2fe' : '#d946ef',
                lineWidth: 2
              });
            }

            if (window.drawLandmarks) {
              window.drawLandmarks(ctx, landmarks, {
                color: '#ffffff',
                lineWidth: 1,
                radius: 2.5
              });
            }

            // Draw Palm Repulsor Glow on Landmark 9 (Middle MCP)
            const palmX = landmarks[9].x * canvas.width;
            const palmY = landmarks[9].y * canvas.height;
            ctx.beginPath();
            ctx.arc(palmX, palmY, 12, 0, 2 * Math.PI);
            ctx.strokeStyle = isUserLeft ? '#00f2fe' : '#d946ef';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Hand scale
            const wrist = landmarks[0];
            const middleMCP = landmarks[9];
            const handScale = Math.max(0.08, Math.hypot(middleMCP.x - wrist.x, middleMCP.y - wrist.y));

            // Pinch distance
            const pinchDist = Math.hypot(landmarks[8].x - landmarks[4].x, landmarks[8].y - landmarks[4].y);
            const isPinching = pinchDist / handScale < 0.42;

            // EXACT Mathematical Projection into Three.js 3D Coordinates
            const worldX = (0.5 - landmarks[9].x) * p.viewportWidth;
            const worldY = (0.5 - landmarks[9].y) * p.viewportHeight;

            const handData = {
              worldX,
              worldY,
              isPinching,
              active: true
            };

            if (isUserLeft) detectedLeft = handData;
            else detectedRight = handData;
          }
        }

        // Store world positions for Three.js cursors
        p.leftHandWorld = detectedLeft || { active: false, x: 0, y: 0 };
        p.rightHandWorld = detectedRight || { active: false, x: 0, y: 0 };

        setLeftHand({
          detected: !!detectedLeft,
          pinching: detectedLeft?.isPinching || false,
          x: Math.round(detectedLeft?.worldX || 0),
          y: Math.round(detectedLeft?.worldY || 0)
        });

        setRightHand({
          detected: !!detectedRight,
          pinching: detectedRight?.isPinching || false,
          x: Math.round(detectedRight?.worldX || 0),
          y: Math.round(detectedRight?.worldY || 0)
        });

        // ═════════════════════════════════════════════════════════════════════
        // INTUITIVE CATCH & PASS KINETIC ENGINE (Fixed!)
        // ═════════════════════════════════════════════════════════════════════

        // Velocity tracking for throwing
        if (detectedLeft) {
          p.leftVelocity = {
            x: (detectedLeft.worldX - p.lastLeftPos.x) * 0.6,
            y: (detectedLeft.worldY - p.lastLeftPos.y) * 0.6
          };
          p.lastLeftPos = { x: detectedLeft.worldX, y: detectedLeft.worldY };
        }
        if (detectedRight) {
          p.rightVelocity = {
            x: (detectedRight.worldX - p.lastRightPos.x) * 0.6,
            y: (detectedRight.worldY - p.lastRightPos.y) * 0.6
          };
          p.lastRightPos = { x: detectedRight.worldX, y: detectedRight.worldY };
        }

        const distLeft = detectedLeft ? Math.hypot(detectedLeft.worldX - p.x, detectedLeft.worldY - p.y) : 999;
        const distRight = detectedRight ? Math.hypot(detectedRight.worldX - p.x, detectedRight.worldY - p.y) : 999;

        // Catch Radius: Generous 2.6 units (Easy magnetic catch!)
        const CATCH_RADIUS = 2.6;

        // 1. TWO-HANDED HOLOGRAPHIC SCALING (Both hands grabbing)
        if (detectedLeft && detectedRight && distLeft < 3.2 && distRight < 3.2) {
          p.heldBy = 'both';
          p.isInFlight = false;
          setHeldByState('both');
          setInteractionStatus('TWO-HANDED HOLD: Spread hands apart to expand, push to shrink!');

          const handSpan = Math.hypot(detectedRight.worldX - detectedLeft.worldX, detectedRight.worldY - detectedLeft.worldY);
          if (p.prevHandDist !== null) {
            const scaleDelta = (handSpan - p.prevHandDist) * 0.45;
            p.scale = Math.max(0.4, Math.min(3.5, p.scale + scaleDelta));
            setHoloScale(parseFloat(p.scale.toFixed(2)));
            if (Math.abs(scaleDelta) > 0.04) audio.playScale();
          }
          p.prevHandDist = handSpan;

          // Centered between both hands
          p.x = (detectedLeft.worldX + detectedRight.worldX) / 2;
          p.y = (detectedLeft.worldY + detectedRight.worldY) / 2;
          p.rotY = Math.atan2(detectedRight.worldY - detectedLeft.worldY, detectedRight.worldX - detectedLeft.worldX);
        }
        // 2. CATCH OR HOLD WITH LEFT HAND
        else if (detectedLeft && (p.heldBy === 'left' || (!p.isInFlight && distLeft < CATCH_RADIUS))) {
          if (p.heldBy !== 'left') {
            audio.playCatch();
            setInteractionStatus('MAGNETIC CATCH IN LEFT HAND! Move hand to carry, flick to throw.');
          }
          p.heldBy = 'left';
          p.isInFlight = false;
          p.prevHandDist = null;
          setHeldByState('left');

          // Smoothly snap to palm
          p.x += (detectedLeft.worldX - p.x) * 0.45;
          p.y += (detectedLeft.worldY - p.y) * 0.45;
          p.vx = p.leftVelocity.x;
          p.vy = p.leftVelocity.y;

          // Throw detection: if hand makes a fast flick and opens
          if (Math.hypot(p.leftVelocity.x, p.leftVelocity.y) > 0.3) {
            p.heldBy = null;
            p.isInFlight = true;
            setHeldByState(null);
            audio.playBounce();
            setInteractionStatus('THROWN! Put your Right Hand in the way to CATCH!');
          }
        }
        // 3. CATCH OR HOLD WITH RIGHT HAND
        else if (detectedRight && (p.heldBy === 'right' || (!p.isInFlight && distRight < CATCH_RADIUS))) {
          if (p.heldBy !== 'right') {
            audio.playCatch();
            setInteractionStatus('MAGNETIC CATCH IN RIGHT HAND! Move hand to carry, flick to throw.');
          }
          p.heldBy = 'right';
          p.isInFlight = false;
          p.prevHandDist = null;
          setHeldByState('right');

          p.x += (detectedRight.worldX - p.x) * 0.45;
          p.y += (detectedRight.worldY - p.y) * 0.45;
          p.vx = p.rightVelocity.x;
          p.vy = p.rightVelocity.y;

          // Throw detection
          if (Math.hypot(p.rightVelocity.x, p.rightVelocity.y) > 0.3) {
            p.heldBy = null;
            p.isInFlight = true;
            setHeldByState(null);
            audio.playBounce();
            setInteractionStatus('THROWN! Put your Left Hand in the way to CATCH!');
          }
        }
        // 4. IN FLIGHT: CATCH OR BOUNCE BETWEEN HANDS
        else {
          p.prevHandDist = null;
          if (p.heldBy) {
            p.heldBy = null;
            p.isInFlight = true;
            setHeldByState(null);
          }

          // If in flight and approaches Left Hand: Catch or Bounce!
          if (p.isInFlight && detectedLeft && distLeft < 1.8) {
            if (detectedLeft.isPinching) {
              p.heldBy = 'left';
              p.isInFlight = false;
              setHeldByState('left');
              audio.playCatch();
              setInteractionStatus('CAUGHT BY LEFT HAND!');
            } else {
              // Kinetic Bounce!
              p.vx = Math.abs(p.vx) > 0.05 ? -p.vx * 1.05 : 0.22;
              p.vy += (p.y - detectedLeft.worldY) * 0.25;
              audio.playBounce();
              triggerSparks(p.x, p.y, p.z);
              setBouncesCount((b) => b + 1);
              setInteractionStatus('BOUNCED OFF LEFT PALM! Heading to Right Hand!');
            }
          }

          // If in flight and approaches Right Hand: Catch or Bounce!
          if (p.isInFlight && detectedRight && distRight < 1.8) {
            if (detectedRight.isPinching) {
              p.heldBy = 'right';
              p.isInFlight = false;
              setHeldByState('right');
              audio.playCatch();
              setInteractionStatus('CAUGHT BY RIGHT HAND!');
            } else {
              // Kinetic Bounce!
              p.vx = Math.abs(p.vx) > 0.05 ? -p.vx * 1.05 : -0.22;
              p.vy += (p.y - detectedRight.worldY) * 0.25;
              audio.playBounce();
              triggerSparks(p.x, p.y, p.z);
              setBouncesCount((b) => b + 1);
              setInteractionStatus('BOUNCED OFF RIGHT PALM! Heading to Left Hand!');
            }
          }
        }

        ctx.restore();
      });

      if (webcamRef.current) {
        camera = new CameraClass(webcamRef.current, {
          onFrame: async () => {
            if (isProcessingCamera.current) return;
            isProcessingCamera.current = true;
            try {
              if (webcamRef.current && hands) {
                await hands.send({ image: webcamRef.current });
              }
            } catch (err) {
              console.error(err);
            } finally {
              isProcessingCamera.current = false;
            }
          },
          width: 640,
          height: 480
        });
        camera.start();
      }
    };

    setupHands();

    return () => {
      isCancelled = true;
      if (camera) camera.stop();
      if (hands) hands.close();
    };
  }, []);

  return (
    <div className="holokinetic-container">
      {/* 3D WebGL Canvas */}
      <div ref={mountRef} className="three-canvas" />

      {/* AR Camera Feed */}
      <video
        ref={webcamRef}
        className={`camera-ar-underlay ${arFeedActive ? '' : 'hidden'}`}
        playsInline
        muted
        autoPlay
      />

      <div className="holo-grid-plane" />
      <div className="vignette-overlay" />

      {/* STARK HUD HEADER */}
      <header className="stark-hud-header">
        <div className="hud-title-cluster">
          <div className="arc-reactor-core" />
          <h1 className="hud-main-title">HoloKinetic</h1>
          <span className="hud-version-pill">STARK-OS v4.5</span>
        </div>

        <div className="hud-actions">
          {/* Snap Buttons for instant catch testing */}
          <button
            className="hud-btn"
            onClick={() => snapToHand('left')}
            title="Snap Shape to Left Hand (1)"
          >
            <Magnet size={14} color="#00f2fe" />
            <span>Snap Left [1]</span>
          </button>

          <button
            className="hud-btn"
            onClick={() => snapToHand('right')}
            title="Snap Shape to Right Hand (2)"
          >
            <Magnet size={14} color="#d946ef" />
            <span>Snap Right [2]</span>
          </button>

          <button
            className="hud-btn"
            onClick={tossToOtherHand}
            title="Pass/Toss between hands (Space or T)"
          >
            <ArrowRightLeft size={14} color="#ffb703" />
            <span>Toss [T]</span>
          </button>

          {/* Audio */}
          <button
            className={`hud-btn ${muted ? 'active' : ''}`}
            onClick={() => {
              setMuted(!muted);
              audio.muted = !muted;
            }}
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span>{muted ? 'MUTED' : 'AUDIO'}</span>
          </button>

          {/* AR Camera Toggle */}
          <button
            className={`hud-btn ${arFeedActive ? 'active' : ''}`}
            onClick={() => setArFeedActive(!arFeedActive)}
          >
            <CameraIcon size={14} />
            <span>{arFeedActive ? 'AR OVERLAY' : 'PURE HOLO'}</span>
          </button>

          {/* Switch Mode */}
          {onSwitchMode && (
            <button className="hud-btn" onClick={onSwitchMode}>
              <RotateCcw size={14} />
              <span>ChronoGrip</span>
            </button>
          )}
        </div>
      </header>

      {/* DUAL-HAND TELEMETRY (Left Side) */}
      <aside className="dual-hand-hud">
        {/* Left Hand Card */}
        <div className={`hand-telemetry-card ${leftHand.detected ? 'active' : ''}`}>
          <div className="hand-card-header">
            <span style={{ color: '#00f2fe' }}>LEFT PALM</span>
            <span className={`hand-status-indicator ${leftHand.detected ? 'detected' : 'searching'}`}>
              ● {leftHand.detected ? (heldByState === 'left' ? 'HOLDING' : 'READY') : 'NO HAND'}
            </span>
          </div>
          <div className="hand-metrics-grid">
            <div className="metric-cell">
              X: <span>{leftHand.x}</span>
            </div>
            <div className="metric-cell">
              Y: <span>{leftHand.y}</span>
            </div>
          </div>
        </div>

        {/* Right Hand Card */}
        <div className={`hand-telemetry-card ${rightHand.detected ? 'active' : ''}`}>
          <div className="hand-card-header">
            <span style={{ color: '#d946ef' }}>RIGHT PALM</span>
            <span className={`hand-status-indicator ${rightHand.detected ? 'detected' : 'searching'}`}>
              ● {rightHand.detected ? (heldByState === 'right' ? 'HOLDING' : 'READY') : 'NO HAND'}
            </span>
          </div>
          <div className="hand-metrics-grid">
            <div className="metric-cell">
              X: <span>{rightHand.x}</span>
            </div>
            <div className="metric-cell">
              Y: <span>{rightHand.y}</span>
            </div>
          </div>
        </div>

        {/* Kinetic Stats Card */}
        <div className="hand-telemetry-card" style={{ borderColor: 'rgba(255, 183, 3, 0.4)' }}>
          <div className="hand-card-header">
            <span style={{ color: '#ffb703' }}>KINETIC STATS</span>
            <span style={{ fontSize: '10px', color: '#10b981', fontFamily: 'JetBrains Mono' }}>
              {heldByState ? `HELD: ${heldByState.toUpperCase()}` : 'IN FLIGHT'}
            </span>
          </div>
          <div className="hand-metrics-grid">
            <div className="metric-cell">
              SCALE: <span>{holoScale}x</span>
            </div>
            <div className="metric-cell">
              BOUNCES: <span>{bouncesCount}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* RIGHT-SIDE HOLOGRAPHIC ARSENAL */}
      <aside className="holo-arsenal-rack">
        <div className="arsenal-header">
          <span>HOLO ARSENAL</span>
          <Sparkles size={13} />
        </div>

        {ARSENAL_SHAPES.map((shape) => (
          <div
            key={shape.id}
            className={`arsenal-item-card ${selectedShapeId === shape.id ? 'active' : ''}`}
            onClick={() => setSelectedShapeId(shape.id)}
          >
            <div className="item-icon-box">{shape.icon}</div>
            <div className="item-details">
              <span className="item-name">{shape.name}</span>
              <span className="item-sub">{shape.type}</span>
            </div>
          </div>
        ))}
      </aside>

      {/* Mini PIP Window */}
      <div className={`camera-floating-window-stark ${leftHand.detected || rightHand.detected ? 'tracking-active' : ''}`}>
        <div className="camera-window-header-stark">
          <span className="camera-title-stark">STARK TRACKING HUD</span>
          <span style={{ fontSize: '10px', color: '#10b981', fontFamily: 'JetBrains Mono' }}>
            {leftHand.detected && rightHand.detected ? '2 HANDS' : leftHand.detected || rightHand.detected ? '1 HAND' : 'SEARCHING'}
          </span>
        </div>
        <div className="camera-webcam-preview">
          <canvas
            ref={canvasRef}
            className="tracking-canvas-overlay"
            width={320}
            height={240}
          />
        </div>
      </div>

      {/* Center Dynamic Interaction Status */}
      <footer className="center-interaction-banner">
        <span className="hud-action-tag">STATUS</span>
        <span>{interactionStatus}</span>
      </footer>
    </div>
  );
}
