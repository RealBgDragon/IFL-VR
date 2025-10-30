class Player {
    constructor() {
        this.position = { x: 0, y: 0, z: 0 };
        this.rotation = { x: 0, y: 0, z: 0 };
    }

    move(direction) {
        switch (direction) {
            case 'forward':
                this.position.z -= 1;
                break;
            case 'backward':
                this.position.z += 1;
                break;
            case 'left':
                this.position.x -= 1;
                break;
            case 'right':
                this.position.x += 1;
                break;
            default:
                console.log('Invalid direction');
        }
    }

    rotate(axis, angle) {
        if (axis === 'y') {
            this.rotation.y += angle;
        }
    }

    interact() {
        console.log('Interacting with the environment');
    }
}

export default Player;