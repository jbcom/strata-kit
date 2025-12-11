/**
 * Unit tests for physics utilities
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
    CollisionLayer,
    collisionFilters,
    calculateImpulse,
    calculateForce,
    calculateJumpImpulse,
    calculateLandingVelocity,
    applyDrag,
    calculateBuoyancyForce,
    calculateSlopeAngle,
    isWalkableSlope,
    projectVelocityOntoGround,
    calculateSteeringAngle,
    calculateSuspensionForce,
    calculateExplosionForce,
    generateDebrisVelocity,
    createDefaultPhysicsConfig,
    createDefaultCharacterConfig,
    createDefaultVehicleConfig,
    createHumanoidRagdoll,
    createDefaultDestructibleConfig,
    createDefaultBuoyancyConfig,
} from '../../src/core/physics';
import {
    characterPresets,
    vehiclePresets,
    materialPresets,
    destructiblePresets,
    buoyancyPresets,
    getCharacterPreset,
    getVehiclePreset,
    getMaterialPreset,
} from '../../src/presets/physics';

describe('CollisionLayer', () => {
    it('should have correct bitmask values', () => {
        expect(CollisionLayer.Default).toBe(0x0001);
        expect(CollisionLayer.Static).toBe(0x0002);
        expect(CollisionLayer.Dynamic).toBe(0x0004);
        expect(CollisionLayer.Character).toBe(0x0008);
        expect(CollisionLayer.Vehicle).toBe(0x0010);
        expect(CollisionLayer.Projectile).toBe(0x0020);
        expect(CollisionLayer.All).toBe(0xFFFF);
    });

    it('should allow combining layers with bitwise OR', () => {
        const combined = CollisionLayer.Character | CollisionLayer.Vehicle;
        expect(combined).toBe(0x0018);
    });
});

describe('collisionFilters', () => {
    it('should have predefined filters', () => {
        expect(collisionFilters.default).toBeDefined();
        expect(collisionFilters.character).toBeDefined();
        expect(collisionFilters.vehicle).toBeDefined();
        expect(collisionFilters.projectile).toBeDefined();
    });

    it('should have correct filter for character', () => {
        const charFilter = collisionFilters.character;
        expect(charFilter.memberships).toBe(CollisionLayer.Character);
        expect(charFilter.filter & CollisionLayer.Static).toBeTruthy();
        expect(charFilter.filter & CollisionLayer.Dynamic).toBeTruthy();
    });
});

describe('calculateImpulse', () => {
    it('should calculate correct impulse for velocity change', () => {
        const current = new THREE.Vector3(0, 0, 0);
        const target = new THREE.Vector3(10, 0, 0);
        const mass = 80;

        const impulse = calculateImpulse(current, target, mass);
        
        expect(impulse.x).toBe(800);
        expect(impulse.y).toBe(0);
        expect(impulse.z).toBe(0);
    });

    it('should handle negative velocity changes', () => {
        const current = new THREE.Vector3(10, 5, 0);
        const target = new THREE.Vector3(0, 0, 0);
        const mass = 50;

        const impulse = calculateImpulse(current, target, mass);
        
        expect(impulse.x).toBe(-500);
        expect(impulse.y).toBe(-250);
    });
});

describe('calculateForce', () => {
    it('should calculate force from impulse and time', () => {
        const current = new THREE.Vector3(0, 0, 0);
        const target = new THREE.Vector3(10, 0, 0);
        const mass = 80;
        const deltaTime = 0.016;

        const force = calculateForce(current, target, mass, deltaTime);
        
        expect(force.x).toBeCloseTo(50000, 0);
    });
});

describe('calculateJumpImpulse', () => {
    it('should calculate impulse for desired jump height', () => {
        const jumpHeight = 2;
        const gravity = 9.81;
        const mass = 80;

        const impulse = calculateJumpImpulse(jumpHeight, gravity, mass);
        
        expect(impulse).toBeGreaterThan(0);
        expect(impulse).toBeCloseTo(Math.sqrt(2 * 9.81 * 2) * 80, 1);
    });

    it('should scale with mass', () => {
        const impulse1 = calculateJumpImpulse(2, 9.81, 50);
        const impulse2 = calculateJumpImpulse(2, 9.81, 100);

        expect(impulse2).toBeCloseTo(impulse1 * 2, 1);
    });
});

describe('calculateLandingVelocity', () => {
    it('should calculate landing velocity from fall height', () => {
        const fallHeight = 10;
        const gravity = 9.81;

        const velocity = calculateLandingVelocity(fallHeight, gravity);
        
        expect(velocity).toBeCloseTo(14, 0);
    });
});

describe('applyDrag', () => {
    it('should reduce velocity with drag', () => {
        const velocity = new THREE.Vector3(10, 0, 10);
        const dragCoefficient = 2;
        const deltaTime = 0.1;

        const result = applyDrag(velocity, dragCoefficient, deltaTime);
        
        expect(result.x).toBeLessThan(velocity.x);
        expect(result.z).toBeLessThan(velocity.z);
    });

    it('should not go negative', () => {
        const velocity = new THREE.Vector3(1, 0, 0);
        const result = applyDrag(velocity, 100, 1);
        
        expect(result.x).toBe(0);
    });
});

describe('calculateBuoyancyForce', () => {
    it('should return 0 when above water', () => {
        const force = calculateBuoyancyForce(-1, 15, 10);
        expect(force).toBe(0);
    });

    it('should increase with depth', () => {
        const force1 = calculateBuoyancyForce(1, 15, 10);
        const force2 = calculateBuoyancyForce(2, 15, 10);

        expect(force2).toBeGreaterThan(force1);
    });

    it('should scale with mass', () => {
        const force1 = calculateBuoyancyForce(1, 15, 10);
        const force2 = calculateBuoyancyForce(1, 15, 20);

        expect(force2).toBeCloseTo(force1 * 2, 1);
    });
});

describe('calculateSlopeAngle', () => {
    it('should return 0 for flat surface', () => {
        const normal = new THREE.Vector3(0, 1, 0);
        expect(calculateSlopeAngle(normal)).toBeCloseTo(0, 5);
    });

    it('should return PI/4 for 45 degree slope', () => {
        const normal = new THREE.Vector3(0, 1, 1).normalize();
        expect(calculateSlopeAngle(normal)).toBeCloseTo(Math.PI / 4, 2);
    });

    it('should return PI/2 for vertical wall', () => {
        const normal = new THREE.Vector3(1, 0, 0);
        expect(calculateSlopeAngle(normal)).toBeCloseTo(Math.PI / 2, 5);
    });
});

describe('isWalkableSlope', () => {
    it('should return true for flat ground', () => {
        const normal = new THREE.Vector3(0, 1, 0);
        expect(isWalkableSlope(normal, Math.PI / 4)).toBe(true);
    });

    it('should return false for steep slope', () => {
        const normal = new THREE.Vector3(1, 0.5, 0).normalize();
        expect(isWalkableSlope(normal, Math.PI / 6)).toBe(false);
    });
});

describe('projectVelocityOntoGround', () => {
    it('should remove vertical component on flat ground', () => {
        const velocity = new THREE.Vector3(5, -2, 3);
        const normal = new THREE.Vector3(0, 1, 0);

        const result = projectVelocityOntoGround(velocity, normal);
        
        expect(result.x).toBeCloseTo(5, 5);
        expect(result.y).toBeCloseTo(0, 5);
        expect(result.z).toBeCloseTo(3, 5);
    });
});

describe('calculateSteeringAngle', () => {
    it('should return 0 when directions match', () => {
        const current = new THREE.Vector3(0, 0, 1);
        const target = new THREE.Vector3(0, 0, 1);

        const angle = calculateSteeringAngle(current, target, Math.PI / 4);
        expect(angle).toBeCloseTo(0, 5);
    });

    it('should clamp to max steering angle', () => {
        const current = new THREE.Vector3(0, 0, 1);
        const target = new THREE.Vector3(1, 0, 0);
        const maxSteer = Math.PI / 6;

        const angle = calculateSteeringAngle(current, target, maxSteer);
        expect(Math.abs(angle)).toBeLessThanOrEqual(maxSteer + 0.001);
    });
});

describe('calculateSuspensionForce', () => {
    it('should return positive force when compressed', () => {
        const force = calculateSuspensionForce(0.5, 0, 1000, 100);
        expect(force).toBeGreaterThan(0);
    });

    it('should reduce force with upward velocity (damping)', () => {
        const forceStatic = calculateSuspensionForce(0.5, 0, 1000, 100);
        const forceMoving = calculateSuspensionForce(0.5, 1, 1000, 100);

        expect(forceMoving).toBeLessThan(forceStatic);
    });
});

describe('calculateExplosionForce', () => {
    it('should return 0 outside radius', () => {
        const force = calculateExplosionForce(10, 5, 100);
        expect(force).toBe(0);
    });

    it('should return max force at center', () => {
        const force = calculateExplosionForce(0, 5, 100);
        expect(force).toBe(100);
    });

    it('should decrease with distance', () => {
        const force1 = calculateExplosionForce(1, 5, 100);
        const force2 = calculateExplosionForce(3, 5, 100);

        expect(force2).toBeLessThan(force1);
    });
});

describe('generateDebrisVelocity', () => {
    it('should generate outward velocity', () => {
        const center = new THREE.Vector3(0, 0, 0);
        const debris = new THREE.Vector3(1, 0, 0);

        const velocity = generateDebrisVelocity(center, debris, 10);
        
        expect(velocity.x).toBeGreaterThan(0);
    });

    it('should include randomness', () => {
        const center = new THREE.Vector3(0, 0, 0);
        const debris = new THREE.Vector3(1, 0, 0);

        const vel1 = generateDebrisVelocity(center, debris, 10);
        const vel2 = generateDebrisVelocity(center, debris, 10);
        
        expect(vel1.equals(vel2)).toBe(false);
    });
});

describe('createDefaultPhysicsConfig', () => {
    it('should return valid config', () => {
        const config = createDefaultPhysicsConfig();
        
        expect(config.gravity).toEqual([0, -9.81, 0]);
        expect(config.timeStep).toBe(1 / 60);
        expect(config.maxVelocityIterations).toBeGreaterThan(0);
    });
});

describe('createDefaultCharacterConfig', () => {
    it('should return valid character config', () => {
        const config = createDefaultCharacterConfig();
        
        expect(config.capsuleRadius).toBeGreaterThan(0);
        expect(config.capsuleHeight).toBeGreaterThan(0);
        expect(config.mass).toBeGreaterThan(0);
        expect(config.maxSpeed).toBeGreaterThan(0);
        expect(config.jumpForce).toBeGreaterThan(0);
    });
});

describe('createDefaultVehicleConfig', () => {
    it('should return valid vehicle config', () => {
        const config = createDefaultVehicleConfig();
        
        expect(config.chassisMass).toBeGreaterThan(0);
        expect(config.wheelPositions.length).toBeGreaterThanOrEqual(2);
        expect(config.motorForce).toBeGreaterThan(0);
    });
});

describe('createHumanoidRagdoll', () => {
    it('should create ragdoll with body parts', () => {
        const ragdoll = createHumanoidRagdoll(1);
        
        expect(ragdoll.bodyParts.length).toBeGreaterThan(0);
        expect(ragdoll.joints.length).toBeGreaterThan(0);
    });

    it('should scale with parameter', () => {
        const ragdoll1 = createHumanoidRagdoll(1);
        const ragdoll2 = createHumanoidRagdoll(2);

        const pelvis1 = ragdoll1.bodyParts.find(p => p.name === 'pelvis');
        const pelvis2 = ragdoll2.bodyParts.find(p => p.name === 'pelvis');

        expect(pelvis2!.position[1]).toBeCloseTo(pelvis1!.position[1] * 2, 1);
    });

    it('should have valid joint connections', () => {
        const ragdoll = createHumanoidRagdoll(1);
        const partNames = ragdoll.bodyParts.map(p => p.name);

        for (const joint of ragdoll.joints) {
            expect(partNames).toContain(joint.parent);
            expect(partNames).toContain(joint.child);
        }
    });
});

describe('createDefaultDestructibleConfig', () => {
    it('should return valid destructible config', () => {
        const config = createDefaultDestructibleConfig();
        
        expect(config.health).toBeGreaterThan(0);
        expect(config.shardCount).toBeGreaterThan(0);
        expect(config.explosionForce).toBeGreaterThan(0);
    });
});

describe('createDefaultBuoyancyConfig', () => {
    it('should return valid buoyancy config', () => {
        const config = createDefaultBuoyancyConfig();
        
        expect(config.buoyancyForce).toBeGreaterThan(0);
        expect(config.waterDrag).toBeGreaterThan(0);
    });
});

describe('characterPresets', () => {
    it('should have fps preset', () => {
        expect(characterPresets.fps).toBeDefined();
        expect(characterPresets.fps.name).toBe('FPS');
    });

    it('should have thirdPerson preset', () => {
        expect(characterPresets.thirdPerson).toBeDefined();
    });

    it('should have platformer preset', () => {
        expect(characterPresets.platformer).toBeDefined();
        expect(characterPresets.platformer.config.maxJumps).toBe(2);
    });

    it('should have different configs', () => {
        expect(characterPresets.fps.config.maxSpeed).not.toBe(characterPresets.tank.config.maxSpeed);
    });
});

describe('vehiclePresets', () => {
    it('should have car preset', () => {
        expect(vehiclePresets.car).toBeDefined();
        expect(vehiclePresets.car.config.wheelPositions.length).toBe(4);
    });

    it('should have truck preset', () => {
        expect(vehiclePresets.truck).toBeDefined();
        expect(vehiclePresets.truck.config.chassisMass).toBeGreaterThan(vehiclePresets.car.config.chassisMass);
    });

    it('should have motorcycle preset', () => {
        expect(vehiclePresets.motorcycle).toBeDefined();
        expect(vehiclePresets.motorcycle.config.wheelPositions.length).toBe(2);
    });
});

describe('materialPresets', () => {
    it('should have ice preset with low friction', () => {
        expect(materialPresets.ice).toBeDefined();
        expect(materialPresets.ice.material.friction).toBeLessThan(0.1);
    });

    it('should have rubber preset with high friction', () => {
        expect(materialPresets.rubber).toBeDefined();
        expect(materialPresets.rubber.material.friction).toBeGreaterThanOrEqual(1);
    });

    it('should have bouncy preset with high restitution', () => {
        expect(materialPresets.bouncy).toBeDefined();
        expect(materialPresets.bouncy.material.restitution).toBeGreaterThan(0.9);
    });
});

describe('getCharacterPreset', () => {
    it('should return correct preset', () => {
        const preset = getCharacterPreset('fps');
        expect(preset.name).toBe('FPS');
    });
});

describe('getVehiclePreset', () => {
    it('should return correct preset', () => {
        const preset = getVehiclePreset('sportsCar');
        expect(preset.name).toBe('Sports Car');
    });
});

describe('getMaterialPreset', () => {
    it('should return correct preset', () => {
        const preset = getMaterialPreset('metal');
        expect(preset.name).toBe('Metal');
    });
});

describe('destructiblePresets', () => {
    it('should have wooden crate preset', () => {
        expect(destructiblePresets.woodenCrate).toBeDefined();
    });

    it('should have glass preset with low health', () => {
        expect(destructiblePresets.glass.config.health).toBeLessThan(destructiblePresets.stone.config.health);
    });
});

describe('buoyancyPresets', () => {
    it('should have light preset', () => {
        expect(buoyancyPresets.light).toBeDefined();
        expect(buoyancyPresets.light.config.buoyancyForce).toBeGreaterThan(buoyancyPresets.heavy.config.buoyancyForce);
    });

    it('should have boat preset', () => {
        expect(buoyancyPresets.boat).toBeDefined();
    });
});
