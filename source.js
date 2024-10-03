// Imports
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { VRButton } from 'three/examples/jsm/webxr/VRButton';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory'; // Keep this for future VR
import { createNoise2D } from 'simplex-noise';  // Use named export
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

// Variables
let scene, camera, renderer, controls;
let albumCovers = [];
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let clickedCube = null;  // Keep track of the currently clicked cube
let spinningCubes = new Set(); // Set to track which cubes are spinning
let playingCube = null;
let clouds = [];
let cloudVelocities = [];
let cloudSizes = [];
let cloudOpacities = [];
let isWebXR = false;  // Track whether we're in WebXR mode
let css3DRenderer;
let config;
let currentCubeIndex = 0; // Track the index of the currently playing cube
let audioContext;

// Simplex noise for organic movement
const noise2D = createNoise2D();  // Create the noise generator

// Gaze
const gazeDuration = 2000; // 2 seconds of gaze to trigger interaction

// Initialize the scene
function init() {

  scene = new THREE.Scene();

    // Setup CSS3DRenderer
    css3DRenderer = new CSS3DRenderer();
    css3DRenderer.setSize(window.innerWidth, window.innerHeight);
    css3DRenderer.domElement.style.position = 'absolute';
    css3DRenderer.domElement.style.top = '0';
    document.body.appendChild(css3DRenderer.domElement);
    css3DRenderer.domElement.style.pointerEvents = 'none';

  // Set the background color of the scene to a sky-like color
  scene.background = new THREE.Color(0xead6e5); // Light sky-blue background
  
  // Setup camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1, 5);
  camera.lookAt(new THREE.Vector3(0, 7, 0));  // Ensure the camera is looking straight ahead

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

  // Add audio player
    createAudioPlayerInScene();

  // Load the background model
  loadBackgroundModel();

  // Start the animation loop
  animate();
}

// Load the GLB model
function loadBackgroundModel() {
  const loader = new GLTFLoader();

  // Set up Draco loader
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('./wasm/'); // Path to Draco decoder files
  loader.setDRACOLoader(dracoLoader);

  const modelUrl = './scene/first-sequence.glb'; // Set path to your GLB model

  loader.load(modelUrl, (gltf) => {
    const model = gltf.scene;

    model.position.set(0, -3, -13); // Position the model in the background
    model.scale.set(8, 8, 8); // Scale the model 2x in all directions

    model.traverse((child) => {
      if (child.isMesh) {
        child.material.emissive.set(0xFFFFFF); // Set emissive color (green here)
        child.material.emissiveIntensity = 0.50; // Set lightness/emission intensity
        child.material.transparent = true;
        child.material.opacity = .50; // Set opacity (0.0 to 1.0)
      }
    });

    scene.add(model);
  });
}

// Create Audio Player
function createAudioPlayerInScene() {
    // Create a container div for both the audio player and the cube name
    const container = document.createElement('div');
    container.id = 'media-container';  // Use the CSS class
    document.body.appendChild(container);

    // Create a heading for the cube name
    const cubeNameHeading = document.createElement('h3');
    cubeNameHeading.id = 'cube-name-heading';  // Use the CSS class
    container.appendChild(cubeNameHeading);

    // Create the audio element
    const audioElement = document.createElement('audio');
    audioElement.id = 'audio-player';
    audioElement.controls = true;
    audioElement.src = ''; // Your audio source
    container.appendChild(audioElement);

    // Hide the container initially
    container.style.display = 'none';

    // Store the audio element and the heading for later reference
    window.audioElement = audioElement;
    window.cubeNameHeading = cubeNameHeading;
    window.audioContainer = container;

    // Function to hide the audio player
    function hideAudioPlayer() {
        container.style.display = 'none';
        if (playingCube) {
            resetCubeState(playingCube);  // Reset the current playing cube
        }
    }

    // Function to show the audio player
    function showAudioPlayer() {
        container.style.display = 'block';
        if (playingCube) {
            activateCube(playingCube);  // Reset the current playing cube
        }
    }

    // Event listeners to hide the player when audio stops
    audioElement.addEventListener('pause', hideAudioPlayer);
    audioElement.addEventListener('seeking', showAudioPlayer);
    audioElement.addEventListener('seeked', showAudioPlayer);
    audioElement.addEventListener('ended', () => {
      console.log('Audio ended, moving to the next cube.');
      
      // Deactivate the current cube (reset its state)
      if (playingCube) {
        resetCubeState(playingCube);
        playingCube = null; // Clear the playingCube reference
      }
      
      // Find the next cube in the sequence
      currentCubeIndex = (currentCubeIndex + 1) % albumCovers.length;  // Loop to the first cube after the last one
      const nextCube = albumCovers[currentCubeIndex];
      const nextExperience = config.experiences[currentCubeIndex];
      
      // Activate the next cube and play its audio
      handleAudioPlayback(nextCube, nextExperience, currentCubeIndex);
    });

    // Event listener to show the player when audio plays
    audioElement.addEventListener('play', showAudioPlayer);

    // Manual trigger to show the player when the user interacts
    window.showAudioPlayer = function () {
        audioElement.style.display = 'block';
        audioElement.play(); // Start playing when shown
    };
}

// Audio Analysis Setup
function setupAudioAnalysis() {
  const audioElement = document.getElementById('audio-player');

  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    if (!audioElement.sourceNode) {
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaElementSource(audioElement);

      source.connect(analyser);
      analyser.connect(audioContext.destination);

      analyser.fftSize = 64;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // Store sourceNode and analyser globally
      audioElement.sourceNode = source;
      window.analyser = analyser;
      window.dataArray = dataArray;
    }
  }
}

// Sound Wave Bars
function createSoundWave() {
  const waveContainer = document.getElementById('sound-wave');
  waveContainer.innerHTML = ''; // Clear previous bars

  for (let i = 0; i < 32; i++) {
    const bar = document.createElement('div');
    bar.classList.add('wave-bar');
    waveContainer.appendChild(bar);
  }

  setupAudioAnalysis();
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
    .then((jsonData) => {
      config = jsonData;  // Store the JSON data in the global config variable
      createAlbumCovers(config);  // Create cubes based on the loaded config
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
      cube.position.set(-2 + index * 2, 0, 0); // Adjust the spacing and Z position
      cube.originalPosition = cube.position.clone();  // Store the original position
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
    const experience = config.experiences.find(e => e.name === cube.name);

    // Handle audio playback for the clicked cube
    if (experience) {
        const clickedCubeIndex = config.experiences.findIndex(e => e.name === cube.name);

        // Update currentCubeIndex to match the clicked cube
        currentCubeIndex = clickedCubeIndex;

        // Handle audio playback for the clicked cube
        handleAudioPlayback(cube, experience, currentCubeIndex);
    }

    // Reset the previously clicked cube and playing cube if necessary
    if (clickedCube && clickedCube !== cube) {
      resetCubeState(clickedCube);  // Reset the previous cube's state
      clickedCube = null;
    }

    if (playingCube && playingCube !== cube) {
      resetCubeState(playingCube);  // Reset the previous playing cube's state
      playingCube = null;
    }

    // Set the newly clicked cube and activate it
    clickedCube = cube;
    activateCube(cube);
  }
}

// Function to activate the cube
function activateCube(cube) {
  // Ensure the cube has an original position stored
  if (!cube.originalPosition) {
    cube.originalPosition = cube.position.clone();  // Store the original position
  }

  // Set the cube's position to its original position and add 0.1 to the Y-axis
  const newPosition = cube.originalPosition.clone();
  newPosition.y += 0.2;
  cube.position.copy(newPosition);  // Apply the new position with the modified Y value

  cube.material.uniforms.emissive.value.set(0x5D3FD3);  // Set glow color
  cube.material.uniforms.emissiveIntensity.value = 1;   // Set emissive intensity
  spinningCubes.add(cube);  // Start spinning the cube
  console.log('cube activated');
}

// Function to reset the cube's state (position, emissive color, and stop spinning)
function resetCubeState(cube) {
  if (cube) {
    // Reset the cube's position to its original Y position
    cube.position.copy(cube.originalPosition);

    // Reset the emissive color and intensity
    cube.material.uniforms.emissive.value.set(0x000000);  // Reset emissive color (no glow)
    cube.material.uniforms.emissiveIntensity.value = 0;   // Reset emissive intensity

    // Stop the spinning by removing the cube from the spinningCubes set
    spinningCubes.delete(cube);
  }
}

// Handle audio playback
function handleAudioPlayback(cube, experience, index) {

  const songIndex = currentCubeIndex + 1;

  if (playingCube === cube) {
    if (!window.audioElement.paused) {
      window.audioElement.pause();
      console.log('Audio paused.');
    } else {
      window.audioElement.play().then(() => {
        console.log('Audio resumed.');
        window.audioElement.style.display = 'block';
        updateNowPlaying(songIndex, cube.name);
        activateCube(cube);  // Reactivate the cube when audio resumes
      }).catch(error => {
        console.error('Audio resume failed:', error);
      });
    }
  } else {
    if (playingCube) {
      window.audioElement.pause();
      resetCubeState(playingCube);  // Reset the previously playing cube
      console.log('Previous audio paused.');
      window.audioElement.style.display = 'none';
    }

    const songPath = `${config.basePath}${experience.folder}/${config.audioFile}`;
    window.audioElement.src = songPath;

    setTimeout(() => {
        window.audioElement.play().then(() => {
          console.log('Audio is playing.');
          window.audioElement.style.display = 'block';
          updateNowPlaying(songIndex, cube.name);
          playingCube = cube;
          currentCubeIndex = index; // Store the index of the current cube
          activateCube(cube);  // Activate the cube when new audio starts
        }).catch(error => {
          console.error('Audio play failed:', error);
          window.audioElement.style.display = 'none';
        });
    }, 200);  // 200ms delay
  }
}

// Update Now Playing
function updateNowPlaying(songIndex, cubeName) {

    setupAudioAnalysis();

    // Create a new span element
    const nowPlayingSpan = document.createElement('span');
    nowPlayingSpan.classList.add('playing');  // Add the "playing" class
    nowPlayingSpan.textContent = 'Now Playing';  // Set the text content

    // Clear previous content in cubeNameHeading
    while (window.cubeNameHeading.firstChild) {
        window.cubeNameHeading.removeChild(window.cubeNameHeading.firstChild);
    }

    // Append the new span to cubeNameHeading
    window.cubeNameHeading.appendChild(nowPlayingSpan);

    // Create the container for scrolling text if it doesn't exist
    let scrollContainer = window.cubeNameHeading.querySelector('.scroll-container');
    if (!scrollContainer) {
        scrollContainer = document.createElement('span');
        scrollContainer.classList.add('scroll-container');
        window.cubeNameHeading.appendChild(scrollContainer);
    }

    // Create or update the scrolling text
    let span = scrollContainer.querySelector('span');
    if (!span) {
        span = document.createElement('span');
        scrollContainer.appendChild(span);
    }
    span.textContent = `Track ${songIndex} - ${cubeName}`;

    // Add sound wave container if not already present
    let soundWave = document.getElementById('sound-wave');
    if (!soundWave) {
        soundWave = document.createElement('div');
        soundWave.id = 'sound-wave';
        window.cubeNameHeading.appendChild(soundWave);  // Append to the heading area
    }

    // Clear old bars and create the new sound wave bars
    createSoundWave();
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

    // Add a touchend listener for mobile
    window.addEventListener('touchend', onTouchEnd, false);
}

// Function to handle touchstart event by simulating a mousedown event
function onTouchEnd(event) {
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

  // Rotate spinning cubes
  const spinSpeed = 0.01; // Adjust the spin speed
  spinningCubes.forEach(cube => {
    cube.rotation.y += spinSpeed; // Rotate around the Y-axis
  });

  // Audio Analysis
  if (window.analyser && window.dataArray) {
    window.analyser.getByteFrequencyData(window.dataArray);
    const bars = document.querySelectorAll('.wave-bar');
    
    bars.forEach((bar, index) => {
      const scaleY = (window.dataArray[index] / 255) * 2;  // Adjust the scale factor as needed
      bar.style.transform = `scaleY(${scaleY})`;
    });
  }

  if (controls) {
    controls.update();  // Update controls for OrbitControls
  }

    // Render WebGL and CSS3D layers
    renderer.render(scene, camera);
    css3DRenderer.render(scene, camera);

  requestAnimationFrame(animate);
}

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initialize the scene
init();

console.log('Version 0.0.11');

