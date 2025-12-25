import React from 'react';
import {
    createSceneManager,
    createModeManager,
    createTriggerSystem,
    createTransitionManager
} from '@jbcom/strata';

/**
 * Examples for Game Orchestration API.
 *
 * Demonstrates:
 * 1. Scene Management (loading, pushing, popping)
 * 2. Mode Management (switching gameplay modes)
 * 3. Trigger System (spatial events)
 * 4. Transition Manager (visual effects)
 */
export const GameOrchestrationExamples = {
    /**
     * Shows how to setup and use a SceneManager.
     */
    sceneManagement: () => {
        const scenes = createSceneManager({ initialScene: 'main' });

        scenes.register({
            id: 'main',
            setup: async () => { console.log('Setting up main scene'); },
            teardown: async () => { console.log('Tearing down main scene'); },
            render: () => <mesh><boxGeometry /><meshStandardMaterial color="blue" /></mesh>,
            ui: () => <div>Main Scene UI</div>
        });

        return (
            <div>
                <h3>Scene Manager</h3>
                <p>Current: {scenes.current?.id}</p>
                <button onClick={() => scenes.load('main')}>Reload Main</button>
            </div>
        );
    },

    /**
     * Shows how to setup and use a ModeManager.
     */
    modeManagement: () => {
        const modes = createModeManager('exploration');

        modes.register({
            id: 'exploration',
            systems: [],
            inputMap: { 'move': { keyboard: ['W', 'A', 'S', 'D'] } },
            onEnter: () => console.log('Entering exploration mode'),
        });

        modes.register({
            id: 'combat',
            systems: [],
            inputMap: { 'attack': { keyboard: ['Space'] } },
            onEnter: () => console.log('Entering combat mode'),
        });

        return (
            <div>
                <h3>Mode Manager</h3>
                <p>Current: {modes.current?.config.id}</p>
                <button onClick={() => modes.push('combat')}>Enter Combat</button>
                <button onClick={() => modes.pop()}>Exit Mode</button>
            </div>
        );
    },

    /**
     * Shows how to use the TransitionManager.
     */
    transitions: () => {
        const transitions = createTransitionManager();

        const doFade = async () => {
            await transitions.start({ type: 'fade', duration: 1, color: 'black' });
            console.log('Fade out complete');
            await transitions.start({ type: 'fade', duration: 1, color: 'black', reverse: true });
            console.log('Fade in complete');
        };

        return (
            <div>
                <h3>Transitions</h3>
                <p>Status: {transitions.isTransitioning ? 'Transitioning...' : 'Idle'}</p>
                <p>Progress: {(transitions.progress * 100).toFixed(0)}%</p>
                <button onClick={doFade}>Do Fade Transition</button>
            </div>
        );
    }
};
