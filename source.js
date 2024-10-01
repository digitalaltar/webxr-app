import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { VRButton } from 'three/examples/jsm/webxr/VRButton';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory'; // Keep this for future VR

let scene, camera, renderer, controls;
let albumCovers = [];
let raycaster = new THREE.Raycaster();
let currentFocusedCover = null;
let gazeTimer = null;
let clouds = [];
let cloudVelocities = [];

const gazeDuration = 2000; // 2 seconds of gaze to trigger interaction

// Initialize the scene
function init() {
  scene = new THREE.Scene();
  
  // Set the background color of the scene to a sky-like color
  scene.background = new THREE.Color(0x87CEEB); // Light sky-blue background
  
  // Add exponential fog to the scene for cloud-like effect
  scene.fog = new THREE.FogExp2(0xFFFFFF, 0.15); // White fog with a higher density for a cloud-like effect

  // Setup camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(1, 2, 5);  // Move the camera farther back for more fog interaction
  camera.lookAt(new THREE.Vector3(0, 1.6, 0));  // Ensure the camera is looking straight ahead

  // Setup renderer with WebXR support
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true; // Enable WebXR
  document.body.appendChild(renderer.domElement);

  // Add lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3); // Lower intensity to see the fog effect more clearly
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7); // Dimmed directional light
  directionalLight.position.set(0, 10, 10);
  scene.add(directionalLight);

  // Add clouds to the scene
  addClouds();

  // Load external JSON and create album covers (cubes for each experience)
  loadConfigAndCreateCubes();

  // Check if WebXR is supported and add the VRButton only if it is
  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
      if (supported) {
        document.body.appendChild(VRButton.createButton(renderer)); // Add VR Button only if VR is supported
        setupWebXRInline(); // Set up WebXR
      } else {
        console.log("WebXR not supported, falling back to OrbitControls.");
        setupDesktopControls(); // Fall back to OrbitControls if WebXR is not supported
      }
    });
  } else {
    console.log("WebXR not available, falling back to OrbitControls.");
    setupDesktopControls(); // Fall back to OrbitControls if WebXR is unavailable
  }

  // Start the animation loop
  animate();
}

// Add cloud particles to the scene
function addClouds() {
  const cloudTexture = new THREE.TextureLoader().load('./scene/cloud.png');

  const cloudMaterial = new THREE.PointsMaterial({
    map: cloudTexture,
    size: 5,  // Adjust the size of each cloud particle
    transparent: true,
    opacity: 0.6,
    depthWrite: false // Prevents depth write to give a soft cloud effect
  });

  const cloudGeometry = new THREE.BufferGeometry();
  const cloudCount = 2000;
  const positions = [];

  for (let i = 0; i < cloudCount; i++) {
    const x = Math.random() * 200 - 100;
    const y = Math.random() * 50 - 25;
    const z = Math.random() * 200 - 100;

    positions.push(x, y, z);

    // Assign random velocities to each cloud particle
    cloudVelocities.push({
      x: (Math.random() - 0.5) * 0.01,  // Random speed on X axis
      y: (Math.random() - 0.5) * 0.01,  // Random speed on Y axis
      z: (Math.random() - 0.5) * 0.01,  // Random speed on Z axis
    });
  }

  cloudGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  clouds = new THREE.Points(cloudGeometry, cloudMaterial);
  scene.add(clouds);
}

// Load the external experiences.json and create cubes
function loadConfigAndCreateCubes() {
  fetch('./experiences.json')
    .then((response) => response.json())
    .then((config) => {
      createAlbumCovers(config);
    })
    .catch((error) => {
      console.error('Error loading JSON:', error);
    });
}

// Create album covers (cubes) for each experience
function createAlbumCovers(config) {
  const loader = new THREE.TextureLoader();
  
  // Loop through each experience in the config
  config.experiences.forEach((experience, index) => {
    const texturePath = `${config.basePath}${experience.folder}/${config.coverFile}`;
    
    // Load the texture for the cube face
    loader.load(texturePath, (texture) => {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      
      // Create a material for each face using the cover texture
      const materialArray = [
        new THREE.MeshBasicMaterial({ map: texture }), // right face
        new THREE.MeshBasicMaterial({ map: texture }), // left face
        new THREE.MeshBasicMaterial({ map: texture }), // top face
        new THREE.MeshBasicMaterial({ map: texture }), // bottom face
        new THREE.MeshBasicMaterial({ map: texture }), // front face
        new THREE.MeshBasicMaterial({ map: texture })  // back face
      ];
      
      const cube = new THREE.Mesh(geometry, materialArray);
      
      // Position each cube with some spacing, bring closer (Z=-1.5)
      cube.position.set(-2 + index * 2, 1, -1.5);
      cube.name = experience.name;
      
      scene.add(cube);
      albumCovers.push(cube);
    });
  });
}

// Setup VR/WebXR for inline mode (non-immersive)
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

// Desktop controls using OrbitControls
function setupDesktopControls() {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.screenSpacePanning = false;  // Prevent panning
  controls.minDistance = 0.5;  // Set minimum zoom distance
  controls.maxDistance = 1000;  // Set maximum zoom distance
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
  cover.material[0].color.set(0xffff00); // Change to yellow for the first material face
  console.log(`Focused on ${cover.name}`);
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Move clouds along the X axis for a drifting effect
  const positions = clouds.geometry.attributes.position.array;

  // Move each cloud point based on its velocity
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] += cloudVelocities[i / 3].x; // X axis
    positions[i + 1] += cloudVelocities[i / 3].y; // Y axis
    positions[i + 2] += cloudVelocities[i / 3].z; // Z axis
  }

  // Update position attributes
  clouds.geometry.attributes.position.needsUpdate = true;

  if (controls) {
    controls.update(); // Update OrbitControls on desktop/mobile
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

console.log('Version 0.0.2b');
