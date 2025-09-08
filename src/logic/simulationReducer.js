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
  // MIN_SPEED_MPS, // MIN_SPEED_MPS should be 0 for realistic stops
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

// Ensure MIN_SPEED_MPS is 0 for realistic stopping behavior
const MIN_SPEED_MPS = 0; // Temporarily overriding here if not changed in constants.js

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

      // Check if vehicle has reached the end of its path
      if (vehicle.pathIndex >= vehicle.path.length) {
        state.stats.completedTrips.push({
          id: vehicle.id,
          waitTime: vehicle.waitTime,
        });
        returnVehicleToPool(vehicle);
        continue; // Skip this vehicle, it has completed its journey
      }

      // Update vehicle's target point and angle based on path
      if (vehicle.pathIndex < vehicle.path.length) {
        const targetPoint = vehicle.path[vehicle.pathIndex];
        const dx = targetPoint.x - vehicle.x;
        const dy = targetPoint.y - vehicle.y;
        vehicle.angle = Math.atan2(dy, dx);
        const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

        if (distanceToTarget < APPROACH_THRESHOLD) {
          vehicle.pathIndex++;
        }
      }
      // If the vehicle has a valid next path point after pathIndex increment,
      // it will continue to move towards it. If pathIndex is now out of bounds,
      // the vehicle will naturally slow down or stop unless new path is added.

      // Find leader for IDM
      const { leader, distanceToLeader_px } = findLeader(vehicle);
      let acceleration = calculateIDMAcceleration(
        vehicle,
        leader,
        distanceToLeader_px,
      );

      // Handle intersection and traffic light logic, which might override acceleration
      acceleration = handleIntersectionAndLights(vehicle, acceleration, state);

      // Update vehicle physics based on calculated acceleration
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
      // Skip invalid vehicle instead of crashing the simulation
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
    // Only consider vehicles going in roughly the same direction
    const angleToOther = Math.atan2(
      other.y - currentVehicle.y,
      other.x - currentVehicle.x,
    );
    const angleDiff = Math.abs(currentVehicle.angle - angleToOther);
    const normalizedAngleDiff =
      ((angleDiff + Math.PI) % (2 * Math.PI)) - Math.PI;

    if (Math.abs(normalizedAngleDiff) < Math.PI / 6) {
      // Check if 'other' is actually ahead of 'currentVehicle'
      // Project 'other' onto 'currentVehicle's path
      const dotProduct =
        (other.x - currentVehicle.x) * Math.cos(currentVehicle.angle) +
        (other.y - currentVehicle.y) * Math.sin(currentVehicle.angle);

      if (dotProduct > 0) {
        const dist_px = Math.sqrt(
          Math.pow(currentVehicle.x - other.x, 2) +
            Math.pow(currentVehicle.y - other.y, 2),
        );
        if (dist_px < distanceToLeader_px) {
          distanceToLeader_px = dist_px;
          leader = other;
        }
      }
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
    // Avoid division by zero or negative s
    if (s > 0) {
      interactionTerm = a * Math.pow(desiredGap / s, 2);
    } else {
      // If s is zero or negative, vehicles are overlapping or too close,
      // apply strong braking to resolve
      interactionTerm = a * Math.pow(desiredGap / 0.01, 2); // Use a small positive number
    }
  }

  return freeRoadTerm - interactionTerm;
}

// Helper to check if a vehicle is within the general intersection bounds
function isInIntersection(x, y, W, H, R) {
  const margin = ROAD_WIDTH * INTERSECTION_MARGIN_RATIO;
  const intersectionMinX = W / 2 - R - margin;
  const intersectionMaxX = W / 2 + R + margin;
  const intersectionMinY = H / 2 - R - margin;
  const intersectionMaxY = H / 2 + R + margin;

  return (
    x > intersectionMinX &&
    x < intersectionMaxX &&
    y > intersectionMinY &&
    y < intersectionMaxY
  );
}

function handleIntersectionAndLights(vehicle, currentAcceleration, state) {
  const { trafficLights } = state;
  const H = SIMULATION_HEIGHT;
  const R = ROAD_WIDTH / 2;
  const W = SIMULATION_WIDTH;

  let distanceToStopLine_px = Infinity;

  // Calculate distance to stop line based on vehicle's approach
  switch (vehicle.approach) {
    case "north": // Approaching from top, stop line at H/2 - R
      distanceToStopLine_px = H / 2 - R - vehicle.y;
      break;
    case "south": // Approaching from bottom, stop line at H/2 + R
      distanceToStopLine_px = vehicle.y - (H / 2 + R);
      break;
    case "east": // Approaching from right, stop line at W/2 + R
      distanceToStopLine_px = vehicle.x - (W / 2 + R);
      break;
    case "west": // Approaching from left, stop line at W/2 - R
      distanceToStopLine_px = W / 2 - R - vehicle.x;
      break;
  }

  // Define the zone where traffic light rules are actively applied.
  // This zone extends from a reasonable distance before the stop line to slightly past it.
  const LIGHT_INTERACTION_ZONE_START_PX = 100 * PIXELS_PER_METER; // e.g., 100 meters before the stop line
  const LIGHT_INTERACTION_ZONE_END_PX = CAR_LENGTH_M * PIXELS_PER_METER; // e.g., CAR_LENGTH meters past the stop line

  const atStopLineOrJustPast =
    distanceToStopLine_px < LIGHT_INTERACTION_ZONE_START_PX &&
    distanceToStopLine_px > -LIGHT_INTERACTION_ZONE_END_PX;

  const light = trafficLights[vehicle.approach];
  let virtualLeader = null;

  // Logic for stopping at red/yellow lights
  if (atStopLineOrJustPast) {
    const shouldStopForRed = () => {
      if (light === "red") {
        return true;
      }
      if (light === "yellow") {
        const stoppingDistance_m =
          vehicle.speed_mps ** 2 / (2 * vehicle.braking_mps2);
        const distanceToStopLine_m = distanceToStopLine_px / PIXELS_PER_METER;

        // If stopping distance is greater than actual distance to stop line, or if very close, stop.
        // Aggression threshold allows some vehicles to run yellow if they can't stop safely.
        return (
          (stoppingDistance_m > distanceToStopLine_m ||
            distanceToStopLine_m < CAR_LENGTH_M / 2) && // If too close to stop line, even aggressive drivers stop
          vehicle.aggression < 0.8
        );
      }
      return false;
    };

    if (shouldStopForRed()) {
      // Create a virtual leader at the stop line to force the vehicle to stop
      virtualLeader = { speed_mps: 0 };
    }
    // Removed: The 'else if (light === "green")' block that handled exit queue for straight vehicles.
    // This was causing vehicles to get stuck on green unnecessarily.
    // Downstream congestion should be handled by the IDM's findLeader function.
  }

  // Apply the virtual leader's effect if one was created (from red/yellow light logic)
  if (virtualLeader) {
    const stopDistance = Math.max(0, distanceToStopLine_px - STOP_LINE_BUFFER);
    return calculateIDMAcceleration(vehicle, virtualLeader, stopDistance);
  }

  // If no virtual leader (i.e., green light or not in interaction zone),
  // apply intersection-specific behaviors like turn speed limits.
  // This happens *after* any stop-light decisions.
  if (isInIntersection(vehicle.x, vehicle.y, W, H, R)) {
    if (
      vehicle.destination !== "straight" &&
      vehicle.speed_mps > TURN_SPEED_LIMIT_MPS
    ) {
      return -vehicle.braking_mps2; // Force braking for turns
    }
  }

  // No specific light or intersection override, return the acceleration calculated by IDM with physical leaders.
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

  // Clamp speed to valid range (MIN_SPEED_MPS is now 0)
  vehicle.speed_mps = Math.max(
    MIN_SPEED_MPS, // Allows full stop
    Math.min(vehicle.speed_mps, vehicle.maxSpeed_mps),
  );

  // If very close to a leader, ensure speed doesn't exceed leader's speed
  if (
    leader &&
    distanceToLeader_px <
      IDM_MIN_SPACING_M * PIXELS_PER_METER * STOPPING_DISTANCE_MULTIPLIER
  ) {
    vehicle.speed_mps = Math.min(vehicle.speed_mps, leader.speed_mps);
  }

  const distanceToMove_px = vehicle.speed_mps * PIXELS_PER_METER * deltaTime;

  // Only move if speed is above the minimum threshold (which is 0 now, so it will move even slowly)
  // The check for MIN_SPEED_MPS is still good practice to avoid floating point inaccuracies for "stopped" cars
  if (vehicle.speed_mps > MIN_SPEED_MPS) {
    vehicle.x += Math.cos(vehicle.angle) * distanceToMove_px;
    vehicle.y += Math.sin(vehicle.angle) * distanceToMove_px;
  }

  vehicle.status =
    vehicle.speed_mps < MIN_SPEED_MPS + 0.05 ? "waiting" : "moving"; // Added small buffer for "waiting" check
  if (vehicle.status === "waiting") vehicle.waitTime += deltaTime;
  vehicle.isBraking = acceleration < -0.5; // Threshold for displaying braking
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
      // Fallback if no specific lane allows the destination, pick any lane.
      // This could happen if a destination is restricted for an approach.
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
    case "north": // From top to bottom
      if (destination === "straight") return [{ x: startX, y: H + CAR_LENGTH }];
      if (destination === "left")
        return [
          { x: W / 2 - L2, y: H / 2 + L1 }, // Turn left towards east-bound lane (south side)
          { x: W + CAR_LENGTH, y: H / 2 + L1 },
        ];
      if (destination === "right")
        return [
          { x: W / 2 - L1, y: H / 2 - L2 }, // Turn right towards west-bound lane (north side)
          { x: -CAR_LENGTH, y: H / 2 - L2 },
        ];
      break;
    case "south": // From bottom to top
      if (destination === "straight") return [{ x: startX, y: -CAR_LENGTH }];
      if (destination === "left")
        return [
          { x: W / 2 + L2, y: H / 2 - L1 }, // Turn left towards west-bound lane (north side)
          { x: -CAR_LENGTH, y: H / 2 - L1 },
        ];
      if (destination === "right")
        return [
          { x: W / 2 + L1, y: H / 2 + L2 }, // Turn right towards east-bound lane (south side)
          { x: W + CAR_LENGTH, y: H / 2 + L2 },
        ];
      break;
    case "east": // From right to left
      if (destination === "straight") return [{ x: -CAR_LENGTH, y: startY }];
      if (destination === "left")
        return [
          { x: W / 2 - L1, y: H / 2 - L2 }, // Turn left towards north-bound lane (east side)
          { x: W / 2 - L1, y: H + CAR_LENGTH },
        ];
      if (destination === "right")
        return [
          { x: W / 2 + L2, y: H / 2 - L1 }, // Turn right towards south-bound lane (east side)
          { x: W / 2 + L2, y: -CAR_LENGTH },
        ];
      break;
    case "west": // From left to right
      if (destination === "straight") return [{ x: W + CAR_LENGTH, y: startY }];
      if (destination === "left")
        return [
          { x: W / 2 + L2, y: H / 2 + L1 }, // Turn left towards south-bound lane (west side)
          { x: W / 2 + L2, y: -CAR_LENGTH },
        ];
      if (destination === "right")
        return [
          { x: W / 2 - L1, y: H / 2 + L2 }, // Turn right towards north-bound lane (west side)
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
