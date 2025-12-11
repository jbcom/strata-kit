import { useState, useEffect } from 'react';
import { Strata } from '../index';
import type { ControlHints } from '../definitions';
import { useDevice } from './useDevice';

const defaultHints: ControlHints = {
  movement: 'WASD to move',
  action: 'Click to interact',
  camera: 'Mouse to look',
};

export function useControlHints(): ControlHints {
  const [hints, setHints] = useState<ControlHints>(defaultHints);
  const device = useDevice();

  useEffect(() => {
    Strata.getControlHints().then(setHints);
  }, [device.inputMode]);

  return hints;
}
