export const actionPreset = {
    initialState: {
        player: {
            health: 3,
            maxHealth: 3,
            lives: 3,
            score: 0,
        },
        level: 1,
        checkpoints: [],
        collectibles: [],
    },
};

export function createActionState(overrides = {}) {
    return {
        ...actionPreset.initialState,
        ...overrides,
    };
}
