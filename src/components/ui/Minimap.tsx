import { useFrame, useThree } from '@react-three/fiber';
import React from 'react';
import type { MinimapProps } from './types';

/**
 * 2D Scene Minimap.
 *
 * Provides a top-down view of the scene with player and marker tracking.
 * Features customizable marker types, zoom levels, and compass indicators.
 *
 * @category UI & Interaction
 * @example
 * ```tsx
 * <Minimap
 *   size={200}
 *   zoom={1.5}
 *   playerPosition={[playerX, playerZ]}
 *   markers={questMarkers}
 * />
 * ```
 */
export const Minimap: React.FC<MinimapProps> = ({
    size = 150,
    zoom = 1,
    backgroundColor = 'rgba(0, 0, 0, 0.7)',
    borderColor = 'rgba(255, 255, 255, 0.3)',
    borderWidth = 2,
    borderRadius = 75,
    playerColor = '#4ade80',
    playerSize = 8,
    rotateWithPlayer = false,
    showCompass = true,
    markers = [],
    playerPosition = [0, 0],
    playerRotation = 0,
    mapImage,
    markerTypes = {},
    className,
    style,
}) => {
    const containerStyle: React.CSSProperties = {
        position: 'fixed',
        width: size,
        height: size,
        backgroundColor,
        border: `${borderWidth}px solid ${borderColor}`,
        borderRadius,
        overflow: 'hidden',
        ...style,
    };

    const mapStyle: React.CSSProperties = {
        width: '100%',
        height: '100%',
        transform: rotateWithPlayer ? `rotate(${-playerRotation}rad)` : undefined,
        transition: 'transform 0.1s',
    };

    return (
        <div style={containerStyle} className={className}>
            <div style={mapStyle}>
                {mapImage && (
                    <img
                        src={mapImage}
                        alt="map"
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            transform: `scale(${zoom})`,
                        }}
                    />
                )}
                {markers.map((marker) => {
                    const markerConfig = marker.type ? markerTypes[marker.type] : undefined;
                    const relX = (marker.position[0] - playerPosition[0]) * zoom + size / 2;
                    const relY = (marker.position[1] - playerPosition[1]) * zoom + size / 2;

                    if (relX < 0 || relX > size || relY < 0 || relY > size) return null;

                    return (
                        <div
                            key={marker.id}
                            style={{
                                position: 'absolute',
                                left: relX,
                                top: relY,
                                width: markerConfig?.size || 6,
                                height: markerConfig?.size || 6,
                                backgroundColor: markerConfig?.color || '#ef4444',
                                borderRadius: '50%',
                                transform: 'translate(-50%, -50%)',
                            }}
                        />
                    );
                })}
                <div
                    style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        width: 0,
                        height: 0,
                        borderLeft: `${playerSize / 2}px solid transparent`,
                        borderRight: `${playerSize / 2}px solid transparent`,
                        borderBottom: `${playerSize}px solid ${playerColor}`,
                        transform: `translate(-50%, -50%) rotate(${rotateWithPlayer ? 0 : playerRotation}rad)`,
                    }}
                />
            </div>
            {showCompass && (
                <div
                    style={{
                        position: 'absolute',
                        top: 4,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 'bold',
                        textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                    }}
                >
                    N
                </div>
            )}
        </div>
    );
};
