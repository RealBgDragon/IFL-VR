import { VRScene } from './components/VRScene';
import { Player } from './components/Player';
import { Environment } from './components/Environment';
import { initControls } from './utils/VRControls';
import { applyPhysics } from './utils/Physics';

const scene = new VRScene();
const player = new Player();
const environment = new Environment();

function init() {
    environment.setup();
    scene.initialize();
    player.setup();
    initControls(player);
}

function mainLoop() {
    applyPhysics();
    scene.update();
    player.update();
    requestAnimationFrame(mainLoop);
}

init();
mainLoop();