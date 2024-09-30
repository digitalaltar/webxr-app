import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// Global variables
let scene, camera, renderer, controls;
let albumCovers = [];
let raycaster = new THREE.Raycaster();
let currentFocusedCover = null;
let gazeTimer = null;
const gazeDuration = 2000; // 2 seconds of gaze to trigger interaction

const isMobile = /Mobi|Android/i.test(navigator.userAgent);
const useWebXR = !!navigator.xr;

// Initialize the scene
function init() {
  scene = new THREE.Scene();

  // Setup camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 3);  // Set camera height and distance from objects

  // Setup renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Add lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(0, 10, 10);
  scene.add(directionalLight);

  // Add ground plane
  const groundGeometry = new THREE.PlaneGeometry(10, 10);
  const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x008800 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Create album covers (simple cubes for now)
  createAlbumCovers();

  // Setup controls based on device type
  if (isMobile && useWebXR) {
    setupWebXRInline(); // Use WebXR on mobile if available
  } else if (isMobile && !useWebXR) {
    setupDeviceOrientationControls(); // Fallback to DeviceOrientation API on mobile
  } else {
    setupDesktopControls(); // Use OrbitControls on desktop
  }

  // Start the animation loop
  animate();
}

// Create album covers (cubes as placeholders)
function createAlbumCovers() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material1 = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Red
  const material2 = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Green
  const material3 = new THREE.MeshBasicMaterial({ color: 0x0000ff }); // Blue

  const cover1 = new THREE.Mesh(geometry, material1);
  const cover2 = new THREE.Mesh(geometry, material2);
  const cover3 = new THREE.Mesh(geometry, material3);

  cover1.position.set(-2, 0.5, -3);
  cover2.position.set(0, 0.5, -3);
  cover3.position.set(2, 0.5, -3);

  scene.add(cover1, cover2, cover3);
  albumCovers.push(cover1, cover2, cover3);
}

// Desktop controls using OrbitControls
function setupDesktopControls() {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;  // Add damping for smooth motion
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;  // Prevent camera from panning in 2D space
  controls.minDistance = 1;  // Set minimum zoom distance
  controls.maxDistance = 1000;  // Set maximum zoom distance
}

// WebXR setup for inline mode (non-immersive)
function setupWebXRInline() {
  navigator.xr.requestSession('inline').then((session) => {
    session.requestReferenceSpace('viewer').then((refSpace) => {
      renderer.xr.setReferenceSpaceType('local');
      renderer.xr.setSession(session);
      renderer.xr.setAnimationLoop(() => {
        renderer.render(scene, camera);
      });
    });
  });
}

// Fallback for DeviceOrientation API if WebXR is not available
function setupDeviceOrientationControls() {
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', (event) => {
      const alpha = event.alpha ? THREE.MathUtils.degToRad(event.alpha) : 0; // Z-axis (yaw)
      const beta = event.beta ? THREE.MathUtils.degToRad(event.beta) : 0; // X-axis (pitch)
      const gamma = event.gamma ? THREE.MathUtils.degToRad(event.gamma) : 0; // Y-axis (roll)
      camera.rotation.set(beta, alpha, gamma); // Apply rotation to camera
    }, true);
  } else {
    console.warn('DeviceOrientation API not supported.');
  }
}

// Detect gaze or mouse pointer interactions
function detectGaze() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera); // From the center of the screen

  const intersects = raycaster.intersectObjects(albumCovers);

  if (intersects.length > 0) {
    const focusedCover = intersects[0].object;

    // If focusing on a new object, start gaze timer
    if (focusedCover !== currentFocusedCover) {
      clearTimeout(gazeTimer);
      currentFocusedCover = focusedCover;

      gazeTimer = setTimeout(() => {
        triggerInteraction(focusedCover);
      }, gazeDuration);
    }
  } else {
    clearTimeout(gazeTimer);
    currentFocusedCover = null;
  }
}

// Trigger interaction (e.g., change color)
function triggerInteraction(cover) {
  cover.material.color.set(0xffff00); // Change to yellow
  console.log(`Focused on ${cover.position.x}`);
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  if (!isMobile && controls) {
    controls.update(); // Update OrbitControls on desktop
  }

  detectGaze(); // Detect gaze or pointer interaction
  renderer.render(scene, camera);
}

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initialize the scene
init();
