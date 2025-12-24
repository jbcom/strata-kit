import type { Game, ModeContext, ModeDefinition, ModeInstance, ModeManager } from './types';

export function createModeManager(defaultModeId: string, gameGetter: () => Game): ModeManager {
    const modes = new Map<string, ModeDefinition>();
    const stack: ModeInstance[] = [];

    const register = (mode: ModeDefinition) => {
        modes.set(mode.id, mode);
    };

    const getContext = (instance: ModeInstance): ModeContext => {
        const game = gameGetter();
        return {
            game,
            world: game.world,
            modeManager: game.modeManager,
            sceneManager: game.sceneManager,
            instance,
        };
    };

    const push = async (modeId: string, props: object = {}) => {
        const config = modes.get(modeId);
        if (!config) throw new Error(`Mode ${modeId} not found`);

        const current = stack[stack.length - 1];
        if (current?.config.onPause) {
            current.config.onPause(getContext(current));
        }

        const instance: ModeInstance = {
            config,
            props,
            pushedAt: Date.now(),
        };

        if (config.setup) {
            await config.setup(getContext(instance));
        }

        if (config.onEnter) {
            config.onEnter(getContext(instance));
        }

        stack.push(instance);
    };

    const pop = async () => {
        const instance = stack.pop();
        if (instance) {
            if (instance.config.onExit) {
                instance.config.onExit(getContext(instance));
            }
            if (instance.config.teardown) {
                await instance.config.teardown(getContext(instance));
            }
        }

        const current = stack[stack.length - 1];
        if (current?.config.onResume) {
            current.config.onResume(getContext(current));
        }
    };

    const replace = async (modeId: string, props: object = {}) => {
        await pop();
        await push(modeId, props);
    };

    return {
        register,
        push,
        pop,
        replace,
        get current() {
            return stack[stack.length - 1] ?? null;
        },
        get stack() {
            return [...stack];
        },
        isActive: (modeId: string) => stack.some((m) => m.config.id === modeId),
        hasMode: (modeId: string) => modes.has(modeId),
    };
}
