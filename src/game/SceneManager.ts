import type { SceneDefinition, SceneManager, SceneManagerConfig } from './types';

export function createSceneManager(config: SceneManagerConfig): SceneManager {
    const scenes = new Map<string, SceneDefinition>();
    let currentScene: SceneDefinition | null = null;
    const stack: SceneDefinition[] = [];
    let isLoading = false;
    let loadProgress = 0;

    const register = (scene: SceneDefinition) => {
        scenes.set(scene.id, scene);
    };

    const load = async (sceneId: string) => {
        const scene = scenes.get(sceneId);
        if (!scene) throw new Error(`Scene ${sceneId} not found`);

        isLoading = true;
        loadProgress = 0;

        if (currentScene?.teardown) {
            await currentScene.teardown();
        }

        if (scene.setup) {
            await scene.setup();
        }

        currentScene = scene;
        isLoading = false;
        loadProgress = 100;
    };

    const push = async (sceneId: string) => {
        const scene = scenes.get(sceneId);
        if (!scene) throw new Error(`Scene ${sceneId} not found`);

        if (scene.setup) {
            await scene.setup();
        }

        stack.push(scene);
    };

    const pop = async () => {
        const scene = stack.pop();
        if (scene?.teardown) {
            await scene.teardown();
        }
    };

    return {
        register,
        load,
        push,
        pop,
        get current() {
            return currentScene;
        },
        get stack() {
            return stack;
        },
        get isLoading() {
            return isLoading;
        },
        get loadProgress() {
            return loadProgress;
        },
    };
}
