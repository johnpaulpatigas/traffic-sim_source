// src/components/StatsDisplay.jsx

export const StatsDisplay = ({ stats }) => {
  const totalThroughput = stats?.totalThroughput ?? 0;
  const averageWaitTime = stats?.averageWaitTime ?? 0;
  const queueLengths = stats?.queueLengths ?? {
    north: 0,
    south: 0,
    east: 0,
    west: 0,
  };
  const longestWait = stats?.longestWait ?? {
    north: 0,
    south: 0,
    east: 0,
    west: 0,
  };

  return (
    <div className="rounded-lg bg-gray-700 p-4 shadow-lg">
      <h2 className="mb-2 border-b border-gray-500 pb-2 text-xl font-bold">
        Live Statistics
      </h2>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Throughput (Vehicles):</span>
          <span className="rounded bg-gray-800 px-2 font-mono">
            {totalThroughput}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Avg. Wait Time (s):</span>
          <span className="rounded bg-gray-800 px-2 font-mono">
            {averageWaitTime.toFixed(2)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 pt-2">
          <div>
            <h3 className="font-bold text-gray-300">Queue Lengths:</h3>
            <div className="flex justify-between">
              <span>North:</span>
              <span className="rounded bg-gray-800 px-2 font-mono">
                {queueLengths.north}
              </span>
            </div>
            <div className="flex justify-between">
              <span>South:</span>
              <span className="rounded bg-gray-800 px-2 font-mono">
                {queueLengths.south}
              </span>
            </div>
            <div className="flex justify-between">
              <span>East:</span>
              <span className="rounded bg-gray-800 px-2 font-mono">
                {queueLengths.east}
              </span>
            </div>
            <div className="flex justify-between">
              <span>West:</span>
              <span className="rounded bg-gray-800 px-2 font-mono">
                {queueLengths.west}
              </span>
            </div>
          </div>
          <div>
            <h3 className="font-bold text-gray-300">Longest Wait (s):</h3>
            <div className="flex justify-between">
              <span>North:</span>
              <span className="rounded bg-gray-800 px-2 font-mono">
                {longestWait.north.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>South:</span>
              <span className="rounded bg-gray-800 px-2 font-mono">
                {longestWait.south.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>East:</span>
              <span className="rounded bg-gray-800 px-2 font-mono">
                {longestWait.east.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>West:</span>
              <span className="rounded bg-gray-800 px-2 font-mono">
                {longestWait.west.toFixed(1)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
