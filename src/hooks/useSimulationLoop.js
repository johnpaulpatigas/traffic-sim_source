// src/hooks/useSimulationLoop.js

import { useEffect, useRef } from "react";

export const useSimulationLoop = (isRunning, callback) => {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const lastTimeRef = useRef(0);

  useEffect(() => {
    if (!isRunning) {
      lastTimeRef.current = 0;
      return;
    }

    let frameId;
    const loop = (timestamp) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = timestamp;
      } else {
        const deltaTime = (timestamp - lastTimeRef.current) / 1000;
        lastTimeRef.current = timestamp;
        callbackRef.current(deltaTime);
      }

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(frameId);
  }, [isRunning]);
};
