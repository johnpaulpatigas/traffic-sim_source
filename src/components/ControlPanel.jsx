// src/components/ControlPanel.jsx

export const ControlPanel = ({ config, dispatch, simulation }) => {
  const handleConfigChange = (e) => {
    const { name, value, type } = e.target;
    dispatch({
      type: "UPDATE_CONFIG",
      payload: { [name]: type === "range" ? Number(value) : value },
    });
  };

  return (
    <div className="space-y-4 rounded-lg bg-gray-700 p-4 shadow-lg">
      <div className="flex space-x-2">
        <button
          onClick={() =>
            dispatch({ type: simulation.isRunning ? "PAUSE_SIM" : "START_SIM" })
          }
          className={`w-full rounded px-4 py-2 font-bold ${simulation.isRunning ? "bg-yellow-500 hover:bg-yellow-600" : "bg-green-500 hover:bg-green-600"}`}
        >
          {simulation.isRunning ? "Pause" : "Start"}
        </button>
        <button
          onClick={() => dispatch({ type: "RESET_SIM" })}
          className="w-full rounded bg-red-600 px-4 py-2 font-bold hover:bg-red-700"
        >
          Reset
        </button>
      </div>

      <h2 className="border-b border-gray-500 pb-2 text-xl font-bold">
        Configuration
      </h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="intersectionType"
            className="block text-sm font-medium text-gray-300"
          >
            Intersection
          </label>
          <select
            id="intersectionType"
            name="intersectionType"
            value={config.intersectionType}
            onChange={handleConfigChange}
            className="mt-1 block w-full rounded-md border-gray-500 bg-gray-600 shadow-sm"
          >
            <option value="cross">Cross</option>
            <option value="t-junction">T-Junction</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="lightMode"
            className="block text-sm font-medium text-gray-300"
          >
            Light Mode
          </label>
          <select
            id="lightMode"
            name="lightMode"
            value={config.lightMode}
            onChange={handleConfigChange}
            className="mt-1 block w-full rounded-md border-gray-500 bg-gray-600 shadow-sm"
          >
            <option value="traditional">Traditional</option>
            <option value="reason">Gemini AI</option>
          </select>
        </div>
      </div>

      <div>
        <label
          htmlFor="density"
          className="block text-sm font-medium text-gray-300"
        >
          Traffic Density: {config.density}
        </label>
        <input
          type="range"
          id="density"
          name="density"
          min="1"
          max="100"
          value={config.density}
          onChange={handleConfigChange}
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-500"
        />
      </div>

      <div>
        <label
          htmlFor="motorcycleRatio"
          className="block text-sm font-medium text-gray-300"
        >
          Motorcycle Ratio: {Math.round(config.motorcycleRatio * 100)}%
        </label>
        <input
          type="range"
          id="motorcycleRatio"
          name="motorcycleRatio"
          min="0"
          max="1"
          step="0.05"
          value={config.motorcycleRatio}
          onChange={handleConfigChange}
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-500"
        />
      </div>
    </div>
  );
};
