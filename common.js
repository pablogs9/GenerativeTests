import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

class WaveFunctionCollapse2D {
    /**
     * @param {number} width          Width of the grid
     * @param {number} height         Height of the grid
     * @param {object} adjacency      The adjacency rules object
     * @param {Array}  initial_conds   Array of {x, y, value} constraints
     */
    constructor(width, height, adjacency, initial_conds = []) {
        this.width = width;
        this.height = height;
        this.adjacency = adjacency;
        this.initial_conds = initial_conds;

        this.reset();
    }

    reset(adjacency = null) {
        if (adjacency) {
            this.adjacency = adjacency;
        }

        // -- Initialize wave: 2D array of sets, each containing all possible tiles
        this.wave = Array.from({ length: this.height }, () =>
            Array.from({ length: this.width }, () => new Set(Object.keys(this.adjacency)))
        );

        // -- Apply initial conditions
        for (const { x, y, value } of this.initial_conds) {
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
                this.result[new_key].up = item[AdjacencyMatrix.rotate_adj("up", angle)].map((v) => AdjacencyMatrix.rotate_label(v, angle, this.adjacency[v.split(' ')[0]].simmetry));
                this.result[new_key].right = item[AdjacencyMatrix.rotate_adj("right", angle)].map((v) => AdjacencyMatrix.rotate_label(v, angle, this.adjacency[v.split(' ')[0]].simmetry));
                this.result[new_key].down = item[AdjacencyMatrix.rotate_adj("down", angle)].map((v) => AdjacencyMatrix.rotate_label(v, angle, this.adjacency[v.split(' ')[0]].simmetry));
                this.result[new_key].left = item[AdjacencyMatrix.rotate_adj("left", angle)].map((v) => AdjacencyMatrix.rotate_label(v, angle, this.adjacency[v.split(' ')[0]].simmetry));
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
            angle = 0;
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

    async draw_scene(scene, wave, extra_userdata = {}) {
        // Clear scene
        let to_clear_objects = [];
        for (let i = scene.children.length - 1; i >= 0; i--) {
            const obj = scene.children[i];
            if (obj.userData.tile) {
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

export { WaveFunctionCollapse2D, AdjacencyMatrix, SceneController };