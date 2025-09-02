// src/App.jsx
import { useCallback, useEffect, useReducer } from "react";
import { ControlPanel } from "./components/ControlPanel";
import { GeminiReasoningLog } from "./components/GeminiReasoningLog";
import { SimulationCanvas } from "./components/SimulationCanvas";
import { StatsDisplay } from "./components/StatsDisplay";
import { useSimulationLoop } from "./hooks/useSimulationLoop";
import { initialState, simulationReducer } from "./logic/simulationReducer";
import { getAITrafficDecision } from "./services/geminiService";

function App() {
  const [state, dispatch] = useReducer(simulationReducer, initialState);

  const tick = useCallback((deltaTime) => {
    dispatch({ type: "TICK", payload: { deltaTime } });
  }, []);

  useSimulationLoop(state.simulation.isRunning, tick);

  useEffect(() => {
    const { config, trafficLights, ai, simulation } = state;

    const isGreenPhase = Object.values(trafficLights).some(
      (light) => light === "green",
    );

    if (
      simulation.isRunning &&
      config.lightMode === "reason" &&
      isGreenPhase &&
      trafficLights.countdownSeconds <= 2 &&
      !ai.isThinking
    ) {
      const fetchAIDecision = async () => {
        dispatch({ type: "AI_THINKING" });
        const decision = await getAITrafficDecision(state);
        dispatch({ type: "SET_AI_DECISION", payload: decision });
      };

      fetchAIDecision();
    }
  }, [
    state.trafficLights.countdownSeconds,
    state.simulation.isRunning,
    state.config.lightMode,
    state.ai.isThinking,
    state,
  ]);

  return (
    <div className="flex min-h-screen flex-col gap-4 overflow-hidden bg-gray-800 p-4 font-sans text-white lg:flex-row">
      <div className="flex flex-grow items-center justify-center">
        <SimulationCanvas
          vehicles={state.vehicles}
          trafficLights={state.trafficLights}
          config={state.config}
        />
      </div>

      <div className="w-full flex-shrink-0 space-y-4 lg:w-96">
        <h1 className="text-center text-3xl font-bold text-cyan-400">
          Traffic Flow Simulator
        </h1>
        <ControlPanel
          config={state.config}
          dispatch={dispatch}
          simulation={state.simulation}
          stats={state.stats}
        />
        <StatsDisplay stats={state.stats} />
        {state.config.lightMode === "reason" && (
          <GeminiReasoningLog ai={state.ai} />
        )}
      </div>
    </div>
  );
}

export default App;
