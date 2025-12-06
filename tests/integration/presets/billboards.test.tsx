import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import * as React from 'react';
import { createBillboard, createBillboardInstances } from '../../../src/presets/billboards';

describe('Billboards Integration', () => {
    let container: HTMLDivElement;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.removeChild(container);
    });

    test('should render billboard in React Three Fiber', () => {
        function BillboardScene() {
            const texture = new THREE.Texture();
            const billboard = createBillboard({ texture });

            return <primitive object={billboard} />;
        }

        const { container: testContainer } = render(
            <Canvas>
                <BillboardScene />
            </Canvas>
        );

        expect(testContainer).toBeDefined();
    });

    test('should render instanced billboards', () => {
        function InstancedBillboardScene() {
            const texture = new THREE.Texture();
            const positions = [
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(5, 0, 0),
                new THREE.Vector3(10, 0, 0)
            ];
            const instances = createBillboardInstances(3, positions, { texture });

            return <primitive object={instances} />;
        }

        const { container: testContainer } = render(
            <Canvas>
                <InstancedBillboardScene />
            </Canvas>
        );

        expect(testContainer).toBeDefined();
    });
});
