import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;

function init() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 20, 20);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);

    // Simple lights for better visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    let objects =
        [
            'structure-platform',
            'character-skate-boy',
            'rail-low',
            'half-pipe',
            'rail-high',
            'structure-wood',
            'floor-concrete',
            'obstacle-box',
            'character-skate-girl',
            'obstacle-end',
            'rail-curve',
            'pallet',
            'steps',
            'rail-slope',
            'obstacle-middle',
            'bowl-corner-outer',
            'bowl-side',
            'floor-wood',
            'skateboard',
            'bowl-corner-inner',

        ]

    // Load all objst in a row
    let x = 0;
    let z = 0;
    for (let i = 0; i < objects.length; i++) {
        const angles = [0, 90, 180, 270];
        for (let j = 0; j < angles.length; j++) {
            loadOBJItem(objects[i], x - 20, z - 20, 0, angles[j]);
            x += 1.1;
        }
        z += 1.1;
        x = 0;
    }

    const baseAdj = {
        'bowl-corner-outer': {
            simmetry: 4,
            up: ['bowl-side 90', 'bowl-corner-outer 90'],
            right: ['floor-wood 0'],
            down: ['floor-wood 0'],
            left: ['bowl-side 0', 'bowl-corner-outer 270']
        },
        'half-pipe': {
            simmetry: 4,
            weight: 0.5,
            up: ['half-pipe 180', 'floor-concrete 0'],
            right: ['half-pipe 0', 'bowl-corner-outer 0'],
            down: ['half-pipe 180', 'floor-wood 0'],
            left: ['half-pipe 0', 'bowl-corner-outer 270']
        },
        'bowl-side': {
            simmetry: 4,
            up: ['bowl-side 180', 'floor-concrete 0'],
            right: ['bowl-side 0', 'bowl-corner-outer 0'],
            down: ['bowl-side 180', 'floor-wood 0'],
            left: ['bowl-side 0', 'bowl-corner-outer 270']
        },
        'bowl-corner-inner': {
            simmetry: 4,
            up: ['floor-concrete 0'],
            right: ['bowl-side 0', 'bowl-corner-inner 270', 'bowl-corner-outer 0'],
            down: ['bowl-side 90', 'bowl-corner-inner 90', 'bowl-corner-outer 0'],
            left: ['floor-concrete 0']
        },
        'floor-wood': {
            simmetry: 1,
            weight: 2,
            up: ['floor-wood 0'],
            right: ['floor-wood 0'],
            down: ['floor-wood 0'],
            left: ['floor-wood 0']
        },
        'floor-concrete': {
            simmetry: 1,
            weight: 0.1,
            up: ['floor-concrete 0'],
            right: ['floor-concrete 0'],
            down: ['floor-concrete 0'],
            left: ['floor-concrete 0']
        },
        'rail-high': {
            simmetry: 2,
            weight: 0.1,
            up: ['rail-high 0', 'rail-slope 180'],
            right: ['floor-wood 0'],
            down: ['rail-high 0', 'rail-slope 0'],
            left: ['floor-wood 0']
        },
        'rail-low': {
            simmetry: 2,
            weight: 0.1,
            up: ['rail-low 0', 'rail-slope 0'],
            right: ['floor-wood 0'],
            down: ['rail-low 0', 'rail-slope 180'],
            left: ['floor-wood 0']
        },
        'rail-slope': {
            simmetry: 4,
            up: [],
            weight: 0.1,
            right: ['floor-wood 0'],
            down: ['floor-wood 0'],
            left: ['floor-wood 0']
        },
    };

    // Generate the adjacency matrix
    let data = {};

    let rotate_label = (item, rotation) => {
        const parts = item.split(' ');
        const name = parts[0];
        let angle = parseInt(parts[1]);
        const simmetry = baseAdj[name].simmetry;

        if (simmetry == 4) {
            angle = (angle + rotation) % 360;
        }
        else if (simmetry == 2) {
            // 180 becomes 0 and 270 becomes 90
            angle = (angle + rotation) % 180;
        }
        else {
            angle = angle;
        }

        return `${name} ${angle}`;
    }

    let rotate_adj = (adj, rotation) => {
        const angles = ['up', 'right', 'down', 'left'];
        const adj_pos = angles.indexOf(adj);
        const inc = rotation / 90;
        const new_pos = (adj_pos + inc) % angles.length;
        return angles[new_pos];
    }

    let get_simmetry_angles = (simmetry) => {
        let angles = [0];

        if (simmetry == 4) {
            angles = [0, 90, 180, 270];
        }
        else if (simmetry == 2) {
            angles = [0, 90];
        }

        return angles;
    }

    for (let key in baseAdj) {
        let item = baseAdj[key];

        const possible_angles = get_simmetry_angles(item.simmetry);

        for (let angle of possible_angles) {
            const new_key = `${key} ${angle}`;
            data[new_key] = {};
            data[new_key].up = item[rotate_adj("up", angle)].map((v) => rotate_label(v, angle));
            data[new_key].right = item[rotate_adj("right", angle)].map((v) => rotate_label(v, angle));
            data[new_key].down = item[rotate_adj("down", angle)].map((v) => rotate_label(v, angle));
            data[new_key].left = item[rotate_adj("left", angle)].map((v) => rotate_label(v, angle));
        }
    }

    // Opposite directions for reference:
    const opposite = { up: 'down', right: 'left', down: 'up', left: 'right' };

    // Check pairs
    for (let key in data) {
        for (let dir of ['up', 'right', 'down', 'left']) {
            const neighbors = data[key][dir] || [];
            const opp = opposite[dir];
            for (let neighbor of neighbors) {
                if (!data[neighbor][opp].includes(key)) {
                    data[neighbor][opp].push(key);
                }
            }
        }
    }

    // Add weights
    for (let key in data) {
        const base_item = key.split(' ')[0];

        // Check if baseAdj has weight
        if (baseAdj[base_item].weight) {
            data[key].weight = baseAdj[base_item].weight;
        }
        else {
            data[key].weight = 1;
        }
    }

    // Weights can be less than one, so normalize to have a minimum of 1 and round to integers
    const weights = Object.values(data).map(v => v.weight);
    const minWeight = Math.min(...weights);

    for (let key in data) {
        data[key].weight = Math.ceil(data[key].weight / minWeight);
    }

    const WIDTH = 10;
    const HEIGHT = 10;

    // Initial conditions
    let initial_conds = [];

    // Set corners
    initial_conds.push({ x: 0, y: 0, value: 'bowl-corner-inner 0' });
    initial_conds.push({ x: WIDTH - 1, y: 0, value: 'bowl-corner-inner 270' });
    initial_conds.push({ x: 0, y: HEIGHT - 1, value: 'bowl-corner-inner 90' });
    initial_conds.push({ x: WIDTH - 1, y: HEIGHT - 1, value: 'bowl-corner-inner 180' });

    // Set sides
    for (let x = 1; x < WIDTH - 1; x++) {
        initial_conds.push({ x: x, y: 0, value: 'bowl-side 0' });
        initial_conds.push({ x: x, y: HEIGHT - 1, value: 'bowl-side 180' });
    }

    for (let y = 1; y < HEIGHT - 1; y++) {
        initial_conds.push({ x: 0, y: y, value: 'bowl-side 90' });
        initial_conds.push({ x: WIDTH - 1, y: y, value: 'bowl-side 270' });
    }

    // Draw scene from wave
    const draw_scene = (wave) => {
        // Clear scene
        for (let i = scene.children.length - 1; i >= 0; i--) {
            const obj = scene.children[i];
            if (obj.type === 'Mesh') {
                scene.remove(obj);
            }
        }

        for(let y = 0; y < wave.length; y++) {
            for(let x = 0; x < wave[y].length; x++) {
                let item = wave[y][x];

                if(item == undefined) {
                    continue;
                }

                let angle = 0;

                // Get angle from item name
                const parts = item.split(' ');
                item = parts[0];
                angle = parseInt(parts[1]);

                let z = 0;

                if (item == 'floor-concrete') {
                    z = 0.8;
                }

                loadOBJItem(item, x, y, z, angle);

                // If item name contains rail add also floor-wood
                if (item.includes('rail')) {
                    loadOBJItem('floor-wood', x, y, 0, 0);
                };
            }
        }
    }

    console.log(data);

    animate();

    const on_update = (wave) => {
        // console.table(wave);
        console.log('Updating scene...');
        // draw_scene(wave);
    }

    let result = waveFunctionCollapse2D(WIDTH, HEIGHT, data, initial_conds, on_update);

    // recalculate result if there is an element undefined
    while (result.flat().includes(undefined)) {
        result = waveFunctionCollapse2D(WIDTH, HEIGHT, data, initial_conds, on_update);
    }

    console.table(result);

    draw_scene(result);

    animate();
}

/**
 * Loads an OBJ+MTL file by name and positions it at (x, y, z).
 *
 * @param {string} itemName - The base name of the OBJ/MTL file (without extension)
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} z - Z coordinate
 * @param {number} r_x - Rotation around X axis (optional)
 * @param {number} r_y - Rotation around Y axis (optional)
 * @param {number} r_z - Rotation around Z axis (optional)
 */
function loadOBJItem(itemName, x, z, y, r_y = 0.0, r_x = 0.0, r_z = 0.0,) {
    // MTL Loader setup
    const mtlLoader = new MTLLoader();
    mtlLoader.setPath('./kenney_mini-skate/Models/OBJ format/');
    mtlLoader.setResourcePath('./kenney_mini-skate/Models/OBJ format/Textures/');

    // Load the .mtl file first
    mtlLoader.load(`${itemName}.mtl`, (materials) => {
        materials.preload();

        // Now OBJ Loader, with the materials from the MTL
        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);
        objLoader.setPath('./kenney_mini-skate/Models/OBJ format/');

        // Load the .obj
        objLoader.load(
            `${itemName}.obj`,
            (object) => {
                // On success
                object.position.set(x, y, z);

                // Rotate the object
                object.rotation.x = THREE.MathUtils.degToRad(r_x);
                object.rotation.y = THREE.MathUtils.degToRad(r_y);
                object.rotation.z = THREE.MathUtils.degToRad(r_z);

                scene.add(object);

                // console.log(`Loaded ${itemName} at (${x}, ${y}, ${z})`);
            },
            (xhr) => {
            },
            (error) => {
                // On error
                console.error(`Error loading ${itemName}`, error);
            }
        );
    });
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

init();

function waveFunctionCollapse2D(width, height, set, initial_conds=[], on_step=null) {
    const adjacency = set;

    // 1) Initialize "wave" as a 2D array of sets, each containing all possible tiles.
    let wave = Array.from({ length: height }, () =>
        Array.from({ length: width }, () => new Set(Object.keys(adjacency)))
    );

    // 2) A stack for backtracking
    //    Each entry on the stack is { wave, x, y, tile }
    let stack = [];

    // 3) Apply initial conditions
    for (const { x, y, value } of initial_conds) {
        wave[y][x] = new Set([value]);
    }

    // Helper function: deep copy the wave state
    function cloneWave(srcWave) {
        return srcWave.map(row => row.map(s => new Set([...s])));
    }

    // Helper function: Most probable wave
    function mostProbableWave(srcWave) {
        let wave_clone = cloneWave(srcWave);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const cell = wave_clone[y][x];
                if (cell.size > 1) {
                    const maxTile = [...cell].reduce((a, b) => adjacency[a].weight > adjacency[b].weight ? a : b);
                    wave_clone[y][x] = maxTile;
                }
                else {
                    wave_clone[y][x] = [...cell][0];
                }
            }
        }

        return wave_clone;
    }

    /**
     * Propagates constraints from collapsed cells outwards.
     * If a neighbor can no longer hold certain tiles, remove them.
     * If any cell’s possibilities become empty => contradiction => return false.
     */
    function propagate() {
        const queue = [];

        // Initialize queue with all cells
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                queue.push({ x, y });
            }
        }

        while (queue.length) {
            const { x, y } = queue.shift();
            const currentPossibilities = wave[y][x];

            if(on_step) {
                on_step(mostProbableWave(wave));
            }

            // For each neighbor in 4 directions
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

                let changed = false;

                // The direction from (nx, ny) toward (x, y) is the "opposite"
                // we must check in adjacency
                const oppositeDir = dx === 1 ? 'right' : dx === -1 ? 'left'
                    : dy === 1 ? 'down' : 'up';

                // For each tile in the neighbor, check if at least
                // one tile in (x,y) is compatible with it in that direction
                for (const tileN of wave[ny][nx]) {
                    let compatible = false;
                    for (const tile of currentPossibilities) {
                        // adjacency[tile][oppositeDir] must include tileN
                        if (adjacency[tile][oppositeDir].includes(tileN)) {
                            compatible = true;
                            break;
                        }
                    }

                    // If no tile in (x,y) allows tileN in the neighbor => remove tileN
                    if (!compatible) {
                        wave[ny][nx].delete(tileN);
                        changed = true;
                    }
                }

                // If neighbor changed, recheck it
                if (wave[ny][nx].size === 0) {
                    // Contradiction: neighbor has no possibilities
                    return false;
                }
                if (changed) {
                    queue.push({ x: nx, y: ny });
                }
            }
        }

        // No contradictions found
        return true;
    }

    /**
     * Main solver loop with backtracking
     */
    let attempts = 0;
    while (true) {
        attempts++;

        // 1) Find the cell with the fewest (but >1) possibilities
        let minOptions = Infinity;
        let cellToCollapse = null;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const size = wave[y][x].size;
                // If exactly 1 => already collapsed, skip
                if (size > 1 && size < minOptions) {
                    minOptions = size;
                    cellToCollapse = { x, y };
                }
            }
        }

        // If every cell is collapsed (no cellToCollapse found), we’re done!
        if (!cellToCollapse) {
            break;
        }

        const { x, y } = cellToCollapse;
        const possibilities = [...wave[y][x]];

        // If no possibilities exist => contradiction => backtrack
        if (possibilities.length === 0) {
            console.log("Contradiction found. Backtracking...");
            // If stack empty => no solutions possible
            if (stack.length === 0) {
                throw new Error("No solution possible (stack empty).");
            }
            // ---------- BACKTRACK STEP ----------
            // 1) Pop a previous state from the stack
            const prevState = stack.pop();
            // 2) Restore wave to that state
            wave = prevState.wave;
            // 3) Remove the tile from that cell that led to contradiction
            wave[prevState.y][prevState.x].delete(prevState.tile);
            // 4) Attempt to propagate again from the restored wave
            if (!propagate()) {
                // If it still contradicts, keep backtracking in the next iteration
                continue;
            }
            // Otherwise, continue the main loop
            continue;
        }

        // 2) Choose a tile to collapse this cell (randomly or otherwise)
        // Multiply each element by its weight
        const weightedPossibilities = possibilities.map(p => Array(adjacency[p].weight).fill(p)).flat();
        const chosenTile = weightedPossibilities[Math.floor(Math.random() * weightedPossibilities.length)];

        // 3) Push the current wave state onto the stack for potential undo
        stack.push({
            wave: cloneWave(wave),
            x,
            y,
            tile: chosenTile,
        });

        // 4) Collapse this cell to the chosen tile
        wave[y][x] = new Set([chosenTile]);

        // 5) Propagate constraints
        if (!propagate()) {
            // ---------- IMMEDIATE CONTRADICTION ----------
            // If we get a contradiction right after picking 'chosenTile':
            // 1) Pop from stack
            const prevState = stack.pop();
            // 2) Revert wave
            wave = prevState.wave;
            // 3) Remove that tile from possibilities
            wave[y][x].delete(chosenTile);
            // 4) Try to propagate again
            propagate();
            // Next loop iteration tries another tile or triggers further backtracking.
        }
    }

    // All cells are collapsed. Convert each cell's set to a single tile.
    const output = wave.map(row => row.map(set => [...set][0]));
    return output;
}
