import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { Plus, Upload, Trash2, TrendingUp, X, Pencil, ArrowUp, ArrowDown, Check } from "lucide-react";
import Papa from "papaparse";

const PALETTE = ["#E8A33D", "#4FB0A5", "#D97A93", "#9B8AE6", "#6FA8DC", "#C9B458"];
const DAY_MS = 86400000;
const DEFAULT_METRIC_SUGGESTIONS = ["hours", "score", "output", "errors", "consistency"];
const ENTRIES_KEY = "arc.entries";
const DIRECTIONS_KEY = "arc.metricDirections";

function colorFor(i) {
  return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

function daysSince(base, dateStr) {
  return Math.round((new Date(dateStr).getTime() - new Date(base).getTime()) / DAY_MS);
}

function regress(points) {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0, den = 0;
  points.forEach((p) => {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) * (p.x - mx);
  });
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  let ssRes = 0, ssTot = 0;
  points.forEach((p) => {
    const pred = intercept + slope * p.x;
    ssRes += (p.y - pred) ** 2;
    ssTot += (p.y - my) ** 2;
  });
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  const residualStd = Math.sqrt(ssRes / Math.max(1, n - 2));
  return { slope, intercept, r2, residualStd };
}

function fmt(n) {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return Math.abs(n) >= 100 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString();
}

function loadLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [entries, setEntries] = useState(() => loadLocal(ENTRIES_KEY, []));
  const [directions, setDirections] = useState(() => loadLocal(DIRECTIONS_KEY, {})); // name -> "higher" | "lower"
  const [activeMetric, setActiveMetric] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [importPreview, setImportPreview] = useState(null); // { rows, count, columns }
  const fileInputRef = useRef(null);

  const [fDate, setFDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fNote, setFNote] = useState("");
  const [fMetrics, setFMetrics] = useState([{ name: "", value: "" }]);

  useEffect(() => {
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    localStorage.setItem(DIRECTIONS_KEY, JSON.stringify(directions));
  }, [directions]);

  const metricNames = useMemo(() => {
    const set = new Set();
    entries.forEach((e) => Object.keys(e.metrics || {}).forEach((k) => set.add(k)));
    return Array.from(set);
  }, [entries]);

  const suggestionList = useMemo(() => {
    const known = new Set(metricNames);
    return [...metricNames, ...DEFAULT_METRIC_SUGGESTIONS.filter((s) => !known.has(s))];
  }, [metricNames]);

  useEffect(() => {
    if (!activeMetric && metricNames.length > 0) setActiveMetric(metricNames[0]);
    if (activeMetric && !metricNames.includes(activeMetric) && metricNames.length > 0) {
      setActiveMetric(metricNames[0]);
    }
  }, [metricNames, activeMetric]);

  function resetForm() {
    setFDate(new Date().toISOString().slice(0, 10));
    setFNote("");
    setFMetrics([{ name: "", value: "" }]);
    setEditingId(null);
  }

  function openNewEntryForm() {
    resetForm();
    setShowForm(true);
  }

  function openEditForm(entry) {
    setFDate(entry.date);
    setFNote(entry.note || "");
    const rows = Object.entries(entry.metrics || {}).map(([name, value]) => ({ name, value: String(value) }));
    setFMetrics(rows.length ? rows : [{ name: "", value: "" }]);
    setEditingId(entry.id);
    setShowForm(true);
  }

  function addFormMetricRow() {
    setFMetrics((m) => [...m, { name: "", value: "" }]);
  }
  function updateFormMetric(i, key, val) {
    setFMetrics((m) => m.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));
  }
  function removeFormMetric(i) {
    setFMetrics((m) => m.filter((_, idx) => idx !== i));
  }

  function submitEntry() {
    const metrics = {};
    fMetrics.forEach((r) => {
      const name = r.name.trim();
      const val = parseFloat(r.value);
      if (name && !Number.isNaN(val)) metrics[name] = val;
    });
    if (Object.keys(metrics).length === 0 && !fNote.trim()) return;

    if (editingId) {
      setEntries((prev) =>
        prev
          .map((e) => (e.id === editingId ? { ...e, date: fDate, note: fNote.trim(), metrics } : e))
          .sort((a, b) => new Date(a.date) - new Date(b.date))
      );
    } else {
      const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, date: fDate, note: fNote.trim(), metrics };
      setEntries((prev) => [...prev, entry].sort((a, b) => new Date(a.date) - new Date(b.date)));
    }
    resetForm();
    setShowForm(false);
  }

  function deleteEntry(id) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function toggleDirection(metric) {
    setDirections((prev) => ({
      ...prev,
      [metric]: prev[metric] === "lower" ? "higher" : "lower",
    }));
  }

  function handleCSVFile(file) {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data;
        const cols = results.meta.fields || [];
        const dateCol = cols.find((c) => c.toLowerCase() === "date") || cols[0];
        const noteCol = cols.find((c) => c.toLowerCase() === "note" || c.toLowerCase() === "notes");
        const metricCols = cols.filter((c) => c !== dateCol && c !== noteCol);
        const parsed = rows
          .filter((r) => r[dateCol])
          .map((r) => {
            const metrics = {};
            metricCols.forEach((c) => {
              const v = r[c];
              if (typeof v === "number" && !Number.isNaN(v)) metrics[c] = v;
            });
            return {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              date: new Date(r[dateCol]).toISOString().slice(0, 10),
              note: noteCol ? String(r[noteCol] || "") : "",
              metrics,
            };
          });
        setImportPreview({ rows: parsed, count: parsed.length, columns: metricCols });
      },
    });
  }

  function confirmImport() {
    if (!importPreview) return;
    setEntries((prev) => [...prev, ...importPreview.rows].sort((a, b) => new Date(a.date) - new Date(b.date)));
    setImportPreview(null);
  }

  const notePlaceholder = useMemo(() => {
    const names = fMetrics.map((r) => r.name.trim()).filter(Boolean);
    if (names.length === 0) return "What happened this period?";
    return `What moved ${names.join(", ")}?`;
  }, [fMetrics]);

  const metricSeries = useMemo(() => {
    if (!activeMetric) return null;
    const pts = entries
      .filter((e) => e.metrics && e.metrics[activeMetric] !== undefined)
      .map((e) => ({ date: e.date, value: e.metrics[activeMetric] }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (pts.length === 0) return null;
    const base = pts[0].date;
    const xy = pts.map((p) => ({ x: daysSince(base, p.date), y: p.value }));
    const reg = regress(xy);
    const lastX = xy[xy.length - 1].x;
    const projectionDays = 30;

    const chartData = pts.map((p, idx) => ({
      label: new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      actual: p.value,
      trend: reg ? reg.intercept + reg.slope * xy[idx].x : undefined,
    }));

    if (reg) {
      const futureX = lastX + projectionDays;
      const futureDate = new Date(new Date(base).getTime() + futureX * DAY_MS);
      const projValue = reg.intercept + reg.slope * futureX;
      const band = reg.residualStd * 1.4 + Math.abs(reg.slope) * projectionDays * 0.3;
      chartData.push({
        label: futureDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        trend: projValue,
        projLow: projValue - band,
        projHigh: band * 2,
      });
    }

    const direction = directions[activeMetric] === "lower" ? "lower" : "higher";
    const velocityPerWeek = reg ? reg.slope * 7 : 0;
    const isImproving = direction === "higher" ? velocityPerWeek >= 0 : velocityPerWeek <= 0;
    const current = xy[xy.length - 1].y;
    const projected30 = reg ? reg.intercept + reg.slope * (lastX + projectionDays) : null;
    return { chartData, reg, velocityPerWeek, current, projected30, isImproving, direction };
  }, [entries, activeMetric, directions]);

  const recentEntries = useMemo(
    () => [...entries].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [entries]
  );

  const activeColor = colorFor(metricNames.indexOf(activeMetric));

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0F1115", color: "#EDEEF2", minHeight: "100vh", width: "100%" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .arc-num { font-family: 'Space Grotesk', system-ui, sans-serif; }
        .arc-btn {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 13px; font-weight: 500; border-radius: 6px; padding: 8px 14px;
          cursor: pointer; border: 1px solid #2A2E38; background: transparent; color: #EDEEF2;
          display: inline-flex; align-items: center; gap: 6px;
          transition: border-color .15s ease, background .15s ease;
        }
        .arc-btn:hover { border-color: #E8A33D; }
        .arc-btn.primary { background: #E8A33D; color: #14110A; border-color: #E8A33D; }
        .arc-btn.primary:hover { background: #F0B25C; }
        .arc-input {
          font-family: 'Inter', system-ui, sans-serif; background: #1D2129; border: 1px solid #2A2E38;
          border-radius: 6px; padding: 8px 10px; color: #EDEEF2; font-size: 13px; width: 100%;
        }
        .arc-input:focus { outline: none; border-color: #E8A33D; }
        .metric-chip {
          font-family: 'Inter', system-ui, sans-serif; font-size: 13px; padding: 6px 12px;
          border-radius: 999px; border: 1px solid #2A2E38; background: transparent; color: #8B90A0;
          cursor: pointer; white-space: nowrap;
        }
        .metric-chip.active { color: #14110A; }
        .entry-row { cursor: pointer; }
        .entry-row:hover { background: #14161C; }
        @media (max-width: 720px) {
          .arc-stats { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 28 }}>
          <div>
            <div className="arc-num" style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>Arc</div>
            <div style={{ fontSize: 13, color: "#8B90A0", marginTop: 2 }}>Not how good you are — how fast you're getting better.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="arc-btn" onClick={() => fileInputRef.current && fileInputRef.current.click()}>
              <Upload size={14} /> Import CSV
            </button>
            <input
              ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) handleCSVFile(e.target.files[0]);
                e.target.value = "";
              }}
            />
            <button className="arc-btn primary" onClick={openNewEntryForm}>
              <Plus size={14} /> New entry
            </button>
          </div>
        </div>

        {/* import preview / confirm */}
        {importPreview && (
          <div style={{ background: "#171A21", border: "1px solid #E8A33D", borderRadius: 8, padding: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 14, marginBottom: 4 }}>
              Ready to import <span className="arc-num" style={{ color: "#E8A33D" }}>{importPreview.count}</span> entries
            </div>
            <div style={{ fontSize: 12, color: "#8B90A0", marginBottom: 12 }}>
              Detected metrics: {importPreview.columns.join(", ") || "none"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="arc-btn primary" onClick={confirmImport}><Check size={14} /> Confirm import</button>
              <button className="arc-btn" onClick={() => setImportPreview(null)}><X size={14} /> Cancel</button>
            </div>
          </div>
        )}

        {/* entry form */}
        {showForm && (
          <div style={{ background: "#171A21", border: "1px solid #2A2E38", borderRadius: 8, padding: 18, marginBottom: 24 }}>
            <div style={{ fontSize: 13, color: "#8B90A0", marginBottom: 12 }}>{editingId ? "Editing entry" : "New entry"}</div>
            <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "0 0 160px" }}>
                <label style={{ fontSize: 11, color: "#8B90A0", display: "block", marginBottom: 4 }}>Date</label>
                <input type="date" className="arc-input" value={fDate} onChange={(e) => setFDate(e.target.value)} />
              </div>
              <div style={{ flex: "1 1 260px" }}>
                <label style={{ fontSize: 11, color: "#8B90A0", display: "block", marginBottom: 4 }}>Note (optional)</label>
                <input className="arc-input" placeholder={notePlaceholder} value={fNote} onChange={(e) => setFNote(e.target.value)} />
              </div>
            </div>

            <label style={{ fontSize: 11, color: "#8B90A0", display: "block", marginBottom: 6 }}>Metrics</label>
            {fMetrics.map((row, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  className="arc-input" style={{ flex: "1 1 auto" }} placeholder="metric name, e.g. skill score"
                  list="known-metrics" value={row.name} onChange={(e) => updateFormMetric(i, "name", e.target.value)}
                />
                <input
                  className="arc-input" style={{ width: 110 }} placeholder="value" type="number"
                  value={row.value} onChange={(e) => updateFormMetric(i, "value", e.target.value)}
                />
                <button className="arc-btn" style={{ padding: "8px 10px" }} onClick={() => removeFormMetric(i)}>
                  <X size={14} />
                </button>
              </div>
            ))}
            <datalist id="known-metrics">
              {suggestionList.map((m) => <option key={m} value={m} />)}
            </datalist>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
              <button className="arc-btn" onClick={addFormMetricRow}><Plus size={14} /> Add metric</button>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="arc-btn" onClick={() => { resetForm(); setShowForm(false); }}>Cancel</button>
                <button className="arc-btn primary" onClick={submitEntry}>{editingId ? "Save changes" : "Save entry"}</button>
              </div>
            </div>
          </div>
        )}

        {entries.length === 0 ? (
          <div style={{ border: "1px dashed #2A2E38", borderRadius: 8, padding: 40, textAlign: "center", color: "#8B90A0" }}>
            <TrendingUp size={22} style={{ marginBottom: 10, opacity: 0.6 }} />
            <div style={{ fontSize: 14 }}>No entries yet. Log a few data points for the same metric over time to see your trajectory.</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 12 }}>
              {metricNames.map((m, i) => (
                <button
                  key={m}
                  className={`metric-chip ${activeMetric === m ? "active" : ""}`}
                  style={activeMetric === m ? { background: colorFor(i), borderColor: colorFor(i) } : {}}
                  onClick={() => setActiveMetric(m)}
                >
                  {m}
                </button>
              ))}
            </div>

            {metricSeries && (
              <>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                  <button
                    className="arc-btn"
                    style={{ fontSize: 12, padding: "5px 10px" }}
                    onClick={() => toggleDirection(activeMetric)}
                    title="Which direction counts as improvement for this metric"
                  >
                    {metricSeries.direction === "higher" ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                    {metricSeries.direction === "higher" ? "Higher is better" : "Lower is better"}
                  </button>
                </div>

                <div className="arc-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
                  <Stat label="Current" value={fmt(metricSeries.current)} />
                  <Stat
                    label="Velocity / week"
                    value={`${metricSeries.velocityPerWeek >= 0 ? "+" : ""}${fmt(metricSeries.velocityPerWeek)}`}
                    accent={metricSeries.isImproving ? "#4FB0A5" : "#D97A93"}
                  />
                  <Stat label="30-day projection" value={metricSeries.projected30 !== null ? fmt(metricSeries.projected30) : "—"} />
                  <Stat label="Fit (R²)" value={metricSeries.reg ? `${Math.round(metricSeries.reg.r2 * 100)}%` : "—"} />
                </div>

                <div style={{ background: "#171A21", border: "1px solid #2A2E38", borderRadius: 8, padding: "18px 8px 8px", marginBottom: 24 }}>
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={metricSeries.chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                      <CartesianGrid stroke="#22252E" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "#8B90A0", fontSize: 11 }} axisLine={{ stroke: "#2A2E38" }} tickLine={false} />
                      <YAxis tick={{ fill: "#8B90A0", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: "#1D2129", border: "1px solid #2A2E38", borderRadius: 6, fontSize: 12 }} labelStyle={{ color: "#EDEEF2" }} />
                      <Area type="monotone" dataKey="projHigh" stroke="none" fill={activeColor} fillOpacity={0.08} />
                      <Line type="monotone" dataKey="trend" stroke="#8B90A0" strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
                      <Line type="monotone" dataKey="actual" stroke={activeColor} strokeWidth={2.5} dot={{ r: 3, fill: activeColor }} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: "8px 14px 10px", fontSize: 11, color: "#8B90A0" }}>
                    <LegendItem swatch={activeColor} label="Logged values" />
                    <LegendItem swatch="#8B90A0" dashed label="Trend + 30-day projection" />
                  </div>
                </div>
              </>
            )}

            <div style={{ fontSize: 12, color: "#8B90A0", marginBottom: 8, fontWeight: 500 }}>ENTRIES — tap to edit</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {recentEntries.map((e) => (
                <div key={e.id} className="entry-row" onClick={() => openEditForm(e)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 4px", borderBottom: "1px solid #1D2129", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                      <span className="arc-num" style={{ fontSize: 13, color: "#8B90A0" }}>
                        {new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                      {Object.entries(e.metrics || {}).map(([k, v]) => (
                        <span key={k} style={{ fontSize: 12, color: "#EDEEF2" }}>
                          {k}: <span className="arc-num" style={{ color: colorFor(metricNames.indexOf(k)) }}>{fmt(v)}</span>
                        </span>
                      ))}
                    </div>
                    {e.note && <div style={{ fontSize: 13, color: "#B8BCC8", marginTop: 4 }}>{e.note}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button className="arc-btn" style={{ padding: "6px 8px" }} onClick={(ev) => { ev.stopPropagation(); openEditForm(e); }}>
                      <Pencil size={13} />
                    </button>
                    <button className="arc-btn" style={{ padding: "6px 8px" }} onClick={(ev) => { ev.stopPropagation(); deleteEntry(e.id); }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ marginTop: 30, fontSize: 11, color: "#565B68" }}>Saved to this browser (localStorage)</div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ background: "#171A21", border: "1px solid #2A2E38", borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "#8B90A0", marginBottom: 4 }}>{label}</div>
      <div className="arc-num" style={{ fontSize: 20, fontWeight: 600, color: accent || "#EDEEF2" }}>{value}</div>
    </div>
  );
}

function LegendItem({ swatch, label, dashed }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 14, height: 0, borderTop: `2px ${dashed ? "dashed" : "solid"} ${swatch}` }} />
      {label}
    </div>
  );
}
