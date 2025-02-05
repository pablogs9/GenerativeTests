import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AdjacencyMatrix, SceneController } from './common.js';


let scene, camera, renderer, controls, stats, raycaster, mouse;
let wfc, scene_controller;

// Utils for UI
let selected_tile = null;
let is_dragging = false;
let is_alt_drag = false;
let init_alt_drag = [0, 0];
let plane;

const all_objects = {
    'bowl-corner-inner': { simmetry: 4 },
    'bowl-corner-outer': { simmetry: 4 },
    'bowl-side': { simmetry: 4 },
    'floor-concrete': { simmetry: 1 },
    'floor-wood': { simmetry: 1 },
    'half-pipe': { simmetry: 4 },
    'obstacle-box': { simmetry: 4 },
    'obstacle-end': { simmetry: 4 },
    'obstacle-middle': { simmetry: 4 },
    'pallet': { simmetry: 4 },
    'rail-curve': { simmetry: 2 },
    'rail-high': { simmetry: 2 },
    'rail-low': { simmetry: 2 },
    'rail-slope': { simmetry: 4 },
    'skateboard': { simmetry: 4 },
    'steps': { simmetry: 4 },
    'structure-platform': { simmetry: 4 },
    'structure-wood': { simmetry: 4 },
};

function saveState() {
    const state = scene_controller.placed_tiles.map(tile => ({
        item: tile.userData.item,        // the tile type/name
        x: tile.userData.x,              // grid x position
        y: tile.userData.y,              // grid y position
        rotation: tile.rotation.y        // rotation (in radians)
    }));
    localStorage.setItem('sceneState', JSON.stringify(state));
}

function loadState() {
    const saved = localStorage.getItem('sceneState');
    if (saved) {
        const tilesData = JSON.parse(saved);
        tilesData.forEach(tileData => {
            // Retrieve a template for this tile type.
            // (You might have stored your templates when loading objects.)
            const template = scene_controller.objects
                ? scene_controller.objects[tileData.item]
                : null;
            if (template) {
                const newTile = template.clone();
                newTile.userData.store = false;  // mark as placed, not in the store
                newTile.userData.tile = true;    // mark as a tile (not a light, etc.)
                newTile.userData.item = tileData.item;
                newTile.userData.x = tileData.x;
                newTile.userData.y = tileData.y;
                newTile.rotation.y = tileData.rotation;
                newTile.position.set(tileData.x - 0.5, 0, tileData.y - 0.5);
                scene.add(newTile);
                scene_controller.placed_tiles.push(newTile);
            } else {
                console.warn(`No template found for tile type: ${tileData.item}`);
            }
        });
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

    scene_controller = new SceneController(Object.keys(all_objects));
    await scene_controller.load_objects();

    camera.position.set(0, 10, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    // Draw scene from wave
    await scene_controller.draw_scene(scene, scene_controller.object_sample(), { store: true });

    // If there’s a saved state, load it; otherwise, you may want to start with an empty scene.
    loadState();

    // Helper grid for visualization (optional)
    const gridHelper = new THREE.GridHelper(100, 100);
    scene.add(gridHelper);

    // Raycaster and mouse vector
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    plane = new THREE.Mesh(
        new THREE.PlaneGeometry(1000, 1000),
        new THREE.MeshBasicMaterial({ visible: false })
    );

    plane.rotation.x = -Math.PI / 2;
    scene.add(plane);

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('contextmenu', onRightClick);

    // Set background white
    renderer.setClearColor(0xdddddd, 1);

    animate();
}


function onPointerDown(event) {
    // Convert mouse position to normalized device coordinates (-1 to +1)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    let tileStore = scene.children;

    // Raycast
    raycaster.setFromCamera(mouse, camera);
    let intersects = raycaster.intersectObjects([...tileStore, ...scene_controller.placed_tiles], true);

    // Filter by userData.store
    intersects = intersects.filter(o => o.object.userData.tile);

    if (intersects.length > 0) {
        const intersectedObject = intersects[0].object;

        // Check if control is pressed
        const control_click = event.ctrlKey;

        // If we clicked on a store tile, clone it and add to scene
        if (intersectedObject.userData.store) {
            selected_tile = intersectedObject.clone();
            selected_tile.userData.store = false;
            selected_tile.position.copy(intersectedObject.position);

            scene.add(selected_tile);

            // Also track it in scene_controller.placed_tiles
            scene_controller.placed_tiles.push(selected_tile);
        } else if (control_click) {
            // remove
            scene.remove(intersectedObject);
            scene_controller.placed_tiles = scene_controller.placed_tiles.filter(t => t !== intersectedObject);
        }
        else {
            // Otherwise, we clicked on a tile that is already in the scene
            selected_tile = intersectedObject;

            is_alt_drag = event.altKey;
            init_alt_drag = [selected_tile.userData.x, selected_tile.userData.y];
        }

        // Disable controls while dragging
        controls.enableRotate = false;

        // Begin dragging
        is_dragging = true;
    }
}

function onPointerMove(event) {
    if (!is_dragging || !selected_tile) return;

    // Convert mouse position
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Raycast against the plane to get an intersection
    raycaster.setFromCamera(mouse, camera);
    let planeIntersects = raycaster.intersectObjects([plane], true);

    if (planeIntersects.length > 0) {
        const point = planeIntersects[0].point;

        // Snap the position to the nearest integer value
        const snapX = Math.round(point.x);
        const snapZ = Math.round(point.z);

        selected_tile.userData.x = snapX;
        selected_tile.userData.y = snapZ;

        // You might want some offset for y if your tiles have height
        selected_tile.position.set(snapX - 0.5, 0, snapZ - 0.5);
    }
}

function onPointerUp(event) {
    // If alt fill all the way
    if (is_alt_drag) {
        const [init_x, init_y] = init_alt_drag;
        const [end_x, end_y] = [selected_tile.userData.x, selected_tile.userData.y];

        const dx = Math.sign(end_x - init_x);
        const dy = Math.sign(end_y - init_y);

        for (let x = init_x; x != end_x + 1; x += dx) {
            for (let y = init_y; y != end_y + 1; y += dy) {
                const tile = scene_controller.get_tile_at_position(x, y);

                if (!tile) {
                    const new_tile = selected_tile.clone();
                    new_tile.userData.x = x;
                    new_tile.userData.y = y;
                    new_tile.position.set(x - 0.5, 0, y - 0.5);

                    scene.add(new_tile);
                    scene_controller.placed_tiles.push(new_tile);
                }
            }
        }
    }

    // If were moving a tile, remove any other tile in the same position
    if (selected_tile) {
        const tile = scene_controller.get_tile_at_position(selected_tile.userData.x, selected_tile.userData.y);

        if (tile && tile !== selected_tile) {
            scene.remove(tile);
            scene_controller.placed_tiles = scene_controller.placed_tiles.filter(t => t !== tile);
        }
    }

    is_dragging = false;
    selected_tile = null;
    controls.enableRotate = true;
    is_alt_drag = false;

    update_rules();
}

function onRightClick(event) {
    // Prevent the default context menu
    event.preventDefault();

    if (selected_tile) {
        let current_rotation = THREE.MathUtils.radToDeg(selected_tile.rotation.y);

        // Adjust to simmetry
        const tile_name = selected_tile.userData.item;
        const simmetry = all_objects[tile_name].simmetry;

        let new_angle = current_rotation;

        if (simmetry == 4) {
            new_angle = (current_rotation + 90) % 360;
        }
        else if (simmetry == 2) {
            new_angle = (current_rotation + 90) % 180;
        }

        selected_tile.rotation.y = THREE.MathUtils.degToRad(new_angle);
    }

    update_rules();

    // Save the current placed tiles to localStorage
    saveState();
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

function update_rules() {
    // List all tiles that are not store
    let constrains = {};
    for (let tile of scene_controller.placed_tiles) {
        const angle = Math.round(THREE.MathUtils.radToDeg(tile.rotation.y)) % 360;

        // Set name
        let name = tile.userData.item;

        // Add to constrains if not already there
        if (constrains[name] == undefined) {
            constrains[name] =
            {
                simmetry: all_objects[name].simmetry,
                up: [],
                right: [],
                down: [],
                left: []
            }
        }

        // Search adjacents
        let neighbors = {
            "right": { dx: 1, dy: 0 },
            "left": { dx: -1, dy: 0 },
            "down": { dx: 0, dy: 1 },
            "up": { dx: 0, dy: -1 }
        };

        for (let key in neighbors) {
            let dx = neighbors[key].dx;
            let dy = neighbors[key].dy;

            let neighbor = scene_controller.get_tile_at_position(tile.userData.x + dx, tile.userData.y + dy);

            if (neighbor) {
                let neighbor_name = neighbor.userData.item;
                let neighbor_angle = Math.round(THREE.MathUtils.radToDeg(neighbor.rotation.y)) % 360;

                // Adjust neighbor angle with respect to current tile angle: subtract current angle taking into account positive and negative values
                neighbor_angle = (neighbor_angle - angle + 360) % 360;
                // Take into account simmetry
                neighbor_angle = AdjacencyMatrix.adjust_angle_simmetry(neighbor_angle, all_objects[neighbor_name].simmetry);

                let used_position = AdjacencyMatrix.rotate_adj(key, angle);

                // Add to constrains only if not exists
                if (!constrains[name][used_position].includes(`${neighbor_name} ${neighbor_angle}`)) {
                    constrains[name][used_position].push(`${neighbor_name} ${neighbor_angle}`);
                }
            }
        }
    }

    // Print JSON ready to be used and beautified
    let string = JSON.stringify(constrains, null, 2);

    // Copy to clipboard
    navigator.clipboard.writeText(string);

    // Set in current_rules div taking into account indentation
    let lines = string.split('\n');
    let min_indent = Infinity;
    for (let line of lines) {
        if (line.trim() != '') {
            let indent = line.search(/\S/);
            min_indent = Math.min(min_indent, indent);
        }
    }

    let result = '';
    for (let line of lines) {
        result += line.substring(min_indent) + '\n';
    }

    document.getElementById('current_rules').innerText = result;
}

// Check on a key pressed
window.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        update_rules();
    }
})

init();