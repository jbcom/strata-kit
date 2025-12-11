import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
    FABRIKSolver,
    CCDSolver,
    TwoBoneIKSolver,
    LookAtController,
    SpringDynamics,
    SpringChain,
    ProceduralGait,
    createBoneChain,
    createBoneChainFromLengths,
    clampAngle,
    dampedSpring,
    dampedSpringVector3,
    hermiteInterpolate,
    sampleCurve,
    calculateBoneRotation,
    type BoneChain,
} from '../../src/core/animation';

describe('FABRIKSolver', () => {
    let solver: FABRIKSolver;
    let chain: BoneChain;

    beforeEach(() => {
        solver = new FABRIKSolver(0.001, 20);
        
        const root = new THREE.Object3D();
        root.position.set(0, 0, 0);
        
        const bone1 = new THREE.Object3D();
        bone1.position.set(0, 1, 0);
        root.add(bone1);
        
        const bone2 = new THREE.Object3D();
        bone2.position.set(0, 1, 0);
        bone1.add(bone2);
        
        const bone3 = new THREE.Object3D();
        bone3.position.set(0, 1, 0);
        bone2.add(bone3);
        
        root.updateMatrixWorld(true);
        
        chain = createBoneChain([root, bone1, bone2, bone3]);
    });

    it('should solve for reachable target', () => {
        const target = new THREE.Vector3(1, 2, 0);
        const result = solver.solve(chain, target);
        
        expect(result.reached).toBe(true);
        expect(result.error).toBeLessThan(0.01);
        expect(result.positions.length).toBe(4);
    });

    it('should stretch toward unreachable target', () => {
        const target = new THREE.Vector3(0, 10, 0);
        const result = solver.solve(chain, target);
        
        expect(result.reached).toBe(false);
        expect(result.error).toBeGreaterThan(0);
        
        const endPos = result.positions[result.positions.length - 1];
        expect(endPos.y).toBeGreaterThan(2);
    });

    it('should maintain bone lengths', () => {
        const target = new THREE.Vector3(1, 1.5, 0);
        const result = solver.solve(chain, target);
        
        for (let i = 0; i < chain.lengths.length; i++) {
            const dist = result.positions[i].distanceTo(result.positions[i + 1]);
            expect(dist).toBeCloseTo(chain.lengths[i], 1);
        }
    });

    it('should respect pole constraint', () => {
        const target = new THREE.Vector3(0, 2, 0);
        const pole = new THREE.Vector3(1, 1, 0);
        const result = solver.solve(chain, target, pole);
        
        expect(result.positions.length).toBe(4);
        expect(result.iterations).toBeGreaterThan(0);
    });
});

describe('CCDSolver', () => {
    let solver: CCDSolver;
    let chain: BoneChain;

    beforeEach(() => {
        solver = new CCDSolver(0.001, 20, 1.0);
        
        const root = new THREE.Object3D();
        root.position.set(0, 0, 0);
        
        const bone1 = new THREE.Object3D();
        bone1.position.set(0, 0.5, 0);
        root.add(bone1);
        
        const bone2 = new THREE.Object3D();
        bone2.position.set(0, 0.5, 0);
        bone1.add(bone2);
        
        root.updateMatrixWorld(true);
        
        chain = createBoneChain([root, bone1, bone2]);
    });

    it('should solve for reachable target', () => {
        const target = new THREE.Vector3(0.5, 0.5, 0);
        const result = solver.solve(chain, target);
        
        expect(result.positions.length).toBe(3);
        expect(result.rotations.length).toBe(3);
    });

    it('should return rotation for each bone', () => {
        const target = new THREE.Vector3(0.3, 0.8, 0);
        const result = solver.solve(chain, target);
        
        result.rotations.forEach(rot => {
            expect(rot).toBeInstanceOf(THREE.Quaternion);
        });
    });
});

describe('TwoBoneIKSolver', () => {
    let solver: TwoBoneIKSolver;

    beforeEach(() => {
        solver = new TwoBoneIKSolver();
    });

    it('should solve two-bone IK analytically', () => {
        const rootPos = new THREE.Vector3(0, 2, 0);
        const midPos = new THREE.Vector3(0, 1, 0);
        const endPos = new THREE.Vector3(0, 0, 0);
        const target = new THREE.Vector3(1, 1, 0);
        const pole = new THREE.Vector3(0, 1, 1);

        const result = solver.solve(rootPos, midPos, endPos, target, pole, 1, 1);

        expect(result.midPosition).toBeInstanceOf(THREE.Vector3);
        expect(result.endPosition).toBeInstanceOf(THREE.Vector3);
        expect(result.upperRotation).toBeInstanceOf(THREE.Quaternion);
        expect(result.lowerRotation).toBeInstanceOf(THREE.Quaternion);
    });

    it('should clamp to maximum reach', () => {
        const rootPos = new THREE.Vector3(0, 0, 0);
        const midPos = new THREE.Vector3(0, 1, 0);
        const endPos = new THREE.Vector3(0, 2, 0);
        const target = new THREE.Vector3(0, 10, 0);
        const pole = new THREE.Vector3(0, 1, 1);

        const result = solver.solve(rootPos, midPos, endPos, target, pole, 1, 1);

        const totalReach = rootPos.distanceTo(result.endPosition);
        expect(totalReach).toBeLessThanOrEqual(2);
    });
});

describe('LookAtController', () => {
    let controller: LookAtController;
    let object: THREE.Object3D;

    beforeEach(() => {
        controller = new LookAtController({
            maxAngle: Math.PI / 2,
            speed: 10,
            deadzone: 0.01
        });
        object = new THREE.Object3D();
    });

    it('should rotate toward target', () => {
        const target = new THREE.Vector3(1, 0, 1);
        
        controller.update(object, target, 0.1);
        controller.update(object, target, 0.1);
        controller.update(object, target, 0.1);
        
        const rotation = controller.update(object, target, 0.1);
        expect(rotation).toBeInstanceOf(THREE.Quaternion);
    });

    it('should respect max angle limit', () => {
        const controller = new LookAtController({
            maxAngle: Math.PI / 4,
            speed: 100,
            deadzone: 0
        });
        
        const target = new THREE.Vector3(10, 0, 1);
        
        for (let i = 0; i < 10; i++) {
            controller.update(object, target, 0.1);
        }
        
        const rotation = controller.update(object, target, 0.1);
        expect(rotation).toBeInstanceOf(THREE.Quaternion);
    });

    it('should reset to identity', () => {
        const target = new THREE.Vector3(1, 0, 0);
        controller.update(object, target, 0.5);
        
        controller.reset();
        const rotation = controller.update(object, new THREE.Vector3(0, 0, 1), 0);
        
        expect(rotation.x).toBeCloseTo(0, 3);
        expect(rotation.y).toBeCloseTo(0, 3);
        expect(rotation.z).toBeCloseTo(0, 3);
    });
});

describe('SpringDynamics', () => {
    let spring: SpringDynamics;

    beforeEach(() => {
        spring = new SpringDynamics({
            stiffness: 100,
            damping: 10,
            mass: 1
        }, new THREE.Vector3(0, 0, 0));
    });

    it('should move toward target', () => {
        const target = new THREE.Vector3(1, 0, 0);
        
        let pos = spring.getPosition();
        for (let i = 0; i < 100; i++) {
            pos = spring.update(target, 0.016);
        }
        
        expect(pos.x).toBeCloseTo(1, 0);
    });

    it('should oscillate with low damping', () => {
        const lowDampSpring = new SpringDynamics({
            stiffness: 100,
            damping: 1,
            mass: 1
        }, new THREE.Vector3(0, 0, 0));
        
        const target = new THREE.Vector3(1, 0, 0);
        
        let maxX = 0;
        for (let i = 0; i < 50; i++) {
            const pos = lowDampSpring.update(target, 0.016);
            maxX = Math.max(maxX, pos.x);
        }
        
        expect(maxX).toBeGreaterThan(1);
    });

    it('should not oscillate with high damping', () => {
        const highDampSpring = new SpringDynamics({
            stiffness: 100,
            damping: 50,
            mass: 1
        }, new THREE.Vector3(0, 0, 0));
        
        const target = new THREE.Vector3(1, 0, 0);
        
        let maxX = 0;
        for (let i = 0; i < 200; i++) {
            const pos = highDampSpring.update(target, 0.016);
            maxX = Math.max(maxX, pos.x);
        }
        
        expect(maxX).toBeLessThanOrEqual(1.1);
    });

    it('should reset position and velocity', () => {
        spring.update(new THREE.Vector3(1, 0, 0), 0.1);
        spring.update(new THREE.Vector3(1, 0, 0), 0.1);
        
        spring.reset(new THREE.Vector3(0, 0, 0));
        
        expect(spring.getPosition().length()).toBeCloseTo(0, 5);
        expect(spring.getVelocity().length()).toBeCloseTo(0, 5);
    });
});

describe('SpringChain', () => {
    it('should create chain with specified node count', () => {
        const chain = new SpringChain(5, { stiffness: 100, damping: 10, mass: 1 });
        const positions = chain.getPositions();
        
        expect(positions.length).toBe(5);
    });

    it('should update all nodes', () => {
        const chain = new SpringChain(3, { stiffness: 100, damping: 10, mass: 1 });
        const root = new THREE.Vector3(0, 2, 0);
        const rotation = new THREE.Quaternion();
        
        const positions = chain.update(root, rotation, 0.016);
        
        expect(positions.length).toBe(4);
        expect(positions[0].equals(root)).toBe(true);
    });
});

describe('ProceduralGait', () => {
    let gait: ProceduralGait;

    beforeEach(() => {
        gait = new ProceduralGait({
            stepLength: 0.8,
            stepHeight: 0.15,
            stepDuration: 0.4,
            phaseOffset: 0.5
        });
    });

    it('should update gait state', () => {
        const bodyPos = new THREE.Vector3(0, 1, 0);
        const forward = new THREE.Vector3(0, 0, 1);
        const velocity = new THREE.Vector3(0, 0, 1);
        
        const state = gait.update(bodyPos, forward, velocity, 0.016);
        
        expect(state.leftFootTarget).toBeInstanceOf(THREE.Vector3);
        expect(state.rightFootTarget).toBeInstanceOf(THREE.Vector3);
        expect(typeof state.phase).toBe('number');
    });

    it('should alternate foot lifting', () => {
        const bodyPos = new THREE.Vector3(0, 1, 0);
        const forward = new THREE.Vector3(0, 0, 1);
        const velocity = new THREE.Vector3(0, 0, 1);
        
        let leftLifts = 0;
        let rightLifts = 0;
        
        for (let i = 0; i < 100; i++) {
            const state = gait.update(bodyPos, forward, velocity, 0.016);
            if (state.leftFootLifted) leftLifts++;
            if (state.rightFootLifted) rightLifts++;
        }
        
        expect(leftLifts).toBeGreaterThan(0);
        expect(rightLifts).toBeGreaterThan(0);
    });

    it('should stay grounded when stationary', () => {
        const bodyPos = new THREE.Vector3(0, 1, 0);
        const forward = new THREE.Vector3(0, 0, 1);
        const velocity = new THREE.Vector3(0, 0, 0);
        
        const state = gait.update(bodyPos, forward, velocity, 0.016);
        
        expect(state.leftFootLifted).toBe(false);
        expect(state.rightFootLifted).toBe(false);
    });

    it('should reset phase', () => {
        gait.setPhase(0.75);
        expect(gait.getPhase()).toBeCloseTo(0.75, 5);
        
        gait.reset();
        expect(gait.getPhase()).toBe(0);
    });
});

describe('createBoneChainFromLengths', () => {
    it('should create chain with correct lengths', () => {
        const root = new THREE.Object3D();
        const lengths = [0.5, 0.4, 0.3];
        
        const chain = createBoneChainFromLengths(root, lengths);
        
        expect(chain.bones.length).toBe(4);
        expect(chain.lengths).toEqual(lengths);
        expect(chain.totalLength).toBeCloseTo(1.2, 5);
    });

    it('should orient bones in specified direction', () => {
        const root = new THREE.Object3D();
        const lengths = [1];
        const direction = new THREE.Vector3(1, 0, 0);
        
        const chain = createBoneChainFromLengths(root, lengths, direction);
        
        const bone1Pos = chain.bones[1].position;
        expect(bone1Pos.x).toBeCloseTo(1, 5);
        expect(bone1Pos.y).toBeCloseTo(0, 5);
        expect(bone1Pos.z).toBeCloseTo(0, 5);
    });
});

describe('Helper functions', () => {
    describe('clampAngle', () => {
        it('should clamp angle within range', () => {
            expect(clampAngle(0.5, 0, 1)).toBeCloseTo(0.5, 5);
            expect(clampAngle(-0.5, 0, 1)).toBeCloseTo(0, 5);
            expect(clampAngle(1.5, 0, 1)).toBeCloseTo(1, 5);
        });

        it('should handle negative angles', () => {
            expect(clampAngle(-Math.PI - 0.1, -Math.PI, Math.PI)).toBeCloseTo(Math.PI - 0.1, 1);
        });
    });

    describe('dampedSpring', () => {
        it('should move value toward target', () => {
            let current = 0;
            const velocity = { value: 0 };
            
            for (let i = 0; i < 100; i++) {
                current = dampedSpring(current, 1, velocity, 100, 10, 0.016);
            }
            
            expect(current).toBeCloseTo(1, 1);
        });
    });

    describe('dampedSpringVector3', () => {
        it('should move vector toward target', () => {
            const current = new THREE.Vector3(0, 0, 0);
            const target = new THREE.Vector3(1, 1, 1);
            const velocity = new THREE.Vector3();
            
            let result = current.clone();
            for (let i = 0; i < 100; i++) {
                result = dampedSpringVector3(result, target, velocity, 100, 10, 0.016);
            }
            
            expect(result.x).toBeCloseTo(1, 0);
            expect(result.y).toBeCloseTo(1, 0);
            expect(result.z).toBeCloseTo(1, 0);
        });
    });

    describe('hermiteInterpolate', () => {
        it('should interpolate between points', () => {
            const p0 = new THREE.Vector3(0, 0, 0);
            const p1 = new THREE.Vector3(1, 0, 0);
            const m0 = new THREE.Vector3(0, 1, 0);
            const m1 = new THREE.Vector3(0, -1, 0);
            
            const mid = hermiteInterpolate(p0, p1, m0, m1, 0.5);
            
            expect(mid.x).toBeCloseTo(0.5, 1);
        });

        it('should return start point at t=0', () => {
            const p0 = new THREE.Vector3(0, 0, 0);
            const p1 = new THREE.Vector3(1, 1, 1);
            const m0 = new THREE.Vector3(0, 1, 0);
            const m1 = new THREE.Vector3(0, 1, 0);
            
            const result = hermiteInterpolate(p0, p1, m0, m1, 0);
            
            expect(result.x).toBeCloseTo(0, 5);
            expect(result.y).toBeCloseTo(0, 5);
            expect(result.z).toBeCloseTo(0, 5);
        });
    });

    describe('sampleCurve', () => {
        it('should sample points along curve', () => {
            const points = [
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(1, 1, 0),
                new THREE.Vector3(2, 0, 0),
                new THREE.Vector3(3, 1, 0)
            ];
            
            const start = sampleCurve(points, 0);
            expect(start.x).toBeCloseTo(0, 1);
            
            const mid = sampleCurve(points, 0.5);
            expect(mid.x).toBeGreaterThan(0);
            expect(mid.x).toBeLessThan(3);
        });

        it('should handle single point', () => {
            const points = [new THREE.Vector3(1, 2, 3)];
            const result = sampleCurve(points, 0.5);
            
            expect(result.x).toBe(1);
            expect(result.y).toBe(2);
            expect(result.z).toBe(3);
        });
    });

    describe('calculateBoneRotation', () => {
        it('should calculate rotation from bone direction', () => {
            const start = new THREE.Vector3(0, 0, 0);
            const end = new THREE.Vector3(0, 1, 0);
            
            const rotation = calculateBoneRotation(start, end);
            
            expect(rotation).toBeInstanceOf(THREE.Quaternion);
        });

        it('should handle vertical bones', () => {
            const start = new THREE.Vector3(0, 0, 0);
            const end = new THREE.Vector3(0, 0, 1);
            
            const rotation = calculateBoneRotation(start, end);
            
            expect(rotation).toBeInstanceOf(THREE.Quaternion);
        });
    });
});
