// src/logic/simulationReducer.js

import {
  APPROACH_THRESHOLD,
  CAR_LENGTH,
  CAR_LENGTH_M,
  IDM_ACCELERATION_EXPONENT,
  IDM_DESIRED_TIME_HEADWAY_S,
  IDM_MIN_SPACING_M,
  LANE_WIDTH_PX,
  MAX_SPEED_MPS,
  MAX_VEHICLES,
  MIN_SPEED_MPS,
  MOTO_LENGTH_M,
  PIXELS_PER_METER,
  ROAD_WIDTH,
  SIMULATION_HEIGHT,
  SIMULATION_WIDTH,
  STOP_LINE_BUFFER,
  TURN_SPEED_LIMIT_MPS,
  GRID_CELL_SIZE,
  STOPPING_DISTANCE_MULTIPLIER,
  SPAWN_PROBABILITY_BASE,
  INTERSECTION_MARGIN_RATIO,
  VEHICLE_HISTORY_MAX_LENGTH,
  DEBUG_MODE,
} from "../constants.js";

// Vehicle object pool
const vehiclePool = [];
function getVehicleFromPool() {
  return vehiclePool.length > 0 ? vehiclePool.pop() : {};
}

function returnVehicleToPool(vehicle) {
  Object.keys(vehicle).forEach((key) => delete vehicle[key]);
  vehiclePool.push(vehicle);
}

// Spatial partitioning grid
const spatialGrid = new Map();
function updateSpatialGrid(vehicles) {
  spatialGrid.clear();

  for (const vehicle of vehicles) {
    const gridX = Math.floor(vehicle.x / GRID_CELL_SIZE);
    const gridY = Math.floor(vehicle.y / GRID_CELL_SIZE);
    const gridKey = `${gridX},${gridY}`;

    if (!spatialGrid.has(gridKey)) {
      spatialGrid.set(gridKey, []);
    }
    spatialGrid.get(gridKey).push(vehicle);
  }
}

function getNearbyVehicles(vehicle) {
  const nearby = [];
  const centerX = Math.floor(vehicle.x / GRID_CELL_SIZE);
  const centerY = Math.floor(vehicle.y / GRID_CELL_SIZE);

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const gridKey = `${centerX + dx},${centerY + dy}`;
      if (spatialGrid.has(gridKey)) {
        nearby.push(...spatialGrid.get(gridKey));
      }
    }
  }

  return nearby.filter((v) => v.id !== vehicle.id);
}

// Path cache
const pathCache = new Map();
function getCachedPath(approach, destination, lane, startX, startY) {
  const key = `${approach}-${destination}-${lane}`;
  if (!pathCache.has(key)) {
    pathCache.set(
      key,
      generateSmoothPath(approach, destination, lane, startX, startY),
    );
  }
  return pathCache.get(key);
}

// Vehicle configuration
const vehicleConfigs = {
  motorcycle: {
    length: MOTO_LENGTH_M,
    accelerationBase: 3.0,
    accelerationRange: 1.0,
    brakingBase: 4.0,
    brakingRange: 1.0,
    speedMultiplier: 1.0,
  },
  car: {
    length: CAR_LENGTH_M,
    accelerationBase: 2.0,
    accelerationRange: 1.5,
    brakingBase: 3.0,
    brakingRange: 2.0,
    speedMultiplier: 1.0,
  },
};

function createVehiclePhysics(type, aggression) {
  const config = vehicleConfigs[type];
  return {
    aggression,
    maxSpeed_mps:
      MAX_SPEED_MPS * (1 + (aggression - 0.5) * 0.2) * config.speedMultiplier,
    acceleration_mps2:
      config.accelerationBase + aggression * config.accelerationRange,
    braking_mps2: config.brakingBase + aggression * config.brakingRange,
  };
}

// Validation
function validateVehicle(vehicle) {
  if (
    !vehicle ||
    typeof vehicle.x !== "number" ||
    typeof vehicle.y !== "number"
  ) {
    throw new Error("Invalid vehicle object: missing or invalid coordinates");
  }
  if (vehicle.speed_mps < 0 || vehicle.speed_mps > MAX_SPEED_MPS * 2) {
    throw new Error(`Invalid vehicle speed: ${vehicle.speed_mps}`);
  }
  return true;
}

// Debug metrics
const performanceMetrics = {
  updateVehicles: 0,
  updateLights: 0,
  spawnVehicles: 0,
  vehicleCount: 0,
};

const vehicleHistory = [];

export const initialState = {
  simulation: { isRunning: false, time: 0, needsAIDecision: false },
  config: {
    intersectionType: "cross",
    lightMode: "traditional",
    density: 40,
    motorcycleRatio: 0.6,
    traditionalGreenDuration: 30,
  },
  trafficLights: {
    north: "green",
    south: "red",
    east: "red",
    west: "red",
    countdownSeconds: 30,
    timeAccumulator: 0,
    cycleStep: 0,
    nextGreenDuration: 30,
    nextGreenDirection: "east",
  },
  vehicles: [],
  stats: {
    totalThroughput: 0,
    averageWaitTime: 0,
    queueLengths: { north: 0, south: 0, east: 0, west: 0 },
    longestWait: { north: 0, south: 0, east: 0, west: 0 },
    completedTrips: [],
  },
  ai: { reasoning: "AI is waiting for its turn.", isThinking: false },
  debug: {
    performance: performanceMetrics,
    vehicleHistory: DEBUG_MODE ? vehicleHistory : [],
  },
};

let nextVehicleId = 1;

export function simulationReducer(state, action) {
  switch (action.type) {
    case "START_SIM":
      return { ...state, simulation: { ...state.simulation, isRunning: true } };
    case "PAUSE_SIM":
      return {
        ...state,
        simulation: { ...state.simulation, isRunning: false },
      };
    case "RESET_SIM":
      return { ...initialState, config: state.config };
    case "UPDATE_CONFIG":
      return { ...state, config: { ...state.config, ...action.payload } };
    case "AI_THINKING":
      return {
        ...state,
        ai: { ...state.ai, isThinking: true, reasoning: "AI is analyzing..." },
        simulation: { ...state.simulation, needsAIDecision: false },
      };

    case "SET_AI_DECISION": {
      const payload = action.payload;
      const next_green_direction = payload.next_green_direction ?? "north";
      const green_light_duration = payload.green_light_duration ?? 15;
      const reasoning = payload.reasoning ?? "AI made a decision";

      const { trafficLights } = state;

      const newLights = {
        ...trafficLights,
        north: "red",
        south: "red",
        east: "red",
        west: "red",
        [next_green_direction]: "yellow",
        countdownSeconds: 3,
        timeAccumulator: 0,
        nextGreenDirection: next_green_direction,
        nextGreenDuration: green_light_duration,
      };

      return {
        ...state,
        trafficLights: newLights,
        ai: { reasoning, isThinking: false },
      };
    }
    case "TICK": {
      const { deltaTime } = action.payload;
      if (!deltaTime || deltaTime > 0.5) return state;

      if (DEBUG_MODE) performance.mark("tick-start");

      // Update spatial grid for efficient proximity checks
      updateSpatialGrid(state.vehicles);

      let newState = {
        ...state,
        trafficLights: { ...state.trafficLights },
        vehicles: [...state.vehicles],
        stats: {
          ...state.stats,
          completedTrips: [...state.stats.completedTrips],
        },
        ai: { ...state.ai },
      };

      // Update traffic lights
      if (DEBUG_MODE) performance.mark("updateLights-start");
      newState.trafficLights.timeAccumulator += deltaTime;
      if (newState.trafficLights.timeAccumulator >= 1.0) {
        newState.trafficLights.timeAccumulator -= 1.0;
        newState.trafficLights.countdownSeconds -= 1;
      }
      newState = updateTrafficLights(newState);
      if (DEBUG_MODE) {
        performance.mark("updateLights-end");
        performanceMetrics.updateLights = performance.measure(
          "updateLights",
          "updateLights-start",
          "updateLights-end",
        ).duration;
      }

      // Update vehicles
      if (DEBUG_MODE) performance.mark("updateVehicles-start");
      newState = updateVehicles(newState, deltaTime);
      if (DEBUG_MODE) {
        performance.mark("updateVehicles-end");
        performanceMetrics.updateVehicles = performance.measure(
          "updateVehicles",
          "updateVehicles-start",
          "updateVehicles-end",
        ).duration;
      }

      // Spawn new vehicles
      if (DEBUG_MODE) performance.mark("spawnVehicles-start");
      newState = spawnVehicles(newState);
      if (DEBUG_MODE) {
        performance.mark("spawnVehicles-end");
        performanceMetrics.spawnVehicles = performance.measure(
          "spawnVehicles",
          "spawnVehicles-start",
          "spawnVehicles-end",
        ).duration;
        performanceMetrics.vehicleCount = newState.vehicles.length;
      }

      // Calculate statistics
      newState = calculateStats(newState);

      if (DEBUG_MODE) {
        performance.mark("tick-end");
        const tickDuration = performance.measure(
          "tick",
          "tick-start",
          "tick-end",
        ).duration;
        performanceMetrics.tick = tickDuration;

        // Capture vehicle state for debugging
        if (vehicleHistory.length >= VEHICLE_HISTORY_MAX_LENGTH) {
          vehicleHistory.shift();
        }
        vehicleHistory.push(newState.vehicles.map((v) => ({ ...v })));
      }

      return newState;
    }
    default:
      throw new Error(`Unhandled action type: ${action.type}`);
  }
}

function updateTrafficLights(state) {
  let { trafficLights, config } = state;
  if (trafficLights.countdownSeconds > 0) return state;

  switch (config.lightMode) {
    case "traditional": {
      const cycle = [
        {
          direction: "north",
          light: "green",
          duration: config.traditionalGreenDuration,
        },
        { direction: "north", light: "yellow", duration: 3 },
        { direction: "all", light: "red", duration: 1 },
        {
          direction: "south",
          light: "green",
          duration: config.traditionalGreenDuration,
        },
        { direction: "south", light: "yellow", duration: 3 },
        { direction: "all", light: "red", duration: 1 },
        {
          direction: "east",
          light: "green",
          duration: config.traditionalGreenDuration,
        },
        { direction: "east", light: "yellow", duration: 3 },
        { direction: "all", light: "red", duration: 1 },
        {
          direction: "west",
          light: "green",
          duration: config.traditionalGreenDuration,
        },
        { direction: "west", light: "yellow", duration: 3 },
        { direction: "all", light: "red", duration: 1 },
      ];

      trafficLights.cycleStep = (trafficLights.cycleStep + 1) % cycle.length;
      const currentPhase = cycle[trafficLights.cycleStep];

      trafficLights.north = "red";
      trafficLights.south = "red";
      trafficLights.east = "red";
      trafficLights.west = "red";

      if (currentPhase.direction !== "all") {
        trafficLights[currentPhase.direction] = currentPhase.light;
      }

      trafficLights.countdownSeconds = currentPhase.duration;
      trafficLights.timeAccumulator = 0;
      break;
    }
    case "reason": {
      if (
        trafficLights.north === "yellow" ||
        trafficLights.south === "yellow" ||
        trafficLights.east === "yellow" ||
        trafficLights.west === "yellow"
      ) {
        const yellowDirection =
          trafficLights.north === "yellow"
            ? "north"
            : trafficLights.south === "yellow"
              ? "south"
              : trafficLights.east === "yellow"
                ? "east"
                : "west";

        trafficLights.north = "red";
        trafficLights.south = "red";
        trafficLights.east = "red";
        trafficLights.west = "red";
        trafficLights[yellowDirection] = "green";

        trafficLights.countdownSeconds = trafficLights.nextGreenDuration;
        trafficLights.timeAccumulator = 0;
      } else if (
        Object.values(trafficLights).some((light) => light === "green")
      ) {
        const greenDirection =
          trafficLights.north === "green"
            ? "north"
            : trafficLights.south === "green"
              ? "south"
              : trafficLights.east === "green"
                ? "east"
                : "west";

        trafficLights[greenDirection] = "yellow";
        trafficLights.countdownSeconds = 3;
        trafficLights.timeAccumulator = 0;
      } else {
        trafficLights.countdownSeconds = 1;
        trafficLights.timeAccumulator = 0;
      }
      break;
    }
  }
  return state;
}

function updateVehicles(state, deltaTime) {
  const { vehicles } = state;
  let newVehicles = [];

  for (const v of vehicles) {
    try {
      validateVehicle(v);
      let vehicle = { ...v };

      if (vehicle.pathIndex >= vehicle.path.length) {
        state.stats.completedTrips.push({
          id: vehicle.id,
          waitTime: vehicle.waitTime,
        });
        returnVehicleToPool(vehicle);
        continue;
      }

      if (vehicle.pathIndex < vehicle.path.length) {
        const targetPoint = vehicle.path[vehicle.pathIndex];
        const dx = targetPoint.x - vehicle.x;
        const dy = targetPoint.y - vehicle.y;
        vehicle.angle = Math.atan2(dy, dx);
        const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

        if (distanceToTarget < APPROACH_THRESHOLD) {
          vehicle.pathIndex++;
        }

        if (vehicle.pathIndex < vehicle.path.length) {
          const distanceToMove_px =
            vehicle.speed_mps * PIXELS_PER_METER * deltaTime;
          vehicle.x += Math.cos(vehicle.angle) * distanceToMove_px;
          vehicle.y += Math.sin(vehicle.angle) * distanceToMove_px;
        }
      }

      const { leader, distanceToLeader_px } = findLeader(vehicle);
      let acceleration = calculateIDMAcceleration(
        vehicle,
        leader,
        distanceToLeader_px,
      );
      acceleration = handleIntersectionAndLights(vehicle, acceleration, state);
      updatePhysics(
        vehicle,
        acceleration,
        deltaTime,
        leader,
        distanceToLeader_px,
      );
      newVehicles.push(vehicle);
    } catch (error) {
      console.error("Error updating vehicle:", error, v);
      // Skip invalid vehicle instead of crashing
    }
  }

  return {
    ...state,
    vehicles: newVehicles,
    stats: { ...state.stats, completedTrips: [...state.stats.completedTrips] },
  };
}

function findLeader(currentVehicle) {
  let leader = null;
  let distanceToLeader_px = Infinity;

  // Use spatial grid for efficient proximity search
  const nearbyVehicles = getNearbyVehicles(currentVehicle);

  for (const other of nearbyVehicles) {
    const dist_px = Math.sqrt(
      Math.pow(currentVehicle.x - other.x, 2) +
        Math.pow(currentVehicle.y - other.y, 2),
    );
    const angleToOther = Math.atan2(
      other.y - currentVehicle.y,
      other.x - currentVehicle.x,
    );

    const angleDiff = Math.abs(currentVehicle.angle - angleToOther);
    const normalizedAngleDiff =
      ((angleDiff + Math.PI) % (2 * Math.PI)) - Math.PI;

    if (
      Math.abs(normalizedAngleDiff) < Math.PI / 6 &&
      dist_px < distanceToLeader_px
    ) {
      distanceToLeader_px = dist_px;
      leader = other;
    }
  }

  return { leader, distanceToLeader_px };
}

function calculateIDMAcceleration(vehicle, leader, distanceToLeader_px) {
  const v = vehicle.speed_mps;
  const v0 = vehicle.maxSpeed_mps;
  const a = vehicle.acceleration_mps2;
  const b = vehicle.braking_mps2;
  const T = IDM_DESIRED_TIME_HEADWAY_S;
  const s0 = IDM_MIN_SPACING_M;
  const delta = IDM_ACCELERATION_EXPONENT;

  const freeRoadTerm = a * (1 - Math.pow(v / v0, delta));
  let interactionTerm = 0;

  if (leader) {
    const s = distanceToLeader_px / PIXELS_PER_METER;
    const delta_v = v - leader.speed_mps;
    const desiredGap =
      s0 + Math.max(0, v * T + (v * delta_v) / (2 * Math.sqrt(a * b)));
    interactionTerm = a * Math.pow(desiredGap / s, 2);
  }

  return freeRoadTerm - interactionTerm;
}

function getExitQueueInfo(exitApproach, vehicles) {
  let frontVehicleInQueue = null;
  let minDistance = Infinity;
  const W = SIMULATION_WIDTH;
  const H = SIMULATION_HEIGHT;

  for (const v of vehicles) {
    if (v.approach === exitApproach && v.status === "waiting") {
      const dist = Math.sqrt(
        Math.pow(v.x - W / 2, 2) + Math.pow(v.y - H / 2, 2),
      );
      if (dist < minDistance) {
        minDistance = dist;
        frontVehicleInQueue = v;
      }
    }
  }

  return { frontVehicleInQueue };
}

function handleIntersectionAndLights(vehicle, currentAcceleration, state) {
  const { trafficLights, vehicles } = state;
  const H = SIMULATION_HEIGHT;
  const R = ROAD_WIDTH / 2;
  const W = SIMULATION_WIDTH;

  const stopLineY = H / 2 - R;

  let distanceToStopLine_px = Infinity;
  let isApproaching = false;

  switch (vehicle.approach) {
    case "north":
      distanceToStopLine_px = stopLineY - vehicle.y;
      isApproaching =
        distanceToStopLine_px < 100 * PIXELS_PER_METER &&
        distanceToStopLine_px > -CAR_LENGTH;
      break;
    case "south":
      distanceToStopLine_px = vehicle.y - (H / 2 + R);
      isApproaching =
        distanceToStopLine_px < 100 * PIXELS_PER_METER &&
        distanceToStopLine_px > -CAR_LENGTH;
      break;
    case "east":
      distanceToStopLine_px = vehicle.x - (W / 2 + R);
      isApproaching =
        distanceToStopLine_px < 100 * PIXELS_PER_METER &&
        distanceToStopLine_px > -CAR_LENGTH;
      break;
    case "west":
      distanceToStopLine_px = W / 2 - R - vehicle.x;
      isApproaching =
        distanceToStopLine_px < 100 * PIXELS_PER_METER &&
        distanceToStopLine_px > -CAR_LENGTH;
      break;
  }

  const isInIntersection = (x, y, approach) => {
    const intersectionMargin = ROAD_WIDTH * INTERSECTION_MARGIN_RATIO;

    switch (approach) {
      case "north":
        return (
          y > H / 2 - R - intersectionMargin &&
          y < H / 2 + R + intersectionMargin &&
          x > W / 2 - R &&
          x < W / 2 + R
        );
      case "south":
        return (
          y > H / 2 - R &&
          y < H / 2 + R + intersectionMargin &&
          x > W / 2 - R &&
          x < W / 2 + R
        );
      case "east":
        return (
          x > W / 2 - R - intersectionMargin &&
          x < W / 2 + R + intersectionMargin &&
          y > H / 2 - R &&
          y < H / 2 + R
        );
      case "west":
        return (
          x > W / 2 - R &&
          x < W / 2 + R + intersectionMargin &&
          y > H / 2 - R &&
          y < H / 2 + R
        );
      default:
        return Math.abs(x - W / 2) < R && Math.abs(y - H / 2) < R;
    }
  };

  if (isInIntersection(vehicle.x, vehicle.y, vehicle.approach)) {
    if (
      vehicle.destination !== "straight" &&
      vehicle.speed_mps > TURN_SPEED_LIMIT_MPS
    ) {
      return -vehicle.braking_mps2;
    }
    return currentAcceleration;
  }

  if (isApproaching) {
    const light = trafficLights[vehicle.approach];
    let virtualLeader = null;

    const shouldStopForRed = () => {
      if (light === "red") {
        return true;
      }

      if (light === "yellow") {
        const stoppingDistance =
          vehicle.speed_mps ** 2 / (2 * vehicle.braking_mps2);

        return (
          stoppingDistance > distanceToStopLine_px / PIXELS_PER_METER &&
          vehicle.aggression < 0.8
        );
      }

      return false;
    };

    if (shouldStopForRed()) {
      virtualLeader = { speed_mps: 0 };
    } else if (light === "green") {
      if (vehicle.destination === "straight") {
        const exitApproaches = {
          north: "south",
          south: "north",
          east: "west",
          west: "east",
        };
        const exitApproach = exitApproaches[vehicle.approach];
        const { frontVehicleInQueue } = getExitQueueInfo(
          exitApproach,
          vehicles,
        );

        if (frontVehicleInQueue) {
          let availableGap_px = 0;
          if (exitApproach === "north")
            availableGap_px = frontVehicleInQueue.y - (H / 2 + R);
          if (exitApproach === "south")
            availableGap_px = H / 2 - R - frontVehicleInQueue.y;
          if (exitApproach === "east")
            availableGap_px = frontVehicleInQueue.x - (W / 2 + R);
          if (exitApproach === "west")
            availableGap_px = W / 2 - R - frontVehicleInQueue.x;

          const vehicleLength_px =
            (vehicle.type === "motorcycle" ? MOTO_LENGTH_M : CAR_LENGTH_M) *
            PIXELS_PER_METER;

          if (
            availableGap_px <
            vehicleLength_px + IDM_MIN_SPACING_M * PIXELS_PER_METER
          ) {
            virtualLeader = { speed_mps: 0 };
          }
        }
      }
    }

    if (virtualLeader) {
      const stopDistance = Math.max(
        0,
        distanceToStopLine_px - STOP_LINE_BUFFER,
      );
      return calculateIDMAcceleration(vehicle, virtualLeader, stopDistance);
    }
  }

  return currentAcceleration;
}

function updatePhysics(
  vehicle,
  acceleration,
  deltaTime,
  leader,
  distanceToLeader_px,
) {
  vehicle.speed_mps += acceleration * deltaTime;

  vehicle.speed_mps = Math.max(
    MIN_SPEED_MPS,
    Math.min(vehicle.speed_mps, vehicle.maxSpeed_mps),
  );

  if (
    leader &&
    distanceToLeader_px <
      IDM_MIN_SPACING_M * PIXELS_PER_METER * STOPPING_DISTANCE_MULTIPLIER
  ) {
    vehicle.speed_mps = Math.min(vehicle.speed_mps, leader.speed_mps);
  }

  const distanceToMove_px = vehicle.speed_mps * PIXELS_PER_METER * deltaTime;

  if (vehicle.speed_mps > MIN_SPEED_MPS) {
    vehicle.x += Math.cos(vehicle.angle) * distanceToMove_px;
    vehicle.y += Math.sin(vehicle.angle) * distanceToMove_px;
  }

  vehicle.status =
    vehicle.speed_mps < MIN_SPEED_MPS + 0.1 ? "waiting" : "moving";
  if (vehicle.status === "waiting") vehicle.waitTime += deltaTime;
  vehicle.isBraking = acceleration < -0.5;
}

function spawnVehicles(state) {
  const { config, vehicles } = state;

  if (vehicles.length >= MAX_VEHICLES) return state;

  const spawnChance = config.density / SPAWN_PROBABILITY_BASE;
  if (Math.random() < spawnChance) {
    const W = SIMULATION_WIDTH;
    const H = SIMULATION_HEIGHT;
    const L1 = LANE_WIDTH_PX / 2;
    const L2 = LANE_WIDTH_PX + L1;

    const startPositions = [
      {
        approach: "north",
        lanes: [
          { id: 0, x: W / 2 - L1, allowed: ["left", "straight"] },
          { id: 1, x: W / 2 - L2, allowed: ["right", "straight"] },
        ],
        y: -CAR_LENGTH,
      },
      {
        approach: "south",
        lanes: [
          { id: 0, x: W / 2 + L1, allowed: ["left", "straight"] },
          { id: 1, x: W / 2 + L2, allowed: ["right", "straight"] },
        ],
        y: H + CAR_LENGTH,
      },
      {
        approach: "west",
        lanes: [
          { id: 0, y: H / 2 + L1, allowed: ["left", "straight"] },
          { id: 1, y: H / 2 + L2, allowed: ["right", "straight"] },
        ],
        x: -CAR_LENGTH,
      },
      {
        approach: "east",
        lanes: [
          { id: 0, y: H / 2 - L1, allowed: ["left", "straight"] },
          { id: 1, y: H / 2 - L2, allowed: ["right", "straight"] },
        ],
        x: W + CAR_LENGTH,
      },
    ];

    let availableStarts =
      config.intersectionType === "t-junction"
        ? startPositions.filter((p) => p.approach !== "south")
        : startPositions;

    const startApproach =
      availableStarts[Math.floor(Math.random() * availableStarts.length)];

    let possibleDestinations = ["straight", "left", "right"];
    if (config.intersectionType === "t-junction") {
      if (startApproach.approach === "north")
        possibleDestinations = ["left", "right"];
      if (startApproach.approach === "east")
        possibleDestinations = ["straight", "left"];
      if (startApproach.approach === "west")
        possibleDestinations = ["straight", "right"];
    }

    const destination =
      possibleDestinations[
        Math.floor(Math.random() * possibleDestinations.length)
      ];

    const allowedLanes = startApproach.lanes.filter((lane) =>
      lane.allowed.includes(destination),
    );

    if (allowedLanes.length === 0) {
      allowedLanes.push(startApproach.lanes[0]);
    }

    const startLane =
      allowedLanes[Math.floor(Math.random() * allowedLanes.length)];

    const startX = startLane.x ?? startApproach.x;
    const startY = startLane.y ?? startApproach.y;

    const paths = getCachedPath(
      startApproach.approach,
      destination,
      startLane.id,
      startX,
      startY,
    );

    const type = Math.random() < config.motorcycleRatio ? "motorcycle" : "car";
    const aggression = Math.random();

    const newVehicle = getVehicleFromPool();
    Object.assign(newVehicle, {
      id: nextVehicleId++,
      type,
      x: startX,
      y: startY,
      speed_mps: 0,
      angle: 0,
      reactionTimer: 0,
      isBraking: false,
      approach: startApproach.approach,
      lane: startLane.id,
      destination: destination,
      status: "moving",
      waitTime: 0,
      path: paths,
      pathIndex: 0,
      ...createVehiclePhysics(type, aggression),
    });

    state.vehicles.push(newVehicle);
  }
  return state;
}

function generateSmoothPath(approach, destination, lane, startX, startY) {
  const W = SIMULATION_WIDTH;
  const H = SIMULATION_HEIGHT;
  const L1 = LANE_WIDTH_PX / 2;
  const L2 = LANE_WIDTH_PX + L1;

  // Simple linear paths for now - could be enhanced with Bezier curves
  switch (approach) {
    case "north":
      if (destination === "straight") return [{ x: startX, y: H + CAR_LENGTH }];
      if (destination === "left")
        return [
          { x: W / 2 - L2, y: H / 2 + L1 },
          { x: W + CAR_LENGTH, y: H / 2 + L1 },
        ];
      if (destination === "right")
        return [
          { x: W / 2 - L1, y: H / 2 - L2 },
          { x: -CAR_LENGTH, y: H / 2 - L2 },
        ];
      break;
    case "south":
      if (destination === "straight") return [{ x: startX, y: -CAR_LENGTH }];
      if (destination === "left")
        return [
          { x: W / 2 + L2, y: H / 2 - L1 },
          { x: -CAR_LENGTH, y: H / 2 - L1 },
        ];
      if (destination === "right")
        return [
          { x: W / 2 + L1, y: H / 2 + L2 },
          { x: W + CAR_LENGTH, y: H / 2 + L2 },
        ];
      break;
    case "east":
      if (destination === "straight") return [{ x: -CAR_LENGTH, y: startY }];
      if (destination === "left")
        return [
          { x: W / 2 - L1, y: H / 2 - L2 },
          { x: W / 2 - L1, y: H + CAR_LENGTH },
        ];
      if (destination === "right")
        return [
          { x: W / 2 + L2, y: H / 2 - L1 },
          { x: W / 2 + L2, y: -CAR_LENGTH },
        ];
      break;
    case "west":
      if (destination === "straight") return [{ x: W + CAR_LENGTH, y: startY }];
      if (destination === "left")
        return [
          { x: W / 2 + L2, y: H / 2 + L1 },
          { x: W / 2 + L2, y: -CAR_LENGTH },
        ];
      if (destination === "right")
        return [
          { x: W / 2 - L1, y: H / 2 + L2 },
          { x: W / 2 - L1, y: H + CAR_LENGTH },
        ];
      break;
  }
  return [];
}

function calculateStats(state) {
  const { vehicles, stats } = state;
  const newQueueLengths = { north: 0, south: 0, east: 0, west: 0 };
  const newLongestWait = { north: 0, south: 0, east: 0, west: 0 };

  for (const v of vehicles) {
    if (v.status === "waiting") {
      newQueueLengths[v.approach]++;
      if (v.waitTime > newLongestWait[v.approach]) {
        newLongestWait[v.approach] = v.waitTime;
      }
    }
  }

  const totalWait = stats.completedTrips.reduce(
    (sum, trip) => sum + trip.waitTime,
    0,
  );

  const newAverageWaitTime =
    stats.completedTrips.length > 0
      ? totalWait / stats.completedTrips.length
      : 0;

  const newStats = {
    completedTrips: stats.completedTrips,
    queueLengths: newQueueLengths,
    longestWait: newLongestWait,
    averageWaitTime: newAverageWaitTime,
    totalThroughput: stats.completedTrips.length,
  };

  return { ...state, stats: newStats };
}
