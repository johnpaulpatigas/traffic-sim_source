// src/components/Road.jsx

const PIXELS_PER_METER = 5;
const ROAD_LANE_WIDTH_PX = 3.5 * PIXELS_PER_METER;
const ROAD_WIDTH_PX = ROAD_LANE_WIDTH_PX * 2 * 2;
const SIMULATION_WIDTH_PX = 120 * PIXELS_PER_METER;
const SIMULATION_HEIGHT_PX = 120 * PIXELS_PER_METER;

const RoadLine = ({
  x1,
  y1,
  x2,
  y2,
  dashed = false,
  color = "rgba(255, 255, 255, 0.3)",
}) => (
  <line
    x1={x1}
    y1={y1}
    x2={x2}
    y2={y2}
    stroke={color}
    strokeWidth="2"
    strokeDasharray={dashed ? "15, 25" : "none"}
  />
);

const StopLine = ({ x, y, width, height }) => (
  <rect
    x={x}
    y={y}
    width={width}
    height={height}
    fill="rgba(255, 255, 255, 0.7)"
  />
);

export const Road = ({ intersectionType }) => {
  const isTJunction = intersectionType === "t-junction";
  const W = SIMULATION_WIDTH_PX;
  const H = SIMULATION_HEIGHT_PX;
  const R = ROAD_WIDTH_PX / 2;
  const L = ROAD_LANE_WIDTH_PX;

  return (
    <div className="absolute inset-0">
      {/* Pavement */}
      <div
        className="absolute bg-gray-700"
        style={{
          left: W / 2 - R,
          top: 0,
          width: R * 2,
          height: isTJunction ? H / 2 : H,
        }}
      ></div>
      {!isTJunction && (
        <div
          className="absolute bg-gray-700"
          style={{ left: W / 2 - R, top: H / 2, width: R * 2, height: H / 2 }}
        ></div>
      )}
      <div
        className="absolute bg-gray-700"
        style={{ left: 0, top: H / 2 - R, width: W, height: R * 2 }}
      ></div>

      <svg width={W} height={H} className="absolute inset-0">
        {/* --- Lane Dividers --- */}
        {/* Yellow Center Lines */}
        <RoadLine x1={W / 2} y1={0} x2={W / 2} y2={H / 2 - R} color="yellow" />
        {!isTJunction && (
          <RoadLine
            x1={W / 2}
            y1={H / 2 + R}
            x2={W / 2}
            y2={H}
            color="yellow"
          />
        )}
        <RoadLine x1={0} y1={H / 2} x2={W / 2 - R} y2={H / 2} color="yellow" />
        <RoadLine x1={W / 2 + R} y1={H / 2} x2={W} y2={H / 2} color="yellow" />

        {/* White Dashed Lane Lines */}
        <RoadLine x1={W / 2 - L} y1={0} x2={W / 2 - L} y2={H / 2 - R} dashed />
        <RoadLine x1={W / 2 + L} y1={0} x2={W / 2 + L} y2={H / 2 - R} dashed />
        {!isTJunction && (
          <>
            <RoadLine
              x1={W / 2 - L}
              y1={H / 2 + R}
              x2={W / 2 - L}
              y2={H}
              dashed
            />
            <RoadLine
              x1={W / 2 + L}
              y1={H / 2 + R}
              x2={W / 2 + L}
              y2={H}
              dashed
            />
          </>
        )}
        <RoadLine x1={0} y1={H / 2 - L} x2={W / 2 - R} y2={H / 2 - L} dashed />
        <RoadLine x1={0} y1={H / 2 + L} x2={W / 2 - R} y2={H / 2 + L} dashed />
        <RoadLine x1={W / 2 + R} y1={H / 2 - L} x2={W} y2={H / 2 - L} dashed />
        <RoadLine x1={W / 2 + R} y1={H / 2 + L} x2={W} y2={H / 2 + L} dashed />

        {/* Stop Lines */}
        <StopLine x={W / 2 - R} y={H / 2 - R - 4} width={R} height="4" />
        {!isTJunction && (
          <StopLine x={W / 2} y={H / 2 + R} width={R} height="4" />
        )}
        <StopLine x={W / 2 - R - 4} y={H / 2} width="4" height={R} />
        <StopLine x={W / 2 + R} y={H / 2 - R} width="4" height={R} />
      </svg>
    </div>
  );
};
