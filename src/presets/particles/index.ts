/**
 * Particle System Preset - GPU-accelerated particle effects
 * 
 * Provides particle systems for fire, smoke, explosions, magic effects,
 * sparks, debris, and other visual effects.
 */

import * as THREE from 'three';

export interface ParticleEmitterOptions {
    maxParticles?: number;
    lifetime?: number;
    rate?: number; // particles per second
    shape?: 'point' | 'box' | 'sphere' | 'cone';
    shapeParams?: {
        // Box
        width?: number;
        height?: number;
        depth?: number;
        // Sphere
        radius?: number;
        // Cone
        radius?: number;
        angle?: number;
        height?: number;
    };
    velocity?: {
        min: THREE.Vector3;
        max: THREE.Vector3;
    };
    acceleration?: THREE.Vector3; // Gravity, wind, etc.
    color?: {
        start: THREE.Color;
        end: THREE.Color;
    };
    size?: {
        start: number;
        end: number;
    };
    opacity?: {
        start: number;
        end: number;
    };
    rotation?: {
        min: number;
        max: number;
    };
    texture?: THREE.Texture;
    blending?: THREE.Blending;
}

export interface ParticleSystem {
    group: THREE.Group;
    update: (deltaTime: number) => void;
    dispose: () => void;
}

/**
 * Create a GPU-accelerated particle system
 */
export function createParticleSystem(
    options: ParticleEmitterOptions = {}
): ParticleSystem {
    const {
        maxParticles = 1000,
        lifetime = 2.0,
        rate = 100,
        shape = 'point',
        velocity = {
            min: new THREE.Vector3(-1, 1, -1),
            max: new THREE.Vector3(1, 3, 1)
        },
        acceleration = new THREE.Vector3(0, -9.8, 0),
        color = {
            start: new THREE.Color(1, 1, 1),
            end: new THREE.Color(1, 0, 0)
        },
        size = { start: 0.1, end: 0.05 },
        opacity = { start: 1.0, end: 0.0 },
        texture,
        blending = THREE.AdditiveBlending
    } = options;

    // Input validation
    if (maxParticles <= 0) {
        throw new Error('createParticleSystem: maxParticles must be positive');
    }
    if (lifetime <= 0) {
        throw new Error('createParticleSystem: lifetime must be positive');
    }
    if (rate <= 0) {
        throw new Error('createParticleSystem: rate must be positive');
    }

    const group = new THREE.Group();
    
    // Use instanced rendering for performance
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uTexture: { value: texture || null },
            uColorStart: { value: color.start },
            uColorEnd: { value: color.end },
            uSizeStart: { value: size.start },
            uSizeEnd: { value: size.end },
            uOpacityStart: { value: opacity.start },
            uOpacityEnd: { value: opacity.end }
        },
        vertexShader: particleVertexShader,
        fragmentShader: particleFragmentShader,
        transparent: true,
        depthWrite: false,
        blending,
        side: THREE.DoubleSide
    });

    const mesh = new THREE.InstancedMesh(geometry, material, maxParticles);
    mesh.frustumCulled = false;
    group.add(mesh);

    // Particle data
    const particles: Array<{
        position: THREE.Vector3;
        velocity: THREE.Vector3;
        age: number;
        lifetime: number;
        size: number;
        rotation: number;
        rotationSpeed: number;
    }> = [];

    let emitAccumulator = 0;

    const update = (deltaTime: number) => {
        material.uniforms.uTime.value += deltaTime;

        // Emit new particles
        emitAccumulator += rate * deltaTime;
        while (emitAccumulator >= 1 && particles.length < maxParticles) {
            emitParticle();
            emitAccumulator -= 1;
        }

        // Update existing particles
        const matrix = new THREE.Matrix4();
        let visibleCount = 0;

        for (let i = particles.length - 1; i >= 0; i--) {
            const particle = particles[i];
            particle.age += deltaTime;
            particle.rotation += particle.rotationSpeed * deltaTime;

            if (particle.age >= particle.lifetime) {
                particles.splice(i, 1);
                continue;
            }

            // Update physics
            particle.velocity.add(acceleration.clone().multiplyScalar(deltaTime));
            particle.position.add(particle.velocity.clone().multiplyScalar(deltaTime));

            // Update instance matrix
            matrix.makeRotationZ(particle.rotation);
            matrix.scale(new THREE.Vector3(particle.size, particle.size, 1));
            matrix.setPosition(particle.position);
            mesh.setMatrixAt(visibleCount, matrix);
            visibleCount++;
        }

        mesh.instanceMatrix.needsUpdate = true;
        mesh.count = visibleCount;
    };

    const emitParticle = () => {
        const position = getEmitPosition(shape, options.shapeParams);
        const vel = new THREE.Vector3(
            THREE.MathUtils.randFloat(velocity.min.x, velocity.max.x),
            THREE.MathUtils.randFloat(velocity.min.y, velocity.max.y),
            THREE.MathUtils.randFloat(velocity.min.z, velocity.max.z)
        );

        particles.push({
            position: position.clone(),
            velocity: vel,
            age: 0,
            lifetime: lifetime * THREE.MathUtils.randFloat(0.8, 1.2),
            size: THREE.MathUtils.randFloat(size.start * 0.8, size.start * 1.2),
            rotation: THREE.MathUtils.randFloat(0, Math.PI * 2),
            rotationSpeed: THREE.MathUtils.randFloat(-2, 2)
        });
    };

    const getEmitPosition = (
        shape: string,
        params?: ParticleEmitterOptions['shapeParams']
    ): THREE.Vector3 => {
        switch (shape) {
            case 'point':
                return new THREE.Vector3(0, 0, 0);
            case 'box':
                return new THREE.Vector3(
                    THREE.MathUtils.randFloat(-(params?.width || 1) / 2, (params?.width || 1) / 2),
                    THREE.MathUtils.randFloat(-(params?.height || 1) / 2, (params?.height || 1) / 2),
                    THREE.MathUtils.randFloat(-(params?.depth || 1) / 2, (params?.depth || 1) / 2)
                );
            case 'sphere':
                const radius = params?.radius || 1;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                return new THREE.Vector3(
                    radius * Math.sin(phi) * Math.cos(theta),
                    radius * Math.sin(phi) * Math.sin(theta),
                    radius * Math.cos(phi)
                );
            default:
                return new THREE.Vector3(0, 0, 0);
        }
    };

    const dispose = () => {
        geometry.dispose();
        material.dispose();
        if (texture) texture.dispose();
        group.remove(mesh);
    };

    return { group, update, dispose };
}

const particleVertexShader = /* glsl */ `
  attribute vec3 instancePosition;
  attribute float instanceAge;
  attribute float instanceLifetime;
  attribute float instanceSize;
  attribute float instanceRotation;
  
  uniform float uTime;
  uniform float uSizeStart;
  uniform float uSizeEnd;
  
  varying float vAge;
  varying float vLifetime;
  varying vec2 vUv;
  
  void main() {
      vUv = uv;
      vAge = instanceAge;
      vLifetime = instanceLifetime;
      
      float t = instanceAge / instanceLifetime;
      float size = mix(uSizeStart, uSizeEnd, t);
      
      vec3 pos = position * size;
      
      // Rotate around Z axis
      float c = cos(instanceRotation);
      float s = sin(instanceRotation);
      pos.xy = vec2(
          pos.x * c - pos.y * s,
          pos.x * s + pos.y * c
      );
      
      pos += instancePosition;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const particleFragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec3 uColorStart;
  uniform vec3 uColorEnd;
  uniform float uOpacityStart;
  uniform float uOpacityEnd;
  
  varying float vAge;
  varying float vLifetime;
  varying vec2 vUv;
  
  void main() {
      float t = vAge / vLifetime;
      
      vec3 color = mix(uColorStart, uColorEnd, t);
      float opacity = mix(uOpacityStart, uOpacityEnd, t);
      
      vec4 texColor = texture2D(uTexture, vUv);
      color *= texColor.rgb;
      opacity *= texColor.a;
      
      gl_FragColor = vec4(color, opacity);
  }
`;
