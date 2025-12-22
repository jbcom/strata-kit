import type { CSSProperties, ReactNode } from 'react';
import type * as THREE from 'three';
import type {
    CrosshairConfig,
    DamageNumberConfig,
    DialogChoice,
    DialogConfig,
    DialogLine,
    InventoryConfig,
    InventorySlot,
    MinimapConfig,
    NameplateConfig,
    NotificationConfig,
    ProgressBarConfig,
    TooltipConfig,
    UIAnchor,
} from '../../core/ui';

/**
 * Props for the HealthBar component.
 * @category UI & Interaction
 */
export interface HealthBarProps extends Partial<ProgressBarConfig> {
    /** World position [x, y, z]. Default: [0, 0, 0]. */
    position?: [number, number, number];
    /** Screen-space pixel offset [x, y]. Default: [0, 0]. */
    offset?: [number, number];
    /** Whether the bar can be hidden by 3D objects. Default: true. */
    occlude?: boolean;
    /** Distances for automatic opacity fading { start, end }. */
    distanceFade?: { start: number; end: number };
    /** Custom CSS class for the HTML element. */
    className?: string;
    /** Custom CSS styles for the HTML element. */
    style?: CSSProperties;
}

/**
 * Ref interface for HealthBar.
 * @category UI & Interaction
 */
export interface HealthBarRef {
    /** Manually set the bar's value. */
    setValue: (value: number) => void;
    /** Update the maximum value. */
    setMaxValue: (maxValue: number) => void;
    /** Trigger a visual flash effect (e.g., on damage). */
    flash: () => void;
}

/**
 * Props for the Nameplate component.
 * @category UI & Interaction
 */
export interface NameplateProps extends Partial<NameplateConfig> {
    /** World position [x, y, z]. Default: [0, 0, 0]. */
    position?: [number, number, number];
    /** Screen-space pixel offset [x, y]. Default: [0, 0]. */
    offset?: [number, number];
    /** Whether the plate can be hidden by 3D objects. Default: true. */
    occlude?: boolean;
    /** Custom CSS class. */
    className?: string;
    /** Custom CSS styles. */
    style?: CSSProperties;
}

/**
 * Ref interface for Nameplate.
 * @category UI & Interaction
 */
export interface NameplateRef {
    /** Update the displayed name. */
    setName: (name: string) => void;
    /** Update the integrated health bar levels. */
    setHealth: (value: number, maxValue: number) => void;
}

/**
 * Props for the DamageNumber component.
 * @category UI & Interaction
 */
export interface DamageNumberProps extends Partial<DamageNumberConfig> {
    /** Starting world position [x, y, z]. */
    position: [number, number, number];
    /** Callback fired when the animation completes and the element is removed. */
    onComplete?: () => void;
}

/**
 * Props for the ProgressBar3D component.
 * @category UI & Interaction
 */
export interface ProgressBar3DProps {
    /** Current progress value. */
    value: number;
    /** Maximum progress value. */
    maxValue: number;
    /** Physical width in units. Default: 1.0. */
    width?: number;
    /** Physical height in units. Default: 0.1. */
    height?: number;
    /** Physical depth in units. Default: 0.05. */
    depth?: number;
    /** Color of the filled portion. Default: '#4ade80'. */
    fillColor?: string;
    /** Color of the background portion. Default: '#1f2937'. */
    backgroundColor?: string;
    /** World position [x, y, z]. Default: [0, 0, 0]. */
    position?: [number, number, number];
    /** World rotation. Default: [0, 0, 0]. */
    rotation?: [number, number, number];
    /** Whether the bar should always face the camera. Default: false. */
    billboard?: boolean;
}

/**
 * Props for the Inventory component.
 * @category UI & Interaction
 */
export interface InventoryProps extends Partial<InventoryConfig> {
    /** Callback fired when a slot is clicked. */
    onSlotClick?: (slot: InventorySlot, index: number) => void;
    /** Callback fired when an item is dragged from one slot to another. */
    onSlotDrop?: (fromIndex: number, toIndex: number) => void;
    /** Callback fired when a slot is hovered. */
    onSlotHover?: (slot: InventorySlot | null, index: number) => void;
    /** Index of the currently selected slot. */
    selectedIndex?: number;
    /** Whether the inventory grid is visible. Default: true. */
    visible?: boolean;
    /** Screen corner anchor point. Default: 'center'. */
    anchor?: UIAnchor;
    /** Custom CSS class. */
    className?: string;
    /** Custom CSS styles. */
    style?: CSSProperties;
}

/**
 * Ref interface for Inventory.
 * @category UI & Interaction
 */
export interface InventoryRef {
    /** Manually select a slot by index. */
    selectSlot: (index: number) => void;
    /** Update the entire set of inventory slots. */
    setSlots: (slots: InventorySlot[]) => void;
}

/**
 * Props for the Tooltip component.
 * @category UI & Interaction
 */
export interface TooltipProps extends Partial<TooltipConfig> {
    /** Screen X position. */
    x?: number;
    /** Screen Y position. */
    y?: number;
    /** Whether the tooltip is visible. Default: true. */
    visible?: boolean;
    /** Additional custom content. */
    children?: ReactNode;
    /** Custom CSS class. */
    className?: string;
}

/**
 * Props for the DialogBox component.
 * @category UI & Interaction
 */
export interface DialogBoxProps extends Partial<DialogConfig> {
    /** Callback fired when a line finishes typing. */
    onLineComplete?: (lineIndex: number) => void;
    /** Callback fired when the entire dialog sequence ends. */
    onDialogComplete?: () => void;
    /** Callback fired when a choice is selected. */
    onChoiceSelect?: (choiceId: string, lineIndex: number) => void;
    /** Whether the dialog is visible. Default: true. */
    visible?: boolean;
    /** Custom CSS class. */
    className?: string;
    /** Custom CSS styles. */
    style?: CSSProperties;
}

/**
 * Ref interface for DialogBox.
 * @category UI & Interaction
 */
export interface DialogBoxRef {
    /** Advance to the next line or finish typing current line. */
    advance: () => void;
    /** Instantly skip typewriter animation for the current line. */
    skip: () => void;
    /** Reset the dialog to the first line. */
    reset: () => void;
    /** Jump to a specific line index. */
    setLine: (index: number) => void;
}

/**
 * Props for the Notification component.
 * @category UI & Interaction
 */
export interface NotificationProps extends NotificationConfig {
    /** Callback fired when the notification is closed. */
    onDismiss?: () => void;
    /** Custom CSS class. */
    className?: string;
    /** Custom CSS styles. */
    style?: CSSProperties;
}

/**
 * Props for the Minimap component.
 * @category UI & Interaction
 */
export interface MinimapProps extends Partial<MinimapConfig> {
    /** Array of interactive markers to show on the map. */
    markers?: Array<{ position: [number, number]; type?: string; id: string }>;
    /** Current player world position [x, z]. */
    playerPosition?: [number, number];
    /** Current player rotation in radians. */
    playerRotation?: number;
    /** URL for the static map background image. */
    mapImage?: string;
    /** Screen corner anchor point. Default: 'topRight'. */
    anchor?: UIAnchor;
    /** Custom CSS class. */
    className?: string;
    /** Custom CSS styles. */
    style?: CSSProperties;
}

/**
 * Props for the Crosshair component.
 * @category UI & Interaction
 */
export interface CrosshairProps extends Partial<CrosshairConfig> {
    /** Current reticle spread (e.g., from weapon recoil). */
    spread?: number;
    /** Custom CSS class. */
    className?: string;
    /** Custom CSS styles. */
    style?: CSSProperties;
}

export type {
    CrosshairConfig,
    DamageNumberConfig,
    DialogChoice,
    DialogConfig,
    DialogLine,
    InventoryConfig,
    InventorySlot,
    MinimapConfig,
    NameplateConfig,
    NotificationConfig,
    ProgressBarConfig,
    TooltipConfig,
    UIAnchor,
};
