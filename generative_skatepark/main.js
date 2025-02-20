import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WaveFunctionCollapse2D, AdjacencyMatrix, SceneController  } from './common.js';

let scene, camera, renderer, controls, stats;
let wfc, scene_controller;
let heuristic;

const WIDTH = 15;
const HEIGHT = 15;

let timeout = 1;
function step(){
    if (!wfc.isDone()) {
        let wave = wfc.step();
        scene_controller.draw_scene(scene, wave.wave);
        console.log('Step');
        setTimeout(step, timeout);
    }
    else {
        let wave = wfc.getOutput();
        scene_controller.draw_scene(scene, wave);
        console.log('Finished');
    }
}

async function init() {

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);

    // Simple lights for better visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    heuristic =
    {
        "bowl-corner-inner": {
          "simmetry": 4,
          "up": [
            "floor-wood 0"
          ],
          "right": [
            "bowl-side 0",
            "bowl-corner-inner 270"
          ],
          "down": [
            "bowl-corner-inner 90",
            "bowl-side 90"
          ],
          "left": [
            "floor-wood 0"
          ]
        },
        "floor-wood": {
          "simmetry": 1,
          "up": [
            "floor-wood 0",
            "bowl-corner-inner 90",
            "bowl-side 180",
            "bowl-corner-inner 180"
          ],
          "right": [
            "floor-wood 0",
            "bowl-corner-inner 0",
            "bowl-corner-inner 90",
            "bowl-side 90"
          ],
          "down": [
            "floor-wood 0",
            "bowl-corner-inner 0",
            "bowl-side 0",
            "bowl-corner-inner 270"
          ],
          "left": [
            "floor-wood 0",
            "bowl-corner-inner 270",
            "bowl-corner-inner 180",
            "bowl-side 270"
          ]
        },
        "bowl-side": {
          "simmetry": 4,
          "up": [
            "floor-wood 0"
          ],
          "right": [
            "bowl-side 0",
            "bowl-corner-inner 270"
          ],
          "down": [
            "bowl-side 180"
          ],
          "left": [
            "bowl-corner-inner 0",
            "bowl-side 0"
          ]
        }
      }

    scene_controller = new SceneController(Object.keys(heuristic));
    await scene_controller.load_objects();

    camera.position.set(WIDTH * 1.5, 20, HEIGHT * 1.5);
    camera.lookAt(WIDTH * 0.5, 0, HEIGHT * 0.5);
    camera.updateProjectionMatrix();

    // --- Initial conditions ---
    // let initial_conds = [];

    // // Set corners
    // initial_conds.push({ x: 0, y: 0, value: 'bowl-corner-inner 0' });
    // initial_conds.push({ x: WIDTH - 1, y: 0, value: 'bowl-corner-inner 270' });
    // initial_conds.push({ x: 0, y: HEIGHT - 1, value: 'bowl-corner-inner 90' });
    // initial_conds.push({ x: WIDTH - 1, y: HEIGHT - 1, value: 'bowl-corner-inner 180' });

    // // Set sides
    // for (let x = 1; x < WIDTH - 1; x++) {
    //     initial_conds.push({ x: x, y: 0, value: 'bowl-side 0' });
    //     initial_conds.push({ x: x, y: HEIGHT - 1, value: 'bowl-side 180' });
    // }

    // for (let y = 1; y < HEIGHT - 1; y++) {
    //     initial_conds.push({ x: 0, y: y, value: 'bowl-side 90' });
    //     initial_conds.push({ x: WIDTH - 1, y: y, value: 'bowl-side 270' });
    // }

    const data = new AdjacencyMatrix(heuristic).get_adjacency_matrix()
    wfc = new WaveFunctionCollapse2D(WIDTH, HEIGHT, data);

    // Start stepping
    step();

    animate();
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    controls.update();

}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Check on a key pressed
window.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
        // Read JSON from clipboard
        const clipboardContents = await navigator.clipboard.read();
        for (const item of clipboardContents) {
            for (const mimeType of item.types) {
                if (mimeType === "text/plain") {
                    const blob = await item.getType("text/plain");
                    const blobText = await blob.text();

                    let heuristic = JSON.parse(blobText);
                    if (heuristic) {
                        scene_controller = new SceneController(Object.keys(heuristic));
                        await scene_controller.load_objects();
                        const data = new AdjacencyMatrix(heuristic).get_adjacency_matrix()
                        wfc.reset(data);
                        step();
                    } else {
                        throw new Error("Invalid JSON.");
                    }
                } else {
                    throw new Error(`${mimeType} not supported.`);
                }
            }
        }
    }
});

init();