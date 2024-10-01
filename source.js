import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { VRButton } from 'three/examples/jsm/webxr/VRButton';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory'; // Keep this for future VR

let scene, camera, renderer, controls;
let albumCovers = [];
let raycaster = new THREE.Raycaster();
let currentFocusedCover = null;
let gazeTimer = null;
const gazeDuration = 2000; // 2 seconds of gaze to trigger interaction

// Initialize the scene
function init() {
  scene = new THREE.Scene();

    // Setup camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(1, 1, 2);  // Move the camera closer to the cubes (Z=2)
    camera.lookAt(new THREE.Vector3(0, 1.6, 0));  // Ensure the camera is looking straight ahead

  // Setup renderer with WebXR support
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true; // Enable WebXR
  document.body.appendChild(renderer.domElement);

  // Add lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(0, 10, 10);
  scene.add(directionalLight);

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

console.log('Version 0.0.1aa');
