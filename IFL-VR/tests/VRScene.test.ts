import { VRScene } from '../src/components/VRScene';

describe('VRScene', () => {
    let vrScene: VRScene;

    beforeEach(() => {
        vrScene = new VRScene();
    });

    test('should initialize the scene correctly', () => {
        vrScene.initialize();
        expect(vrScene.isInitialized).toBe(true);
    });

    test('should add objects to the scene', () => {
        const object = { id: 'testObject' };
        vrScene.addObject(object);
        expect(vrScene.objects).toContain(object);
    });

    test('should remove objects from the scene', () => {
        const object = { id: 'testObject' };
        vrScene.addObject(object);
        vrScene.removeObject(object.id);
        expect(vrScene.objects).not.toContain(object);
    });
});