interface Vec3 { x: number; y: number; z: number; }

type MoveDirection = 'forward' | 'backward' | 'left' | 'right';
type Axis = 'x' | 'y' | 'z';

class Player {
    position: Vec3;
    rotation: Vec3; // Euler angles in radians
    velocity: Vec3;
    speed: number;
    sprintMultiplier: number;
    isGrounded: boolean;
    jumpStrength: number;
    gravity: number;
    boundingRadius: number;

    constructor(opts?: Partial<{
        position: Vec3;
        rotation: Vec3;
        speed: number;
        jumpStrength: number;
        gravity: number;
        boundingRadius: number;
    }>) {
        this.position = opts?.position ?? { x: 0, y: 0, z: 0 };
        this.rotation = opts?.rotation ?? { x: 0, y: 0, z: 0 };
        this.velocity = { x: 0, y: 0, z: 0 };
        this.speed = opts?.speed ?? 5; // units per second
        this.sprintMultiplier = 1.8;
        this.isGrounded = true;
        this.jumpStrength = opts?.jumpStrength ?? 6; // initial upward velocity
        this.gravity = opts?.gravity ?? -9.81; // m/s^2
        this.boundingRadius = opts?.boundingRadius ?? 0.5;
    }

    // Move relative to the player's yaw (rotation.y). delta is seconds since last update.
    move(direction: MoveDirection, delta = 1 / 60, sprint = false) {
        const yaw = this.rotation.y;
        const forward = { x: Math.sin(yaw), z: -Math.cos(yaw) }; // forward vector
        const right = { x: Math.cos(yaw), z: Math.sin(yaw) }; // right vector

        let multiplier = sprint ? this.sprintMultiplier : 1;
        const distance = this.speed * multiplier * delta;

        switch (direction) {
            case 'forward':
                this.position.x += forward.x * distance;
                this.position.z += forward.z * distance;
                break;
            case 'backward':
                this.position.x -= forward.x * distance;
                this.position.z -= forward.z * distance;
                break;
            case 'left':
                this.position.x -= right.x * distance;
                this.position.z -= right.z * distance;
                break;
            case 'right':
                this.position.x += right.x * distance;
                this.position.z += right.z * distance;
                break;
            default:
                // no-op for unknown directions
                break;
        }
    }

    // Rotate around an axis (radians). Keeps angles normalized to [-PI, PI].
    rotate(axis: Axis, angle: number) {
        if (!['x', 'y', 'z'].includes(axis)) return;
        (this.rotation as any)[axis] += angle;
        (this.rotation as any)[axis] = this._wrapAngle((this.rotation as any)[axis]);
    }

    // Apply gravity and velocity integration. Call every frame with delta time (seconds).
    update(delta: number) {
        // integrate velocity
        this.velocity.y += this.gravity * delta;
        this.position.x += this.velocity.x * delta;
        this.position.y += this.velocity.y * delta;
        this.position.z += this.velocity.z * delta;

        // simple ground collision at y = 0
        if (this.position.y <= 0) {
            this.position.y = 0;
            this.velocity.y = 0;
            this.isGrounded = true;
        }
    }

    jump() {
        if (!this.isGrounded) return;
        this.velocity.y = this.jumpStrength;
        this.isGrounded = false;
    }

    interact() {
        // placeholder for interaction logic
        console.log('Interacting with the environment');
    }

    teleport(x: number, y: number, z: number) {
        this.position = { x, y, z };
        this.velocity = { x: 0, y: 0, z: 0 };
        this.isGrounded = this.position.y <= 0;
    }

    setPosition(pos: Vec3) {
        this.position = { ...pos };
    }

    setRotation(rot: Vec3) {
        this.rotation = {
            x: this._wrapAngle(rot.x),
            y: this._wrapAngle(rot.y),
            z: this._wrapAngle(rot.z)
        };
    }

    clampPosition(min: Vec3, max: Vec3) {
        this.position.x = Math.max(min.x, Math.min(max.x, this.position.x));
        this.position.y = Math.max(min.y, Math.min(max.y, this.position.y));
        this.position.z = Math.max(min.z, Math.min(max.z, this.position.z));
    }

    // Simple sphere-sphere collision check
    collidesWithSphere(otherPos: Vec3, otherRadius: number) {
        const dx = this.position.x - otherPos.x;
        const dy = this.position.y - otherPos.y;
        const dz = this.position.z - otherPos.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const r = this.boundingRadius + otherRadius;
        return distSq <= r * r;
    }

    toJSON() {
        return {
            position: { ...this.position },
            rotation: { ...this.rotation },
            velocity: { ...this.velocity },
            speed: this.speed,
            jumpStrength: this.jumpStrength,
            gravity: this.gravity,
            boundingRadius: this.boundingRadius
        };
    }

    static fromJSON(data: any) {
        const p = new Player({
            position: data.position,
            rotation: data.rotation,
            speed: data.speed,
            jumpStrength: data.jumpStrength,
            gravity: data.gravity,
            boundingRadius: data.boundingRadius
        });
        p.velocity = data.velocity ?? { x: 0, y: 0, z: 0 };
        return p;
    }

    // --- internal helpers ---
    _wrapAngle(a: number) {
        // normalize to [-PI, PI]
        const TWO_PI = Math.PI * 2;
        a = ((a + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
        return a;
    }
}

export default Player;