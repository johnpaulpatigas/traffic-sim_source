// src/components/SimulationCanvas.jsx

import { Road } from "./Road";
import { TrafficLightPole } from "./TrafficLightPole";
import { Vehicle } from "./Vehicle";

const SIMULATION_WIDTH_PX = 120 * 5;
const SIMULATION_HEIGHT_PX = 120 * 5;

export const SimulationCanvas = ({ vehicles, trafficLights, config }) => {
  const isTJunction = config.intersectionType === "t-junction";

  return (
    <div
      className="relative border-4 border-gray-500 bg-green-800"
      style={{
        width: SIMULATION_WIDTH_PX,
        height: SIMULATION_HEIGHT_PX,
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.05) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,0.05) 2px, transparent 2px)",
        backgroundSize: "50px 50px",
      }}
    >
      <Road intersectionType={config.intersectionType} />

      {/* Traffic Light Poles with new, unambiguous stop-line placement */}
      {/* Light for cars coming FROM the North */}
      <TrafficLightPole
        forLane="north"
        lightColor={trafficLights.north}
        timerValue={trafficLights.countdownSeconds}
      />
      {/* Light for cars coming FROM the West */}
      <TrafficLightPole
        forLane="west"
        lightColor={trafficLights.west}
        timerValue={trafficLights.countdownSeconds}
      />
      {/* Light for cars coming FROM the East */}
      <TrafficLightPole
        forLane="east"
        lightColor={trafficLights.east}
        timerValue={trafficLights.countdownSeconds}
      />
      {/* Light for cars coming FROM the South (not rendered on T-Junction) */}
      {!isTJunction && (
        <TrafficLightPole
          forLane="south"
          lightColor={trafficLights.south}
          timerValue={trafficLights.countdownSeconds}
        />
      )}

      {/* Vehicles */}
      {vehicles.map((v) => (
        <Vehicle key={v.id} vehicle={v} />
      ))}
    </div>
  );
};
