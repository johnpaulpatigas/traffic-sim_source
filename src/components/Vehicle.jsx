// components/Vehicle.jsx
import React, { useMemo } from "react";
import { CAR_LENGTH, CAR_WIDTH, MOTO_LENGTH, MOTO_WIDTH } from "../constants";

export const Vehicle = React.memo(({ vehicle }) => {
  const { x, y, angle, type, isBraking } = vehicle;

  const { vehicleColor, width, height, transformStyle } = useMemo(() => {
    let vehicleColor, width, height;

    switch (type) {
      case "motorcycle":
        vehicleColor = "bg-yellow-500";
        width = MOTO_WIDTH;
        height = MOTO_LENGTH;
        break;
      default: // car
        vehicleColor = "bg-blue-500";
        width = CAR_WIDTH;
        height = CAR_LENGTH;
        break;
    }

    const brakingClass = isBraking ? "shadow-lg shadow-red-500/75" : "";
    const transform = `translate(-50%, -50%) rotate(${angle + Math.PI / 2}rad)`;

    return {
      vehicleColor: `${vehicleColor} ${brakingClass}`,
      width,
      height,
      transformStyle: { transform },
    };
  }, [type, isBraking, angle]);

  return (
    <div
      className={`absolute rounded-sm ${vehicleColor} flex justify-center`}
      style={{
        left: x,
        top: y,
        width,
        height,
        ...transformStyle,
        transition: "box-shadow 150ms ease-out",
      }}
    >
      <div
        className="absolute rounded-sm bg-black/30"
        style={{
          width: "80%",
          height: "25%",
          top: "10%",
        }}
      ></div>
    </div>
  );
});
