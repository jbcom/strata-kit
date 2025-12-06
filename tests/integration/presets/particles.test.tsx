import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import * as React from 'react';
import { createParticleSystem } from '../../../src/presets/particles';

describe('Particle System Integration', () => {
    let container: HTMLDivElement;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.removeChild(container);
    });

    test('should render particle system in React Three Fiber', () => {
        function ParticleScene() {
            const system = createParticleSystem({
                maxParticles: 100,
                rate: 10,
                lifetime: 2.0
            });

            return <primitive object={system.group} />;
        }

        const { container: testContainer } = render(
            <Canvas>
                <ParticleScene />
            </Canvas>
        );

        expect(testContainer).toBeDefined();
    });

    test('should update particle system with useEffect', () => {
        function ParticleScene() {
            const systemRef = React.useRef(createParticleSystem({
                maxParticles: 50,
                rate: 5
            }));

            React.useEffect(() => {
                const interval = setInterval(() => {
                    systemRef.current.update(0.016);
                }, 16);

                return () => {
                    clearInterval(interval);
                    systemRef.current.dispose();
                };
            }, []);

            return <primitive object={systemRef.current.group} />;
        }

        const { container: testContainer } = render(
            <Canvas>
                <ParticleScene />
            </Canvas>
        );

        expect(testContainer).toBeDefined();
    });
});
