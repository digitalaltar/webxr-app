// Imports
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { VRButton } from 'three/examples/jsm/webxr/VRButton';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory'; // Keep this for future VR
import { createNoise2D } from 'simplex-noise';  // Use named export

// Variables
let scene, camera, renderer, controls;
let albumCovers = [];
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let clickedCube = null;  // Keep track of the currently clicked cube
let spinningCubes = new Set(); // Set to track which cubes are spinning
let clouds = [];
let cloudVelocities = [];
let cloudSizes = [];
let cloudOpacities = [];
let isWebXR = false;  // Track whether we're in WebXR mode

// Simplex noise for organic movement
const noise2D = createNoise2D();  // Create the noise generator

// Gaze
const gazeDuration = 2000; // 2 seconds of gaze to trigger interaction

// Initialize the scene
function init() {
  scene = new THREE.Scene();
  
  // Set the background color of the scene to a sky-like color
  scene.background = new THREE.Color(0x87CEEB); // Light sky-blue background
  
  // Setup camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(1, 2, 5);
  camera.lookAt(new THREE.Vector3(0, 1.6, 0));  // Ensure the camera is looking straight ahead

  // Setup renderer with WebXR support
  renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true; // Enable WebXR
  document.body.appendChild(renderer.domElement);

  // Add lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
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
        isWebXR = true;
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
  requestAnimationFrame(animateSpin);
}

// Add cloud particles to the scene
function addClouds() {
  const cloudTexture = new THREE.TextureLoader().load('./scene/cloud.png');
  
  const cloudGeometry = new THREE.BufferGeometry();
  const cloudCount = 2000;  // Number of particles
  const positions = [];
  const colors = [];

  for (let i = 0; i < cloudCount; i++) {
    const x = Math.random() * 200 - 100;
    const y = Math.random() * 50 - 25;
    const z = Math.random() * 200 - 100;

    positions.push(x, y, z);

    // Assign random velocities to each cloud particle for organic movement
    cloudVelocities.push({
      x: (Math.random() - 0.5) * 0.01,
      y: (Math.random() - 0.5) * 0.01,
      z: (Math.random() - 0.5) * 0.01
    });

    // Random initial size and opacity for clouds
    cloudSizes.push(Math.random() * 5 + 5); // Initial size
    cloudOpacities.push(Math.random() * 0.4 + 0.3); // Initial opacity

    // Color variation (white to light purple)
    const color = new THREE.Color(0xffffff);  // Start with white
    const purpleTint = Math.random() * 1;   // Adding a random purple tint
    color.r += purpleTint; // Slightly increase the red
    color.b += purpleTint; // Slightly increase the blue (purple)
    colors.push(color.r, color.g, color.b);
  }

  cloudGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  cloudGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const cloudMaterial = new THREE.PointsMaterial({
    map: cloudTexture,
    size: 10,  // This will be dynamically adjusted
    vertexColors: true,  // Enable per-particle color
    transparent: true,
    opacity: 0.7,  // This will also be dynamically adjusted
    depthWrite: false
  });

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

// Base cubeMaterial without the texture reference
const cubeMaterial = new THREE.ShaderMaterial({
  uniforms: {
    map: { value: null },       // We'll assign the texture dynamically per cube
    exposure: { value: 1 },   // Control exposure
    emissive: { value: new THREE.Color(0x000000) },  // Emissive color (initially no glow)
    emissiveIntensity: { value: 0.0 }                // Emissive intensity (initially no glow)
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;  // Pass UV coordinates to fragment shader
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D map;
    uniform float exposure;
    uniform vec3 emissive;         // Emissive color
    uniform float emissiveIntensity;  // Emissive intensity
    varying vec2 vUv;

    void main() {
      vec4 texColor = texture2D(map, vUv);  // Sample the texture using UVs
      texColor.rgb *= exposure;             // Apply exposure adjustment
      texColor.rgb += emissive * emissiveIntensity;  // Apply emissive effect
      gl_FragColor = vec4(texColor.rgb, texColor.a);
    }
  `,
  transparent: false
});

// Create album covers (cubes) for each experience
function createAlbumCovers(config) {
  const loader = new THREE.TextureLoader();
  
  // Loop through each experience in the config
  config.experiences.forEach((experience, index) => {
    const texturePath = `${config.basePath}${experience.folder}/${config.coverFile}`;
    
    // Load the texture for the cube face
    loader.load(texturePath, (texture) => {
      texture.colorSpace = THREE.LinearSRGBColorSpace; // Ensure the texture is using the correct color space
      
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      
      // Clone the base material for each cube and set its unique texture
      const cubeMaterialClone = cubeMaterial.clone();
      cubeMaterialClone.uniforms.map.value = texture;  // Assign the unique texture to each cube
      
      const cube = new THREE.Mesh(geometry, cubeMaterialClone);
      
      // Position each cube with some spacing, and bring closer (Z=-1.5)
      cube.position.set(-2 + index * 2, 1, -1.5); // Adjust the spacing and Z position
      cube.name = experience.name;
      
      // Add the cube to the scene
      scene.add(cube);
      
      // Push cube into the albumCovers array for interaction and raycasting
      albumCovers.push(cube);
    });
  });
}

// Handle mouse click and raycasting for click effect
function onMouseClick(event) {
  // Convert mouse position to normalized device coordinates (-1 to +1 range)
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // Use raycaster to detect which cube was clicked
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(albumCovers);

  if (intersects.length > 0) {
    const cube = intersects[0].object;

    // Toggle the clicked cube's emissive color and spinning state
    if (clickedCube !== cube) {
      // Reset the previously clicked cube's state (stop glow, spin, and move down)
      if (clickedCube) {
        clickedCube.material.uniforms.emissive.value.set(0x000000);  // Reset emissive color (no glow)
        clickedCube.material.uniforms.emissiveIntensity.value = 0;   // Reset emissive intensity
        clickedCube.position.y -= 0.2;  // Move the cube down
        spinningCubes.delete(clickedCube);  // Stop spinning the previous cube
      }

      // Set the new clicked cube
      clickedCube = cube;
      clickedCube.material.uniforms.emissive.value.set(0x5D3FD3);  // Set emissive color (glow effect)
      clickedCube.material.uniforms.emissiveIntensity.value = 1;   // Set emissive intensity
      clickedCube.position.y += 0.2;  // Move the cube up
      spinningCubes.add(clickedCube);  // Start spinning the clicked cube

    } else {
      // If the same cube is clicked again, reset its emissive color and stop spinning
      clickedCube.material.uniforms.emissive.value.set(0x000000);  // Reset emissive color (no glow)
      clickedCube.material.uniforms.emissiveIntensity.value = 0;   // Reset emissive intensity
      clickedCube.position.y -= 0.2;  // Move the cube down 
      spinningCubes.delete(clickedCube);  // Stop spinning the cube
      clickedCube = null;  // Deselect the cube
    }
  }
}

// Function to animate the spinning cubes
function animateSpin() {
  const spinSpeed = 0.02; // Adjust the spin speed

  // Loop over each cube in the spinning set and rotate it
  spinningCubes.forEach(cube => {
    cube.rotation.y += spinSpeed; // Rotate around the Y-axis
  });

  // Continue the animation loop
  requestAnimationFrame(animateSpin);
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
  controls.minDistance = 1;  // Set minimum zoom distance
  controls.maxDistance = 40;  // Set maximum zoom distance


    // Add mousedown listener for desktop mode
    window.addEventListener('mousedown', onMouseClick, false);

    // Add a touchstart listener for mobile
    window.addEventListener('touchstart', onTouchStart, false);

}

// Function to handle touchstart event by simulating a mousedown event
function onTouchStart(event) {
    // Prevent default behavior (such as scrolling or zooming)
    event.preventDefault();
    
    // Use the first touch point (in case of multitouch)
    const touch = event.changedTouches[0];

    // Simulate a mouse click based on touch position
    const simulatedEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,   // Use the touch's X position
        clientY: touch.clientY,   // Use the touch's Y position
        bubbles: true             // Allow event bubbling
    });

    // Dispatch the simulated event so it gets handled by the onMouseClick function
    event.target.dispatchEvent(simulatedEvent);
}

// Animate function
function animate() {
  requestAnimationFrame(animate);

  const positions = clouds.geometry.attributes.position.array;
  const time = performance.now() * 0.001;  // Time variable for smooth transitions
  const maxDistance = 50;   // Maximum distance clouds can drift before being pulled back
  const attractionStrength = 0.005; // How strongly to pull clouds back to the center

  // Move each cloud point based on its velocity and noise for organic movement
  for (let i = 0; i < positions.length; i += 3) {
    // Apply Simplex noise to each axis with a slight random time offset for each particle
    const noiseX = 0.002 * noise2D(time + i, positions[i]);      // Apply noise to X
    const noiseY = 0.002 * noise2D(time + i + 1000, positions[i + 1]);  // Apply noise to Y
    const noiseZ = 0.002 * noise2D(time + i + 2000, positions[i + 2]);  // Apply noise to Z

    // Update the position based on velocity and noise (adding subtle shifts)
    positions[i] += cloudVelocities[i / 3].x + noiseX;  // X axis
    positions[i + 1] += cloudVelocities[i / 3].y + noiseY;  // Y axis
    positions[i + 2] += cloudVelocities[i / 3].z + noiseZ;  // Z axis

    // Softly attract clouds back to the center if they drift too far (to prevent them from spreading too much)
    const distanceFromCenter = Math.sqrt(positions[i]**2 + positions[i+1]**2 + positions[i+2]**2);
    if (distanceFromCenter > maxDistance) {
      const directionToCenterX = -positions[i] / distanceFromCenter;
      const directionToCenterY = -positions[i+1] / distanceFromCenter;
      const directionToCenterZ = -positions[i+2] / distanceFromCenter;

      // Gently move the cloud particle back toward the center
      positions[i] += directionToCenterX * attractionStrength;
      positions[i+1] += directionToCenterY * attractionStrength;
      positions[i+2] += directionToCenterZ * attractionStrength;
    }
  }

  // Notify Three.js that the positions have been updated
  clouds.geometry.attributes.position.needsUpdate = true;

  if (controls) {
    controls.update();  // Update controls for OrbitControls
  }

  renderer.render(scene, camera);  // Render the scene with updated positions
}

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initialize the scene
init();

console.log('Version 0.0.3m');
