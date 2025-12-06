/**
 * Instancing Core API Tests
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
    generateInstanceData,
    InstanceData,
    BiomeData
} from '../../../src/core/instancing';

describe('generateInstanceData', () => {
    it('generates requested number of instances', () => {
        const instances = generateInstanceData(
            10,
            100,
            () => 0, // Flat terrain
            undefined,
            undefined
        );

        expect(instances.length).toBe(10);
    });

    it('respects biome filtering', () => {
        const biomes: BiomeData[] = [
            { type: 'forest', center: new THREE.Vector2(0, 0), radius: 50 },
            { type: 'desert', center: new THREE.Vector2(100, 100), radius: 50 }
        ];

        const instances = generateInstanceData(
            20,
            200,
            () => 0,
            biomes,
            ['forest']
        );

        // All instances should be in forest biome
        instances.forEach(instance => {
            const dist = Math.sqrt(
                instance.position.x ** 2 + instance.position.z ** 2
            );
            expect(dist).toBeLessThan(50);
        });
    });

    it('respects height function', () => {
        const heightFunc = (x: number, z: number) => Math.sin(x * 0.1) * 2;
        
        const instances = generateInstanceData(
            10,
            50,
            heightFunc
        );

        instances.forEach(instance => {
            const expectedY = heightFunc(instance.position.x, instance.position.z);
            expect(instance.position.y).toBeCloseTo(expectedY, 1);
        });
    });

    it('skips underwater positions', () => {
        const instances = generateInstanceData(
            20,
            50,
            () => -1, // All underwater
            undefined,
            undefined
        );

        // Should have fewer instances due to underwater filtering
        expect(instances.length).toBeLessThan(20);
    });

    it('generates valid instance data structure', () => {
        const instances = generateInstanceData(
            5,
            10,
            () => 0
        );

        instances.forEach(instance => {
            expect(instance.position).toBeInstanceOf(THREE.Vector3);
            expect(instance.rotation).toBeInstanceOf(THREE.Euler);
            expect(instance.scale).toBeInstanceOf(THREE.Vector3);
            expect(instance.scale.x).toBeGreaterThan(0);
        });
    });
});
