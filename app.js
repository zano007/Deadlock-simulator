const { useState } = React;

function DeadlockSimulator() {
  const [processes, setProcesses] = useState([]);
  const [resources, setResources] = useState([]);
  const [requestEdges, setRequestEdges] = useState([]); // {pid, rid}
  const [assignmentEdges, setAssignmentEdges] = useState([]); // {rid, pid}

  const [newProcessId, setNewProcessId] = useState("");
  const [newResourceId, setNewResourceId] = useState("");
  const [newResourceInstances, setNewResourceInstances] = useState(1);

  const [selectedProcess, setSelectedProcess] = useState("");
  const [selectedResource, setSelectedResource] = useState("");

  const [deadlockResult, setDeadlockResult] = useState(null);

  // Banker: Max matrix and safety result
  // maxMatrix: { [pid]: { [rid]: maxInt } }
  const [maxMatrix, setMaxMatrix] = useState({});
  const [maxValue, setMaxValue] = useState(1);
  const [safetyResult, setSafetyResult] = useState(null);

  // ---- helpers ----
  function resourceById(rid) {
    return resources.find(r => r.id === rid);
  }

  function allocatedInstances(rid) {
    return assignmentEdges.filter(e => e.rid === rid).length;
  }

  function freeInstances(rid) {
    const res = resourceById(rid);
    if (!res) return 0;
    return res.instances - allocatedInstances(rid);
  }

  function holdersOf(rid) {
    return assignmentEdges.filter(e => e.rid === rid).map(e => e.pid);
  }

  // ---- add process/resource ----
  function handleAddProcess(e) {
    e.preventDefault();
    const id = newProcessId.trim();
    if (!id) return;
    if (processes.includes(id)) {
      alert("Process " + id + " already exists.");
      return;
    }
    setProcesses(prev => [...prev, id]);
    setNewProcessId("");
    if (!selectedProcess) setSelectedProcess(id);
    setSafetyResult(null);
  }

  function handleAddResource(e) {
    e.preventDefault();
    const id = newResourceId.trim();
    if (!id) return;
    if (resources.some(r => r.id === id)) {
      alert("Resource " + id + " already exists.");
      return;
    }
    const inst = parseInt(newResourceInstances, 10);
    const instances = isNaN(inst) || inst < 1 ? 1 : inst;
    setResources(prev => [...prev, { id, instances }]);
    setNewResourceId("");
    setNewResourceInstances(1);
    if (!selectedResource) setSelectedResource(id);
    setSafetyResult(null);
  }

  // ---- request & release ----
  function handleRequest() {
    if (!selectedProcess || !selectedResource) {
      alert("Select both a process and a resource.");
      return;
    }
    const pid = selectedProcess;
    const rid = selectedResource;

    const res = resourceById(rid);
    if (!res) {
      alert("Unknown resource " + rid);
      return;
    }

    const free = freeInstances(rid);

    if (free > 0) {
      // allocate immediately
      setAssignmentEdges(prev => {
        const exists = prev.some(e => e.rid === rid && e.pid === pid);
        if (exists) return prev;
        return [...prev, { rid, pid }];
      });
      // remove any waiting request edge for this pair
      setRequestEdges(prev =>
        prev.filter(e => !(e.rid === rid && e.pid === pid))
      );
    } else {
      // no free instance: add request
      setRequestEdges(prev => {
        const exists = prev.some(e => e.rid === rid && e.pid === pid);
        if (exists) return prev;
        return [...prev, { rid, pid }];
      });
    }

    setDeadlockResult(null);
    setSafetyResult(null);
  }

  function handleRelease() {
    if (!selectedProcess || !selectedResource) {
      alert("Select both a process and a resource.");
      return;
    }
    const pid = selectedProcess;
    const rid = selectedResource;

    const hasAssignment = assignmentEdges.some(
      e => e.rid === rid && e.pid === pid
    );
    if (!hasAssignment) {
      alert("Process " + pid + " does not hold resource " + rid);
      return;
    }

    // release from pid
    setAssignmentEdges(prev => {
      const copy = [...prev];
      const index = copy.findIndex(e => e.rid === rid && e.pid === pid);
      if (index !== -1) copy.splice(index, 1);
      return copy;
    });

    // allocate released instance to first waiting process (if any)
    setRequestEdges(prev => {
      const waitingForRid = prev.filter(e => e.rid === rid);
      if (waitingForRid.length === 0) {
        return prev;
      }
      const nextPid = waitingForRid[0].pid;

      // remove that request
      const remaining = prev.filter(
        e => !(e.rid === rid && e.pid === nextPid)
      );

      // allocate to nextPid
      setAssignmentEdges(current => {
        const already = current.some(
          e => e.rid === rid && e.pid === nextPid
        );
        if (already) return current;
        return [...current, { rid, pid: nextPid }];
      });

      return remaining;
    });

    setDeadlockResult(null);
    setSafetyResult(null);
  }

  // ---- set Max for Banker (per process, per resource) ----
  function handleSetMax(e) {
    e.preventDefault();
    if (!selectedProcess || !selectedResource) {
      alert("Select a process and resource first.");
      return;
    }
    const v = parseInt(maxValue, 10);
    if (isNaN(v) || v < 0) {
      alert("Max must be a number >= 0.");
      return;
    }
    const pid = selectedProcess;
    const rid = selectedResource;

    setMaxMatrix(prev => ({
      ...prev,
      [pid]: {
        ...(prev[pid] || {}),
        [rid]: v
      }
    }));
    setSafetyResult(null);
  }

  // ---- Wait-For Graph + Deadlock detection ----
  function buildWaitForGraph() {
    const wfg = {};
    processes.forEach(pid => {
      wfg[pid] = [];
    });

    requestEdges.forEach(({ pid, rid }) => {
      const holders = holdersOf(rid);
      holders.forEach(h => {
        if (h !== pid && !wfg[pid].includes(h)) {
          wfg[pid].push(h);
        }
      });
    });

    return wfg;
  }

  function detectDeadlock() {
    const wfg = buildWaitForGraph();
    const visited = new Set();
    const stack = new Set();
    const parent = {};

    function dfs(u) {
      visited.add(u);
      stack.add(u);
      const neighbours = wfg[u] || [];
      for (const v of neighbours) {
        if (!visited.has(v)) {
          parent[v] = u;
          const cycle = dfs(v);
          if (cycle) return cycle;
        } else if (stack.has(v)) {
          // reconstruct cycle
          const cycle = [v];
          let cur = u;
          while (cur !== v && cur != null) {
            cycle.push(cur);
            cur = parent[cur];
          }
          cycle.push(v);
          cycle.reverse();
          return cycle;
        }
      }
      stack.delete(u);
      return null;
    }

    for (const pid of processes) {
      if (!visited.has(pid)) {
        parent[pid] = null;
        const cycle = dfs(pid);
        if (cycle) {
          return { hasDeadlock: true, cycle };
        }
      }
    }

    return { hasDeadlock: false, cycle: [] };
  }

  function handleCheckDeadlock() {
    const result = detectDeadlock();
    setDeadlockResult(result);
  }

  // ---- Banker safety algorithm ----
  function bankerSafety() {
    const n = processes.length;
    const m = resources.length;

    if (n === 0 || m === 0) {
      return {
        safe: true,
        sequence: [],
        message: "No processes or resources."
      };
    }

    // index maps
    const pidIndex = {};
    const ridIndex = {};
    processes.forEach((pid, i) => { pidIndex[pid] = i; });
    resources.forEach((r, j) => { ridIndex[r.id] = j; });

    // matrices
    const allocation = Array.from({ length: n }, () => Array(m).fill(0));
    const max = Array.from({ length: n }, () => Array(m).fill(0));
    const need = Array.from({ length: n }, () => Array(m).fill(0));
    const available = Array(m).fill(0);

    // fill allocation from assignmentEdges
    assignmentEdges.forEach(e => {
      const i = pidIndex[e.pid];
      const j = ridIndex[e.rid];
      if (i !== undefined && j !== undefined) {
        allocation[i][j] += 1;
      }
    });

    // available = total - allocated
    resources.forEach((r, j) => {
      const total = r.instances;
      const used = allocation.reduce((sum, row) => sum + row[j], 0);
      available[j] = total - used;
    });

    // fill max & need
    processes.forEach((pid, i) => {
      resources.forEach((r, j) => {
        const userMax = maxMatrix[pid] && typeof maxMatrix[pid][r.id] === "number"
          ? maxMatrix[pid][r.id]
          : allocation[i][j]; // fallback: max = current allocation
        max[i][j] = userMax;
        need[i][j] = max[i][j] - allocation[i][j];
      });
    });

    // check for negative need (allocation > max)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        if (need[i][j] < 0) {
          return {
            safe: false,
            sequence: [],
            message:
              "Allocation exceeds Max for process " +
              processes[i] +
              " on some resource."
          };
        }
      }
    }

    const work = [...available];
    const finish = Array(n).fill(false);
    const sequence = [];

    let progress = true;
    while (progress) {
      progress = false;
      for (let i = 0; i < n; i++) {
        if (!finish[i]) {
          let canFinish = true;
          for (let j = 0; j < m; j++) {
            if (need[i][j] > work[j]) {
              canFinish = false;
              break;
            }
          }
          if (canFinish) {
            // process can finish
            for (let j = 0; j < m; j++) {
              work[j] += allocation[i][j];
            }
            finish[i] = true;
            sequence.push(processes[i]);
            progress = true;
          }
        }
      }
    }

    const allFinished = finish.every(f => f);
    return {
      safe: allFinished,
      sequence,
      available: work,
      message: allFinished
        ? "System is in a SAFE state."
        : "System is NOT in a safe state. No complete safe sequence exists."
    };
  }

  function handleCheckSafety() {
    const result = bankerSafety();
    setSafetyResult(result);
  }

  // ---- UI helpers ----
  function formatAssignments() {
    if (assignmentEdges.length === 0) return "None";
    return assignmentEdges.map(e => `${e.rid} → ${e.pid}`).join(", ");
  }

  function formatRequests() {
    if (requestEdges.length === 0) return "None";
    return requestEdges.map(e => `${e.pid} → ${e.rid}`).join(", ");
  }

  function renderMaxMatrixSummary() {
    if (processes.length === 0 || resources.length === 0) {
      return <p className="help-text">No processes/resources yet.</p>;
    }
    return (
      <div className="matrix">
        {processes.map(pid => (
          <div key={pid} className="matrix-row">
            <strong>{pid}:</strong>{" "}
            {resources.map(r => {
              const v =
                maxMatrix[pid] && typeof maxMatrix[pid][r.id] === "number"
                  ? maxMatrix[pid][r.id]
                  : "—";
              return (
                <span key={r.id} style={{ marginRight: "8px" }}>
                  {r.id}={v}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  function renderAvailableSummary(avail) {
    if (!avail || !resources.length) return null;
    return (
      <p className="help-text">
        Work/Available after test:&nbsp;
        {resources.map((r, j) => (
          <span key={r.id} style={{ marginRight: "8px" }}>
            {r.id}={avail[j]}
          </span>
        ))}
      </p>
    );
  }

  // ---- JSX ----
  return (
    <div className="grid">
      {/* Left column: controls */}
      <div>
        <div className="card">
          <h2>1. Create Processes & Resources</h2>

          <div className="row">
            <div>
              <h3>Processes</h3>
              <form onSubmit={handleAddProcess}>
                <label>
                  New Process ID (e.g. P1)
                  <input
                    type="text"
                    value={newProcessId}
                    onChange={e => setNewProcessId(e.target.value)}
                    placeholder="P1"
                  />
                </label>
                <button className="btn-primary" type="submit">Add Process</button>
              </form>
              <p className="help-text">
                Existing: {processes.length === 0 ? "none" : processes.join(", ")}
              </p>
            </div>

            <div>
              <h3>Resources</h3>
              <form onSubmit={handleAddResource}>
                <label>
                  New Resource ID (e.g. R1)
                  <input
                    type="text"
                    value={newResourceId}
                    onChange={e => setNewResourceId(e.target.value)}
                    placeholder="R1"
                  />
                </label>
                <label>
                  Instances (copies)
                  <input
                    type="number"
                    min="1"
                    value={newResourceInstances}
                    onChange={e => setNewResourceInstances(e.target.value)}
                  />
                </label>
                <button className="btn-primary" type="submit">Add Resource</button>
              </form>
              <p className="help-text">
                Existing:{" "}
                {resources.length === 0
                  ? "none"
                  : resources.map(r => `${r.id}(${r.instances})`).join(", ")}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>2. Request / Release Resources</h2>
          <p className="help-text">
            Choose a process and resource, then click Request or Release.
          </p>

          <label>
            Process
            <select
              value={selectedProcess}
              onChange={e => setSelectedProcess(e.target.value)}
            >
              <option value="">-- select process --</option>
              {processes.map(pid => (
                <option key={pid} value={pid}>{pid}</option>
              ))}
            </select>
          </label>

          <label>
            Resource
            <select
              value={selectedResource}
              onChange={e => setSelectedResource(e.target.value)}
            >
              <option value="">-- select resource --</option>
              {resources.map(r => (
                <option key={r.id} value={r.id}>
                  {r.id} (free {freeInstances(r.id)} / {r.instances})
                </option>
              ))}
            </select>
          </label>

          <div>
            <button className="btn-primary" type="button" onClick={handleRequest}>
              Request
            </button>
            <button className="btn-ghost" type="button" onClick={handleRelease}>
              Release
            </button>
          </div>

          <h3>Current Edges</h3>
          <div className="edges-list">
            <div>
              <strong>Assignments (R → P):</strong><br />
              <span>{formatAssignments()}</span>
            </div>
            <div style={{ marginTop: "6px" }}>
              <strong>Requests (P → R):</strong><br />
              <span>{formatRequests()}</span>
            </div>
          </div>

          <h3 style={{ marginTop: "12px" }}>Optional: Max Demand (Banker)</h3>
          <p className="help-text">
            Select a process and resource above, then set Max (total demand) for that pair.
            If you never set Max, it is assumed equal to current allocation.
          </p>
          <form onSubmit={handleSetMax}>
            <label>
              Max for selected P,R
              <input
                type="number"
                min="0"
                value={maxValue}
                onChange={e => setMaxValue(e.target.value)}
              />
            </label>
            <button className="btn-ghost" type="submit">
              Set Max
            </button>
          </form>
        </div>

        <div className="card">
          <h2>3. Deadlock Detection (Wait-For Graph)</h2>
          <p className="help-text">
            We build a Wait-For Graph. If there is a cycle, the system is deadlocked.
          </p>
          <button
            className="btn-primary"
            type="button"
            onClick={handleCheckDeadlock}
            disabled={processes.length === 0}
          >
            Check Deadlock
          </button>

          {deadlockResult && (
            <div style={{ marginTop: "10px" }}>
              {deadlockResult.hasDeadlock ? (
                <div>
                  <p className="deadlock">
                    ● Deadlock detected!
                    <span className="tag">Cycle in WFG</span>
                  </p>
                  <p>
                    Cycle:&nbsp;
                    {deadlockResult.cycle.join(" → ")}
                  </p>
                </div>
              ) : (
                <p className="safe">
                  ✓ No deadlock. System is deadlock-free.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <h2>4. Safety Check (Banker’s Algorithm)</h2>
          <p className="help-text">
            Uses Available, Allocation and Max to find a safe sequence. If all
            processes can finish in some order, the state is SAFE.
          </p>
          <button
            className="btn-primary"
            type="button"
            onClick={handleCheckSafety}
            disabled={processes.length === 0 || resources.length === 0}
          >
            Check Safety (Banker)
          </button>

          {safetyResult && (
            <div style={{ marginTop: "10px" }}>
              {safetyResult.safe ? (
                <div>
                  <p className="safe">
                    ✓ SAFE state.
                    <span className="tag">Banker</span>
                  </p>
                  {safetyResult.sequence.length > 0 && (
                    <p>
                      Safe sequence:&nbsp;
                      {safetyResult.sequence.join(" → ")}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="deadlock">
                    ● NOT safe.
                    <span className="tag">Banker</span>
                  </p>
                  <p className="help-text">{safetyResult.message}</p>
                </div>
              )}
              {renderAvailableSummary(safetyResult.available)}
            </div>
          )}

          <h3>Current Max Matrix</h3>
          {renderMaxMatrixSummary()}
        </div>
      </div>

      {/* Right column: visual + explanation */}
      <div>
        <div className="card">
          <h2>Resource Allocation “Graph” View</h2>
          <p className="help-text">
            Top row = processes, bottom row = resources. Edges are shown as text.
          </p>

          <h3>Processes</h3>
          <div className="nodes-row">
            {processes.length === 0 && (
              <span className="help-text">No processes yet.</span>
            )}
            {processes.map(pid => (
              <span key={pid} className="node process">
                {pid}
              </span>
            ))}
          </div>

          <h3>Resources</h3>
          <div className="nodes-row">
            {resources.length === 0 && (
              <span className="help-text">No resources yet.</span>
            )}
            {resources.map(r => (
              <span key={r.id} className="node resource">
                {r.id}{" "}
                <small>
                  {allocatedInstances(r.id)}/{r.instances} used
                </small>
              </span>
            ))}
          </div>

          <h3>Edges (Textual)</h3>
          <div className="edges-list">
            <div>
              <strong>Assignments (resource → process):</strong>
              <br />
              {assignmentEdges.length === 0 && (
                <span className="help-text">None</span>
              )}
              {assignmentEdges.map((e, index) => (
                <span key={index}>{e.rid} → {e.pid}</span>
              ))}
            </div>
            <div style={{ marginTop: "6px" }}>
              <strong>Requests (process → resource):</strong>
              <br />
              {requestEdges.length === 0 && (
                <span className="help-text">None</span>
              )}
              {requestEdges.map((e, index) => (
                <span key={index}>{e.pid} → {e.rid}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <h2>How to Demo This in Class</h2>
          <ul>
            <li>Add processes: <code>P1</code>, <code>P2</code>.</li>
            <li>Add resources: <code>R1</code> (1), <code>R2</code> (1).</li>
            <li>Request: P1 → R1, P2 → R2 (both get allocated).</li>
            <li>Request: P1 → R2 (P1 now waits).</li>
            <li>Request: P2 → R1 (P2 now waits).</li>
          </ul>
          <p className="help-text">
            Now both are waiting for each other → cycle in Wait-For Graph → deadlock.
            Click <strong>Check Deadlock</strong> to show the cycle.
          </p>
          <p className="help-text">
            For Banker, set Max (e.g. both P1 and P2 need at most 1 of each),
            then click <strong>Check Safety</strong> to show whether the system
            is in a safe state and what safe sequence exists.
          </p>
        </div>
      </div>
    </div>
  );
}

function App() {
  return <DeadlockSimulator />;
}

const rootElement = document.getElementById("root");
const root = ReactDOM.createRoot(rootElement);
root.render(<App />);
