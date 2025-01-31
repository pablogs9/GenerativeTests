import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';


class WaveFunctionCollapse2D {
    /**
     * @param {number} width          Width of the grid
     * @param {number} height         Height of the grid
     * @param {object} adjacency      The adjacency rules object
     * @param {Array}  initialConds   Array of {x, y, value} constraints
     * @param {function} onStep       Callback to be called during propagation
     */
    constructor(width, height, adjacency, initialConds = [], onStep = null) {
        this.width = width;
        this.height = height;
        this.adjacency = adjacency;
        this.onStep = onStep;

        // -- Initialize wave: 2D array of sets, each containing all possible tiles
        this.wave = Array.from({ length: height }, () =>
            Array.from({ length: width }, () => new Set(Object.keys(adjacency)))
        );

        // -- Apply initial conditions
        for (const { x, y, value } of initialConds) {
            this.wave[y][x] = new Set([value]);
        }

        // -- A stack for backtracking
        this.stack = [];

        // -- Track whether we are done or have a contradiction
        this.done = false;
        this.noSolution = false;

        // -- For optional debugging / iteration counting
        this.attempts = 0;

        // (Optional) You can do an initial propagate here
        // If the initial conditions cause an immediate contradiction, handle it:
        if (!this._propagate()) {
            this.done = true;
            this.noSolution = true;
        }
    }

    /**
     * Clones the current wave (deep copy)
     */
    _cloneWave(srcWave) {
        return srcWave.map(row => row.map(s => new Set(s)));
    }

    /**
     * Convert the current sets to the "most probable" tile at each position.
     * Useful for drawing an in-progress solution.
     */
    getMostProbableWave() {
        const waveClone = this.wave.map(row => row.map(s => new Set(s)));

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const cell = waveClone[y][x];
                if (cell.size > 1) {
                    // Pick the tile with the greatest adjacency weight
                    // const maxTile = [...cell].reduce((a, b) =>
                    //     this.adjacency[a].weight > this.adjacency[b].weight ? a : b
                    // );
                    const maxTile = [...cell][Math.floor(Math.random() * cell.size)];
                    waveClone[y][x] = maxTile;
                } else {
                    waveClone[y][x] = [...cell][0];
                }
            }
        }

        return waveClone;
    }

    /**
     * Perform constraint propagation. Returns true if no contradictions arise,
     * false if a cell ends up with zero possibilities.
     */
    _propagate() {
        const queue = [];

        // Initialize queue with all cells
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                queue.push({ x, y });
            }
        }

        while (queue.length > 0) {
            const { x, y } = queue.shift();
            const currentPossibilities = this.wave[y][x];

            // Optional: call onStep callback so you can visualize partial changes
            if (this.onStep) {
                this.onStep(this.getMostProbableWave());
            }

            // For each neighbor in 4 directions
            const neighbors = [
                { dx: 1, dy: 0, dir: 'left', opposite: 'right' },
                { dx: -1, dy: 0, dir: 'right', opposite: 'left' },
                { dx: 0, dy: 1, dir: 'up', opposite: 'down' },
                { dx: 0, dy: -1, dir: 'down', opposite: 'up' },
            ];
            for (const { dx, dy, opposite } of neighbors) {
                const nx = x + dx;
                const ny = y + dy;

                // Skip out-of-bounds
                if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) {
                    continue;
                }

                let changed = false;
                const neighborPossibilities = this.wave[ny][nx];

                // For each tile in the neighbor, check if at least
                // one tile in (x,y) is compatible with it in that direction
                for (const tileN of [...neighborPossibilities]) {
                    let compatible = false;
                    for (const tile of currentPossibilities) {
                        if (this.adjacency[tile][opposite].includes(tileN)) {
                            compatible = true;
                            break;
                        }
                    }
                    // If no tile in (x,y) allows tileN in the neighbor => remove tileN
                    if (!compatible) {
                        neighborPossibilities.delete(tileN);
                        changed = true;
                    }
                }

                // If neighbor changed, recheck it
                if (neighborPossibilities.size === 0) {
                    // Contradiction: neighbor has no possibilities
                    return false;
                }
                if (changed) {
                    queue.push({ x: nx, y: ny });
                }
            }
        }

        return true; // no contradictions
    }

    /**
     * Perform one iteration (one cell collapse + propagate) of the algorithm.
     *
     * Returns an object describing the current state:
     *   {
     *       done: boolean,          // true if we've finished or no solution possible
     *       noSolution: boolean,    // true if we found a contradiction with no backtracking possible
     *       wave: <most probable wave or final wave if done>,
     *   }
     */
    step() {
        // If we have already finished or concluded no solutions, do nothing
        if (this.done) {
            return {
                done: true,
                noSolution: this.noSolution,
                wave: this.getMostProbableWave(),
            };
        }

        this.attempts++;

        // 1) Find the cell with the fewest (but >1) possibilities
        let minOptions = Infinity;
        let cellToCollapse = null;

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const size = this.wave[y][x].size;
                // If exactly 1 => already collapsed, skip
                if (size > 1 && size < minOptions) {
                    minOptions = size;
                    cellToCollapse = { x, y };
                }
            }
        }

        // If every cell is collapsed (no cellToCollapse found), we’re done!
        if (!cellToCollapse) {
            this.done = true;
            return {
                done: true,
                noSolution: false,
                wave: this.getOutput(),
            };
        }

        // 2) If no possibilities exist => contradiction => backtrack
        const { x, y } = cellToCollapse;
        const possibilities = [...this.wave[y][x]];
        if (possibilities.length === 0) {
            // This theoretically shouldn't happen in normal step, because
            // we do a propagate check. But let's handle anyway:
            this._handleContradiction();
            return {
                done: this.done,
                noSolution: this.noSolution,
                wave: this.getMostProbableWave(),
            };
        }

        // 3) Choose a tile (weighted random by adjacency weight)
        const weightedPossibilities = possibilities.map(p =>
            Array(this.adjacency[p].weight).fill(p)
        ).flat();
        const chosenTile = weightedPossibilities[
            Math.floor(Math.random() * weightedPossibilities.length)
        ];

        // 4) Push current wave state for backtracking
        this.stack.push({
            wave: this._cloneWave(this.wave),
            x,
            y,
            tile: chosenTile,
        });

        // 5) Collapse this cell to the chosen tile
        this.wave[y][x] = new Set([chosenTile]);

        // 6) Propagate constraints
        if (!this._propagate()) {
            // Immediate contradiction => backtrack
            this._handleContradiction(cellToCollapse, chosenTile);
        }

        // Return the partially collapsed wave to see progress
        return {
            done: this.done,
            noSolution: this.noSolution,
            wave: this.getMostProbableWave(),
        };
    }

    /**
     * Handle contradiction:
     *   - pop from stack,
     *   - revert wave,
     *   - remove chosen tile from possibilities,
     *   - propagate again,
     *   - if still contradiction => repeat backtracking next step.
     */
    _handleContradiction() {
        console.log("Contradiction found. Backtracking...");
        if (this.stack.length === 0) {
            // No solution possible
            this.done = true;
            this.noSolution = true;
            return;
        }

        // Pop a previous state
        const prevState = this.stack.pop();
        // Revert wave
        this.wave = prevState.wave;
        // Remove the tile that caused the contradiction
        this.wave[prevState.y][prevState.x].delete(prevState.tile);

        // Attempt to propagate again
        if (!this._propagate()) {
            // If it still contradicts, we let the next call to step() backtrack further.
            // No immediate action here – next .step() call will see the same scenario
            // and keep popping from stack if needed.
        }
    }

    /**
     * Check if we have fully collapsed the wave or found no solution
     */
    isDone() {
        return this.done;
    }

    /**
     * Returns the final collapsed wave (if done), as a 2D array of tile IDs.
     * If not finished, it will return the partially collapsed best guess
     * (like a final “snapshot”).
     */
    getOutput() {
        if (!this.done || this.noSolution) {
            // Not fully solved or no solution =>
            // you might return a partial wave or just an empty result.
            return this.getMostProbableWave();
        }

        // Convert each set to a single tile
        return this.wave.map(row => row.map(possible => [...possible][0]));
    }

    /**
     * Run the solver to completion in a loop (blocking).
     *
     * (You only need this if you want a single call that finishes everything.)
     */
    runToCompletion() {
        while (!this.done) {
            this.step();
        }

        return this.getOutput();
    }
}

class AdjacencyMatrix {
    constructor(adjacency_base) {
        this.adjacency = adjacency_base;
        this.result = {};

        for (let key in adjacency_base) {
            let item = adjacency_base[key];

            const possible_angles = this._get_simmetry_angles(item.simmetry);

            for (let angle of possible_angles) {
                const new_key = `${key} ${angle}`;
                this.result[new_key] = {};
                this.result[new_key].up = item[this.rotate_adj("up", angle)].map((v) => this.rotate_label(v, angle, this.adjacency[name].simmetry));
                this.result[new_key].right = item[this.rotate_adj("right", angle)].map((v) => this.rotate_label(v, angle, this.adjacency[name].simmetry));
                this.result[new_key].down = item[this.rotate_adj("down", angle)].map((v) => this.rotate_label(v, angle, this.adjacency[name].simmetry));
                this.result[new_key].left = item[this.rotate_adj("left", angle)].map((v) => this.rotate_label(v, angle, this.adjacency[name].simmetry));
            }
        }

        // Opposite directions for reference:
        const opposite = { up: 'down', right: 'left', down: 'up', left: 'right' };

        // Check pairs
        for (let key in this.result) {
            for (let dir of ['up', 'right', 'down', 'left']) {
                const neighbors = this.result[key][dir] || [];
                const opp = opposite[dir];
                for (let neighbor of neighbors) {
                    if (!this.result[neighbor][opp].includes(key)) {
                        this.result[neighbor][opp].push(key);
                    }
                }
            }
        }

        // Add weights
        for (let key in this.result) {
            const base_item = key.split(' ')[0];

            // Check if this.adjacency has weight
            if (this.adjacency[base_item].weight) {
                this.result[key].weight = this.adjacency[base_item].weight;
            }
            else {
                this.result[key].weight = 1;
            }
        }

        // Weights can be less than one, so normalize to have a minimum of 1 and round to integers
        const weights = Object.values(this.result).map(v => v.weight);
        const minWeight = Math.min(...weights);

        for (let key in this.result) {
            this.result[key].weight = Math.ceil(this.result[key].weight / minWeight);
        }
    }

    static adjust_angle_simmetry(angle, simmetry) {
        if (simmetry == 4) {
            return (angle) % 360;
        }
        else if (simmetry == 2) {
            return (angle) % 180;
        }
        else {
            return 0;
        }
    }

    static rotate_label(item, rotation, simmetry) {
        const parts = item.split(' ');
        const name = parts[0];
        let angle = parseInt(parts[1]);

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

    static rotate_adj(adj, rotation) {
        const angles = ['up', 'right', 'down', 'left'];
        const adj_pos = angles.indexOf(adj);
        const inc = rotation / 90;
        const new_pos = (adj_pos + inc) % angles.length;
        return angles[new_pos];
    }

    _get_simmetry_angles(simmetry) {
        let angles = [0];

        if (simmetry == 4) {
            angles = [0, 90, 180, 270];
        }
        else if (simmetry == 2) {
            angles = [0, 90];
        }

        return angles;
    }

    get_adjacency_matrix() {
        return this.result;
    }
}

class SceneController {
    constructor(object_names) {
        this.objects = {};
        this.object_names = object_names;
        this.placed_tiles = [];
    }

    get_tile_at_position(x, y) {
        for (let tile of this.placed_tiles) {
            if (tile.userData.x == x && tile.userData.y == y) {
                return tile;
            }
        }

        return null;
    }

    object_sample() {
        const keys = Object.keys(this.objects);

        let result = [];
        // Add all objects in a single row
        for (let i = 0; i < keys.length; i++) {
            result.push(keys[i] + ' 0');
        }

        return [result];
    }

    async draw_scene(wave, extra_userdata = {}) {
        // Clear scene
        let to_clear_objects = [];
        for (let i = scene.children.length - 1; i >= 0; i--) {
            const obj = scene.children[i];
            if (obj.isGroup) {
                to_clear_objects.push(obj);
            }
        }

        for (let y = 0; y < wave.length; y++) {
            for (let x = 0; x < wave[y].length; x++) {
                let item = wave[y][x];

                if (item == undefined) {
                    continue;
                }

                let angle = 0;

                // Get angle from item name
                const parts = item.split(' ');
                item = parts[0];
                angle = parseInt(parts[1]);

                let z = 0;

                // If floor-wood-high
                if (item == 'floor-wood-HIGH') {
                    item = 'floor-wood';
                    z = 0.4;
                }

                if (item == 'floor-concrete') {
                    item = 'floor-wood';
                    z = 0.8;
                }

                let obj_copy = this.objects[item].clone();

                obj_copy.position.set(x - 0.5, z, y - 0.5);
                obj_copy.rotation.y = THREE.MathUtils.degToRad(angle);

                // Add obj user data
                obj_copy.userData =
                {
                    tile: true,
                    x: x,
                    y: y,
                    item: item,
                }

                // Add extra user data
                for (let key in extra_userdata) {
                    obj_copy.userData[key] = extra_userdata[key];
                }

                scene.add(obj_copy);

                // If object name contains rail, add also a floor
                if (item.includes('rail')) {
                    let floor = this.objects['floor-wood'].clone();
                    floor.position.set(x - 0.5, 0, y - 0.5);
                    scene.add(floor);
                }
            }
        }

        for (let obj of to_clear_objects) {
            scene.remove(obj);
        }
    }

    async load_objects() {
        for (let object_name of this.object_names) {
            const object = await this._load_obj_item(object_name);
            this.objects[object_name] = object.children[0];
            console.log(`Loaded ${object_name}`);
        }
    }

    async _load_obj_item(itemName) {
        // If name contains -high, load a different object
        if (itemName.includes('-HIGH')) {
            itemName = itemName.split('-HIGH')[0];
        }

        return new Promise((resolve, reject) => {
            // MTL Loader setup
            const mtlLoader = new MTLLoader();
            mtlLoader.setPath('./kenney_mini-skate/Models/OBJ format/');
            mtlLoader.setResourcePath('./kenney_mini-skate/Models/OBJ format/Textures/');

            // Load the .mtl file first
            mtlLoader.load(`${itemName}.mtl`, (materials) => {
                materials.preload();

                // Now OBJ Loader, with
                // the materials from the MTL
                const objLoader = new OBJLoader();
                objLoader.setMaterials(materials);
                objLoader.setPath('./kenney_mini-skate/Models/OBJ format/');
                // Load the .obj
                objLoader.load(
                    `${itemName}.obj`,
                    (object) => {
                        // On success
                        resolve(object);
                    },
                    (xhr) => {
                    },
                    (error) => {
                        // On error
                        reject(error);
                    }
                );
            });
        });
    }
}

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

    // const data = new AdjacencyMatrix(heuristic).get_adjacency_matrix();

    const WIDTH = 0;
    const HEIGHT = 0;

    camera.position.set(WIDTH * 0.5, 10, HEIGHT * 0.5);
    camera.lookAt(WIDTH * 0.5, 0, HEIGHT * 0.5);
    camera.updateProjectionMatrix();

    // Draw scene from wave
    scene_controller.draw_scene(scene_controller.object_sample(), { store: true });

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
    window.addEventListener('contextmenu', onRightClick); // for rotation

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
        } else if(control_click) {
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
    if(is_alt_drag) {
        const [init_x, init_y] = init_alt_drag;
        const [end_x, end_y] = [selected_tile.userData.x, selected_tile.userData.y];

        const dx = Math.sign(end_x - init_x);
        const dy = Math.sign(end_y - init_y);

        for(let x = init_x; x != end_x + 1; x += dx) {
            for(let y = init_y; y != end_y + 1; y += dy) {
                const tile = scene_controller.get_tile_at_position(x, y);

                if(!tile) {
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
    if(selected_tile) {
        const tile = scene_controller.get_tile_at_position(selected_tile.userData.x, selected_tile.userData.y);

        if(tile && tile !== selected_tile) {
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

                // let neighbor_angle = (Math.round(THREE.MathUtils.radToDeg(neighbor.rotation.y)) + angle) % 360;
                // neighbor_angle = AdjacencyMatrix.adjust_angle_simmetry(neighbor_angle, all_objects[neighbor_name].simmetry);

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