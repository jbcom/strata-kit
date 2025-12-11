/**
 * YukaJS React Component Wrappers
 *
 * Integrates Yuka game AI library with React Three Fiber.
 * Provides steering behaviors, pathfinding, FSM, and perception.
 */

import React, {
    createContext,
    useContext,
    useRef,
    useEffect,
    useMemo,
    forwardRef,
    useImperativeHandle,
    ReactNode,
} from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import * as YUKA from 'yuka';

// =============================================================================
// TYPES
// =============================================================================

export interface YukaEntityManagerContextValue {
    manager: YUKA.EntityManager;
    time: YUKA.Time;
    register: (entity: YUKA.GameEntity) => void;
    unregister: (entity: YUKA.GameEntity) => void;
}

export interface YukaVehicleProps {
    maxSpeed?: number;
    maxForce?: number;
    mass?: number;
    position?: [number, number, number];
    rotation?: [number, number, number];
    children?: ReactNode;
    onUpdate?: (vehicle: YUKA.Vehicle, delta: number) => void;
}

export interface YukaVehicleRef {
    vehicle: YUKA.Vehicle;
    addBehavior: (behavior: YUKA.SteeringBehavior) => void;
    removeBehavior: (behavior: YUKA.SteeringBehavior) => void;
    clearBehaviors: () => void;
}

export interface YukaPathProps {
    waypoints: Array<[number, number, number]>;
    loop?: boolean;
    visible?: boolean;
    color?: THREE.ColorRepresentation;
    lineWidth?: number;
}

export interface YukaPathRef {
    path: YUKA.Path;
}

export interface StateConfig {
    name: string;
    onEnter?: (entity: YUKA.GameEntity) => void;
    onExecute?: (entity: YUKA.GameEntity) => void;
    onExit?: (entity: YUKA.GameEntity) => void;
}

export interface YukaStateMachineProps {
    entity?: YUKA.GameEntity;
    states: StateConfig[];
    initialState: string;
    globalState?: StateConfig;
}

export interface YukaStateMachineRef {
    stateMachine: YUKA.StateMachine<YUKA.GameEntity>;
    changeTo: (stateName: string) => void;
    revert: () => void;
    getCurrentState: () => string | null;
}

export interface YukaNavMeshProps {
    geometry: THREE.BufferGeometry;
    visible?: boolean;
    wireframe?: boolean;
    color?: THREE.ColorRepresentation;
}

export interface YukaNavMeshRef {
    navMesh: YUKA.NavMesh;
    findPath: (from: THREE.Vector3, to: THREE.Vector3) => THREE.Vector3[];
    getRandomRegion: () => YUKA.Polygon | null;
    getClosestRegion: (point: THREE.Vector3) => YUKA.Polygon | null;
}

// =============================================================================
// CONTEXT
// =============================================================================

const YukaContext = createContext<YukaEntityManagerContextValue | null>(null);

export function useYukaContext(): YukaEntityManagerContextValue {
    const context = useContext(YukaContext);
    if (!context) {
        throw new Error('useYukaContext must be used within a YukaEntityManager');
    }
    return context;
}

// =============================================================================
// HELPER: Sync Yuka matrix to Three.js
// =============================================================================

function syncYukaToThree(yukaEntity: YUKA.GameEntity, threeObject: THREE.Object3D): void {
    const matrix = yukaEntity.worldMatrix;
    threeObject.matrix.set(
        matrix.elements[0], matrix.elements[3], matrix.elements[6], 0,
        matrix.elements[1], matrix.elements[4], matrix.elements[7], 0,
        matrix.elements[2], matrix.elements[5], matrix.elements[8], 0,
        yukaEntity.position.x, yukaEntity.position.y, yukaEntity.position.z, 1
    );
    threeObject.matrixAutoUpdate = false;
    threeObject.matrixWorldNeedsUpdate = true;
}

function yukaVector3ToThree(yukaVec: YUKA.Vector3): THREE.Vector3 {
    return new THREE.Vector3(yukaVec.x, yukaVec.y, yukaVec.z);
}

function threeVector3ToYuka(threeVec: THREE.Vector3): YUKA.Vector3 {
    return new YUKA.Vector3(threeVec.x, threeVec.y, threeVec.z);
}

// =============================================================================
// YUKA ENTITY MANAGER - Context Provider
// =============================================================================

export interface YukaEntityManagerProps {
    children?: ReactNode;
}

export function YukaEntityManager({ children }: YukaEntityManagerProps): JSX.Element {
    const managerRef = useRef<YUKA.EntityManager>(new YUKA.EntityManager());
    const timeRef = useRef<YUKA.Time>(new YUKA.Time());

    const register = (entity: YUKA.GameEntity) => {
        managerRef.current.add(entity);
    };

    const unregister = (entity: YUKA.GameEntity) => {
        managerRef.current.remove(entity);
    };

    useFrame(() => {
        const delta = timeRef.current.update().getDelta();
        managerRef.current.update(delta);
    });

    const contextValue = useMemo<YukaEntityManagerContextValue>(
        () => ({
            manager: managerRef.current,
            time: timeRef.current,
            register,
            unregister,
        }),
        []
    );

    return <YukaContext.Provider value={contextValue}>{children}</YukaContext.Provider>;
}

// =============================================================================
// YUKA VEHICLE - Steering Agent
// =============================================================================

export const YukaVehicle = forwardRef<YukaVehicleRef, YukaVehicleProps>(function YukaVehicle(
    {
        maxSpeed = 5,
        maxForce = 10,
        mass = 1,
        position = [0, 0, 0],
        rotation = [0, 0, 0],
        children,
        onUpdate,
    },
    ref
) {
    const { register, unregister } = useYukaContext();
    const groupRef = useRef<THREE.Group>(null);
    const vehicleRef = useRef<YUKA.Vehicle>(new YUKA.Vehicle());

    useEffect(() => {
        const vehicle = vehicleRef.current;
        vehicle.maxSpeed = maxSpeed;
        vehicle.maxForce = maxForce;
        vehicle.mass = mass;
        vehicle.position.set(position[0], position[1], position[2]);

        const euler = new THREE.Euler(rotation[0], rotation[1], rotation[2]);
        const quaternion = new THREE.Quaternion().setFromEuler(euler);
        vehicle.rotation.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);

        register(vehicle);

        return () => {
            unregister(vehicle);
        };
    }, [register, unregister, maxSpeed, maxForce, mass, position, rotation]);

    useFrame((_, delta) => {
        const vehicle = vehicleRef.current;
        const group = groupRef.current;

        if (group) {
            syncYukaToThree(vehicle, group);
        }

        if (onUpdate) {
            onUpdate(vehicle, delta);
        }
    });

    useImperativeHandle(
        ref,
        () => ({
            vehicle: vehicleRef.current,
            addBehavior: (behavior: YUKA.SteeringBehavior) => {
                vehicleRef.current.steering.add(behavior);
            },
            removeBehavior: (behavior: YUKA.SteeringBehavior) => {
                vehicleRef.current.steering.remove(behavior);
            },
            clearBehaviors: () => {
                vehicleRef.current.steering.clear();
            },
        }),
        []
    );

    return <group ref={groupRef}>{children}</group>;
});

// =============================================================================
// YUKA PATH - Visualizes and provides path
// =============================================================================

export const YukaPath = forwardRef<YukaPathRef, YukaPathProps>(function YukaPath(
    { waypoints, loop = false, visible = false, color = 0x00ff00, lineWidth = 2 },
    ref
) {
    const pathRef = useRef<YUKA.Path>(new YUKA.Path());

    useEffect(() => {
        const path = pathRef.current;
        path.clear();
        path.loop = loop;

        for (const [x, y, z] of waypoints) {
            path.add(new YUKA.Vector3(x, y, z));
        }
    }, [waypoints, loop]);

    useImperativeHandle(
        ref,
        () => ({
            path: pathRef.current,
        }),
        []
    );

    const lineGeometry = useMemo(() => {
        if (!visible || waypoints.length < 2) return null;

        const points = waypoints.map(([x, y, z]) => new THREE.Vector3(x, y, z));
        if (loop && points.length > 2) {
            points.push(points[0].clone());
        }
        return new THREE.BufferGeometry().setFromPoints(points);
    }, [waypoints, loop, visible]);

    if (!visible || !lineGeometry) {
        return null;
    }

    return (
        <line>
            <primitive object={lineGeometry} attach="geometry" />
            <lineBasicMaterial color={color} linewidth={lineWidth} />
        </line>
    );
});

// =============================================================================
// YUKA STATE MACHINE - FSM Wrapper
// =============================================================================

class YukaState extends YUKA.State<YUKA.GameEntity> {
    name: string;
    private _onEnter?: (entity: YUKA.GameEntity) => void;
    private _onExecute?: (entity: YUKA.GameEntity) => void;
    private _onExit?: (entity: YUKA.GameEntity) => void;

    constructor(config: StateConfig) {
        super();
        this.name = config.name;
        this._onEnter = config.onEnter;
        this._onExecute = config.onExecute;
        this._onExit = config.onExit;
    }

    enter(entity: YUKA.GameEntity): void {
        if (this._onEnter) this._onEnter(entity);
    }

    execute(entity: YUKA.GameEntity): void {
        if (this._onExecute) this._onExecute(entity);
    }

    exit(entity: YUKA.GameEntity): void {
        if (this._onExit) this._onExit(entity);
    }
}

export const YukaStateMachine = forwardRef<YukaStateMachineRef, YukaStateMachineProps>(
    function YukaStateMachine({ entity, states, initialState, globalState }, ref) {
        const stateMachineRef = useRef<YUKA.StateMachine<YUKA.GameEntity> | null>(null);
        const statesMapRef = useRef<Map<string, YukaState>>(new Map());
        const dummyEntityRef = useRef<YUKA.GameEntity>(new YUKA.GameEntity());

        useEffect(() => {
            const targetEntity = entity || dummyEntityRef.current;
            const sm = new YUKA.StateMachine(targetEntity);
            stateMachineRef.current = sm;
            statesMapRef.current.clear();

            for (const config of states) {
                const state = new YukaState(config);
                statesMapRef.current.set(config.name, state);
            }

            if (globalState) {
                sm.globalState = new YukaState(globalState);
            }

            const initial = statesMapRef.current.get(initialState);
            if (initial) {
                sm.currentState = initial;
                initial.enter(targetEntity);
            }

            return () => {
                stateMachineRef.current = null;
            };
        }, [entity, states, initialState, globalState]);

        useFrame(() => {
            if (stateMachineRef.current) {
                stateMachineRef.current.update();
            }
        });

        useImperativeHandle(
            ref,
            () => ({
                stateMachine: stateMachineRef.current!,
                changeTo: (stateName: string) => {
                    const sm = stateMachineRef.current;
                    const state = statesMapRef.current.get(stateName);
                    if (sm && state) {
                        sm.changeTo(state);
                    }
                },
                revert: () => {
                    stateMachineRef.current?.revert();
                },
                getCurrentState: () => {
                    const current = stateMachineRef.current?.currentState;
                    if (current && current instanceof YukaState) {
                        return current.name;
                    }
                    return null;
                },
            }),
            []
        );

        return null;
    }
);

// =============================================================================
// YUKA NAV MESH - Navigation Mesh
// =============================================================================

export const YukaNavMesh = forwardRef<YukaNavMeshRef, YukaNavMeshProps>(function YukaNavMesh(
    { geometry, visible = false, wireframe = true, color = 0x0088ff },
    ref
) {
    const navMeshRef = useRef<YUKA.NavMesh>(new YUKA.NavMesh());
    const meshRef = useRef<THREE.Mesh>(null);

    useEffect(() => {
        const navMesh = navMeshRef.current;

        const positionAttr = geometry.getAttribute('position');
        const indexAttr = geometry.getIndex();

        if (!positionAttr) return;

        const vertices: number[] = [];
        for (let i = 0; i < positionAttr.count; i++) {
            vertices.push(positionAttr.getX(i), positionAttr.getY(i), positionAttr.getZ(i));
        }

        let indices: number[] = [];
        if (indexAttr) {
            for (let i = 0; i < indexAttr.count; i++) {
                indices.push(indexAttr.getX(i));
            }
        } else {
            for (let i = 0; i < positionAttr.count; i++) {
                indices.push(i);
            }
        }

        navMesh.fromPolygons(createPolygonsFromGeometry(vertices, indices));
    }, [geometry]);

    useImperativeHandle(
        ref,
        () => ({
            navMesh: navMeshRef.current,
            findPath: (from: THREE.Vector3, to: THREE.Vector3) => {
                const fromYuka = threeVector3ToYuka(from);
                const toYuka = threeVector3ToYuka(to);
                const path = navMeshRef.current.findPath(fromYuka, toYuka);
                return path.map((p: YUKA.Vector3) => yukaVector3ToThree(p));
            },
            getRandomRegion: () => {
                const regions = navMeshRef.current.regions;
                if (regions.length === 0) return null;
                return regions[Math.floor(Math.random() * regions.length)];
            },
            getClosestRegion: (point: THREE.Vector3) => {
                const yukaPoint = threeVector3ToYuka(point);
                return navMeshRef.current.getClosestRegion(yukaPoint);
            },
        }),
        []
    );

    if (!visible) {
        return null;
    }

    return (
        <mesh ref={meshRef}>
            <primitive object={geometry} attach="geometry" />
            <meshBasicMaterial
                color={color}
                wireframe={wireframe}
                transparent
                opacity={0.5}
                side={THREE.DoubleSide}
            />
        </mesh>
    );
});

function createPolygonsFromGeometry(vertices: number[], indices: number[]): YUKA.Polygon[] {
    const polygons: YUKA.Polygon[] = [];

    for (let i = 0; i < indices.length; i += 3) {
        const i0 = indices[i] * 3;
        const i1 = indices[i + 1] * 3;
        const i2 = indices[i + 2] * 3;

        const v0 = new YUKA.Vector3(vertices[i0], vertices[i0 + 1], vertices[i0 + 2]);
        const v1 = new YUKA.Vector3(vertices[i1], vertices[i1 + 1], vertices[i1 + 2]);
        const v2 = new YUKA.Vector3(vertices[i2], vertices[i2 + 1], vertices[i2 + 2]);

        const polygon = new YUKA.Polygon();
        polygon.fromContour([v0, v1, v2]);
        polygons.push(polygon);
    }

    return polygons;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
    yukaVector3ToThree,
    threeVector3ToYuka,
    syncYukaToThree,
};
