/**
 * XState-based animation state machine module.
 *
 * Provides state machine patterns for managing animation transitions,
 * blend trees, and cross-fading in React Three Fiber applications.
 *
 * @module core/animation/state-machine
 *
 * @example
 * ```typescript
 * import {
 *   createAnimationMachine,
 *   createLocomotionMachine,
 *   useAnimationMachine,
 *   useAnimationBlend
 * } from '@jbcom/strata/core/animation/state-machine';
 *
 * // Create a locomotion machine with common states
 * const locomotion = createLocomotionMachine({
 *   idle: 'Idle',
 *   walk: 'Walk',
 *   run: 'Run',
 *   jump: 'Jump'
 * });
 *
 * // Use in a React component
 * function Character() {
 *   const { currentState, send } = useAnimationMachine(locomotion);
 *   // ...
 * }
 * ```
 */

export { createAnimationMachine, calculateBlendWeights, smoothStep, smootherStep } from './factory';

export { createLocomotionMachine, createCombatMachine } from './presets';

export { useAnimationMachine } from './hooks';

export { useAnimationBlend, useSyncAnimationActions, useCrossFade } from './blend-hooks';

export type {
    AnimationStateName,
    AnimationStateConfig,
    AnimationContext,
    AnimationEvent,
    AnimationTransitionConfig,
    BlendTreeConfig,
    BlendTreeNode,
    AnimationMachineConfig,
    BlendWeights,
    UseAnimationMachineOptions,
    UseAnimationBlendOptions,
    AnimationMachineReturn,
    AnimationBlendReturn,
} from './types';
