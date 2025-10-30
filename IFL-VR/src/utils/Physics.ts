export function applyPhysics(objects: any[], deltaTime: number): void {
    const gravity = 9.81; // Gravity constant
    objects.forEach(object => {
        // Apply gravity
        object.velocity.y -= gravity * deltaTime;

        // Update position based on velocity
        object.position.x += object.velocity.x * deltaTime;
        object.position.y += object.velocity.y * deltaTime;
        object.position.z += object.velocity.z * deltaTime;

        // Simple collision detection with ground
        if (object.position.y < 0) {
            object.position.y = 0; // Reset position to ground level
            object.velocity.y = 0; // Reset vertical velocity
        }
    });
}