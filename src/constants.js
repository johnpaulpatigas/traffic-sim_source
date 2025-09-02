// src/constants.js

// Conversion
export const PIXELS_PER_METER = 5;

// Vehicle Dimensions (meters)
export const CAR_LENGTH_M = 4.5;
export const CAR_WIDTH_M = 1.8;
export const MOTO_LENGTH_M = 2.2;
export const MOTO_WIDTH_M = 0.8;

// Vehicle Dimensions (pixels)
export const CAR_LENGTH = CAR_LENGTH_M * PIXELS_PER_METER;
export const CAR_WIDTH = CAR_WIDTH_M * PIXELS_PER_METER;
export const MOTO_LENGTH = MOTO_LENGTH_M * PIXELS_PER_METER;
export const MOTO_WIDTH = MOTO_WIDTH_M * PIXELS_PER_METER;

// Road & Intersection Dimensions (meters)
export const INTERSECTION_SIZE_M = 120;
export const NUM_LANES_PER_DIRECTION = 2;
export const ROAD_LANE_WIDTH_M = 3.5;
export const ROAD_WIDTH_M = ROAD_LANE_WIDTH_M * NUM_LANES_PER_DIRECTION * 2;

// Road & Intersection Dimensions (pixels)
export const LANE_WIDTH_PX = ROAD_LANE_WIDTH_M * PIXELS_PER_METER;
export const ROAD_WIDTH = ROAD_WIDTH_M * PIXELS_PER_METER;
export const SIMULATION_HEIGHT = INTERSECTION_SIZE_M * PIXELS_PER_METER;
export const SIMULATION_WIDTH = INTERSECTION_SIZE_M * PIXELS_PER_METER;
export const STOP_LINE_BUFFER = 5 * PIXELS_PER_METER;

// Simulation Parameters
export const APPROACH_THRESHOLD = 2 * PIXELS_PER_METER;
export const MAX_VEHICLES = 50;
export const MIN_SPEED_MPS = 0.1;

// Speed Limits
export const MAX_SPEED_KPH = 50;
export const MAX_SPEED_MPS = MAX_SPEED_KPH / 3.6;
export const TURN_SPEED_LIMIT_MPS = 20 / 3.6;

// IDM (Intelligent Driver Model) Parameters
export const IDM_ACCELERATION_EXPONENT = 4;
export const IDM_DESIRED_TIME_HEADWAY_S = 1.5;
export const IDM_MIN_SPACING_M = 2.0;

// Additional constants for the improved version
export const GRID_CELL_SIZE = 100;
export const STOPPING_DISTANCE_MULTIPLIER = 1.5;
export const SPAWN_PROBABILITY_BASE = 1000;
export const INTERSECTION_MARGIN_RATIO = 0.25;
export const VEHICLE_HISTORY_MAX_LENGTH = 1000;
export const DEBUG_MODE = false;
