// components/TrafficLightPole.jsx

import React, { useMemo } from "react";
import { ROAD_WIDTH, SIMULATION_HEIGHT, SIMULATION_WIDTH } from "../constants";

const Light = React.memo(({ color }) => {
  const colorMap = {
    red: "bg-red-500 ring-red-400",
    yellow: "bg-yellow-400 ring-yellow-300",
    green: "bg-green-500 ring-green-400",
  };
  return (
    <div
      className={`h-5 w-5 rounded-full ring-2 ring-offset-2 ring-offset-black ${colorMap[color] || "bg-gray-700 ring-gray-600"}`}
    ></div>
  );
});

export const TrafficLightPole = React.memo(
  ({ forLane, lightColor, timerValue }) => {
    const timerColor = lightColor === "red" ? "text-red-400" : "text-green-400";
    const R = ROAD_WIDTH / 2;
    const centerX = SIMULATION_WIDTH / 2;
    const centerY = SIMULATION_HEIGHT / 2;

    const positionStyles = useMemo(() => {
      const offset = 20;

      switch (forLane) {
        case "north":
          return {
            top: centerY - R - offset,
            left: centerX - R,
            transform: "translate(-50%, -100%)",
          };
        case "south":
          return {
            top: centerY + R + offset,
            left: centerX + R,
            transform: "translate(-50%, 0%)",
          };
        case "west":
          return {
            left: centerX - R - offset,
            top: centerY + R,
            transform: "translate(-100%, -50%)",
          };
        case "east":
          return {
            left: centerX + R + offset,
            top: centerY - R,
            transform: "translate(0%, -50%)",
          };
        default:
          return {};
      }
    }, [forLane, centerX, centerY, R]);

    return (
      <div
        className="absolute flex flex-col items-center space-y-2 p-2"
        style={positionStyles}
      >
        <div
          className={`font-mono text-xl font-bold ${timerColor} rounded-md bg-black px-2 py-1`}
        >
          {timerValue}
        </div>
        <div className="rounded-lg bg-black p-2">
          <Light color={lightColor} />
        </div>
      </div>
    );
  },
);
