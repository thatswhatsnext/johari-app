import React, { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import html2canvas from "html2canvas";
import { motion } from "framer-motion";
import { jsPDF } from "jspdf";


// Color palette for saved resources (used for multi-dots + legend)
const COLORS = ["#0ea5e9", "#ef4444", "#10b981", "#a78bfa", "#f59e0b", "#22c55e", "#14b8a6", "#f43f5e"];

// Types for saved resources
type Scores = Record<string, number>;
type SavedResource = {
  id: string;
  name: string;
  scores: Scores;
};

// Descriptors shown when a slider is exactly 3 (the "moderate" middle)
const MID_AXIS_TEXT: Record<string, string> = {
  Relevance: "Somewhat relevant: usable with minor adaptation, won’t reliably meet the full cohort.",
  Alignment: "Partially aligned: hits some outcomes/strategies, but needs mapping or adaptation.",
  Effectiveness: "Inconsistent outcomes: works for some learners/contexts; needs scaffolds or PD for reliability.",
  Impact: "Patchy ripple effects: some positive change, limited in scale or duration.",
  Sustainability: "Continues with active effort or specific people; not yet embedded or budget-proof.",
  Coherence: "Fits some initiatives, awkward with others; overlaps exist, integration incomplete.",
};

// Coaching text for when one or both axes are exactly 3
const MID_EDGE_COACH = {
  RAID: {
    y3_x4plus: "Good on paper; strengthen classroom fit with quick adaptations, exemplars, and teacher feedback loops.",
    y4plus_x3: "Strong local fit; close the gaps—map outcomes explicitly, add scope & sequence links.",
    y3_x3: "Promising but under-specified—pilot, capture evidence, and co-design a minimal adaptation guide.",
  },
  EFIM: {
    y3_x4plus: "Catalytic but unreliable; standardise the core routine and monitor fidelity to stabilise outcomes.",
    y4plus_x3: "Targets met, but little culture shift; widen adoption, share wins, and integrate into whole-school routines.",
    y3_x3: "Try a contained pilot with clear measures and coaching; keep/dump based on evidence at term review.",
  },
  SUCO: {
    y3_x4plus: "Well-fitting but effortful; embed into timetable, roles, and budget to de-fragilise.",
    y4plus_x3: "Durable but siloed; align language, timelines, and data cycles to reduce friction.",
    y3_x3: "Rationalise overlaps, name owners, and set a ‘sunset unless embedded’ checkpoint.",
  },
} as const;

function getEdgeCoach(pairKey: PairKey, x: number, y: number, threshold: number): string | null {
  const coach = (MID_EDGE_COACH as any)[pairKey];
  if (!coach) return null;
  const hi = (n: number) => n >= threshold;
  if (y === 3 && hi(x)) return coach.y3_x4plus;
  if (hi(y) && x === 3) return coach.y4plus_x3;
  if (y === 3 && x === 3) return coach.y3_x3;
  return null;
}

// --- Scale descriptors (school-adapted, OECD-derived) ---
const SCALE: Record<string, Record<number, string>> = {
  Relevance: {
    1: "Very Low – Does not meet student or teacher needs.",
    2: "Low – Generic; not tailored to our context.",
    3: "Moderate – Somewhat relevant; usable with minor adaptation, but not a perfect fit for all cohorts.",
    4: "High – Meets needs; adaptable and valued.",
    5: "Very High – Highly relevant and transformative.",
  },
  Alignment: {
    1: "Very Low – No connection to curriculum/system.",
    2: "Low – Loose links; significant gaps.",
    3: "Moderate – Partial links to curriculum or priorities; usable but needs adaptation.",
    4: "High – Well aligned to curriculum and strategy.",
    5: "Very High – Strongly aligned across plans and goals.",
  },
  Effectiveness: {
    1: "Very Low – Fails to achieve intended outcomes.",
    2: "Low – Limited outcomes; weak/anecdotal evidence.",
    3: "Moderate – Achieves outcomes for some learners/contexts; not reliably across classes.",
    4: "High – Consistently achieves most outcomes.",
    5: "Very High – Strong results across diverse learners.",
  },
  Impact: {
    1: "Very Low – No wider/lasting change.",
    2: "Low – Minimal, short-term impact.",
    3: "Moderate – Some broader change, but limited in scale or duration.",
    4: "High – Clear, positive change across cohorts.",
    5: "Very High – Transformational, sustained school-wide change.",
  },
  Sustainability: {
    1: "Very Low – One-off/individual-dependent; fades quickly.",
    2: "Low – Fragile; vulnerable to staff/budget changes.",
    3: "Moderate – Continues with active effort/specific people; not yet embedded or budget-proof.",
    4: "High – Embedded in routines, capability, resourcing.",
    5: "Very High – Structures and funding ensure longevity.",
  },
  Coherence: {
    1: "Very Low – Conflicts; duplicates or confuses.",
    2: "Low – Weak alignment; friction with initiatives.",
    3: "Moderate – Fits some initiatives; overlaps/awkwardness remain without integration.",
    4: "High – Well integrated; complements priorities.",
    5: "Very High – Strong synergy across school/system.",
  },
};

// Deeper OECD-aligned definitions (shown on toggle)
const FULL_DEFS: Record<string, string> = {
  Relevance:
    "Does the resource respond to the needs of our students/teachers and remain responsive as circumstances change (curriculum shifts, cohort changes)?",
  Alignment:
    "How explicitly does the resource map to curriculum outcomes, school improvement priorities, and system directions (internal and external)?",
  Effectiveness:
    "To what extent are intended outcomes achieved (with attention to different groups of learners)?",
  Impact:
    "What higher-level, lasting effects (intended/unintended) occur beyond immediate outcomes—e.g., culture, pathways, community confidence?",
  Sustainability:
    "Will benefits continue over time? Consider institutional, financial, social, political, and environmental conditions, plus risks and trade-offs.",
  Coherence:
    "How well does this fit with other initiatives (complementarity, avoiding contradictions/duplication) across faculties and system programs?",
};

// Quadrant labels & descriptions per pair
const QUADRANTS: Record<string, { name: string; desc: string }> = {
  RAID_HH: { name: "Sweet Spot", desc: "Strategic choice: valuable locally and backed by curriculum/system." },
  RAID_HL: { name: "Hidden Gems", desc: "Strong local fit but not fully aligned; adapt/map or advocate." },
  RAID_LH: { name: "Box-Tickers", desc: "Easy to justify on paper; limited classroom value." },
  RAID_LL: { name: "Misfits", desc: "Neither useful nor aligned; consider phase-out." },
  EFIM_HH: { name: "Game-Changers", desc: "Deliver outcomes and reshape culture/outcomes more broadly." },
  EFIM_HL: { name: "Efficient Tools", desc: "Hit targets well but limited wider change; niche yet valuable." },
  EFIM_LH: { name: "Catalysts", desc: "Inconsistent outcomes but spark important long-term shifts." },
  EFIM_LL: { name: "Ineffectual", desc: "Neither achieves goals nor creates wider value." },
  SUCO_HH: { name: "Strategic Anchors", desc: "Long-lasting and well-integrated; backbone of strategy." },
  SUCO_HL: { name: "Stubborn Survivors", desc: "Enduring but isolated; risk inefficiency/silos." },
  SUCO_LH: { name: "Short-Lived Allies", desc: "Well-fitting but fragile; benefits may fade." },
  SUCO_LL: { name: "Dead Ends", desc: "Neither durable nor integrated; drains resources." },
};

// Pairs config
const PAIRS = [
  { key: "RAID", title: "Relevance vs Alignment", x: "Alignment", y: "Relevance" },
  { key: "EFIM", title: "Effectiveness vs Impact", x: "Impact", y: "Effectiveness" },
  { key: "SUCO", title: "Sustainability vs Coherence", x: "Coherence", y: "Sustainability" },
] as const;

type PairKey = typeof PAIRS[number]["key"];

function useQuadrant(pair: PairKey, xVal: number, yVal: number) {
  // Special middle case: exactly 3 & 3 -> Uncertain
  if (xVal === 3 && yVal === 3) {
    return { name: "Uncertain", desc: "Evidence is inconclusive at present. Pilot or collect more data before committing; clarify success criteria, map curriculum links, and test in 1–2 classes." };
  }
  const xHigh = xVal >= 4;
  const yHigh = yVal >= 4;
  const code = `${pair}_${yHigh ? "H" : "L"}${xHigh ? "H" : "L"}` as keyof typeof QUADRANTS;
  return QUADRANTS[code];
}

const SliderRow: React.FC<{
  label: string;
  value: number;
  setValue: (n: number) => void;
  showFull?: boolean;
}> = ({ label, value, setValue, showFull }) => {
  const base = SCALE[label][value as 1 | 2 | 3 | 4 | 5];
  const mid = value === 3 ? MID_AXIS_TEXT[label] : null;
  const descriptor = mid || base;
  const full = FULL_DEFS[label];
  return (
    <div className="grid grid-cols-1 gap-2">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium">{label}</label>
        <Badge variant="secondary" className="text-xs">{value} / 5</Badge>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => setValue(parseInt(e.target.value))}
        aria-label={`${label} slider`}
        className="w-full accent-black"
      />
      <div className="text-sm text-muted-foreground">{descriptor}</div>
      {showFull && <div className="text-xs text-slate-600 bg-slate-50 border rounded-xl p-3">{full}</div>}
    </div>
  );
};

const Grid: React.FC<{
  xLabel: string;
  yLabel: string;
  x: number;
  y: number;
  compact?: boolean;
  points?: { x: number; y: number; color?: string; title?: string }[];
}> = ({ xLabel, yLabel, x, y, compact, points = [] }) => {
  const size = compact ? 220 : 300;
  const padding = 24;
  const plotW = size - padding * 2;
  const plotH = size - padding * 2;

  const toPos = (sx: number, sy: number) => ({
    cx: padding + ((sx - 1) / 4) * plotW,
    cy: padding + (1 - (sy - 1) / 4) * plotH,
  });

  const { cx: xPos, cy: yPos } = toPos(x, y);

  return (
    <svg width={size} height={size} className="rounded-2xl shadow-sm bg-white border">
      <rect x={padding} y={padding} width={plotW/2} height={plotH/2} fill="#f8fafc" />
      <rect x={padding+plotW/2} y={padding} width={plotW/2} height={plotH/2} fill="#f1f5f9" />
      <rect x={padding} y={padding+plotH/2} width={plotW/2} height={plotH/2} fill="#f1f5f9" />
      <rect x={padding+plotW/2} y={padding+plotH/2} width={plotW/2} height={plotH/2} fill="#e2e8f0" />
      <line x1={padding} y1={padding} x2={padding} y2={size-padding} stroke="#94a3b8" />
      <line x1={padding} y1={size-padding} x2={size-padding} y2={size-padding} stroke="#94a3b8" />

      {/* Saved resource points */}
      {points.map((p, i) => {
        const { cx, cy } = toPos(p.x, p.y);
        return (
          <circle key={i} cx={cx} cy={cy} r={6} fill={p.color || COLORS[i % COLORS.length]} stroke="white" strokeWidth={2}>
            {p.title ? <title>{p.title}</title> : null}
          </circle>
        );
      })}

      {/* Current point (emphasized) */}
      {(() => {
        const gateActive = x === 3 || y === 3;
        const tooltip = gateActive
          ? "Evidence Gate: one or both ratings are moderate (3). Pilot & define measures before scaling."
          : undefined;
        return (
          <g>
            {gateActive && (
              <circle
                cx={xPos}
                cy={yPos}
                r={14}
                fill="none"
                stroke="#1f2937"
                strokeWidth={2}
                strokeDasharray="4 3"
                opacity={0.7}
              >
                <title>{tooltip}</title>
              </circle>
            )}
            <motion.circle
              cx={xPos}
              cy={yPos}
              r={8}
              fill="#1f2937"
              stroke="white"
              strokeWidth={2}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
            >
              {gateActive && <title>{tooltip}</title>}
            </motion.circle>
          </g>
        );
      })()}

      <text x={size/2} y={size-4} textAnchor="middle" fill="#475569" style={{ fontSize: 12 }}>{xLabel} → Low to High</text>
      <text x={12} y={size/2} transform={`rotate(-90 12 ${size/2})`} textAnchor="middle" fill="#475569" style={{ fontSize: 12 }}>{yLabel} → Low to High</text>
    </svg>
  );
};

export default function App() {
  const [pairKey, setPairKey] = useState<PairKey>("RAID");
  const [showFull, setShowFull] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({
    Relevance: 3, Alignment: 3, Effectiveness: 3, Impact: 3, Sustainability: 3, Coherence: 3,
  });

  // Saved resources persisted in localStorage
  const [resources, setResources] = useState<SavedResource[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("resourcesV1") || "[]");
    } catch {
      return [];
    }
  });
  const [resourceName, setResourceName] = useState("");

  function saveAll(next: SavedResource[]) {
    setResources(next);
    localStorage.setItem("resourcesV1", JSON.stringify(next));
  }

  function saveCurrentResource() {
    const name = resourceName.trim() || `Resource ${resources.length + 1}`;
    const r: SavedResource = {
      id: (crypto as any).randomUUID?.() || String(Date.now()),
      name,
      scores: { ...scores },
    };
    const next = [...resources, r];
    saveAll(next);
    setResourceName("");
  }

  function deleteResource(id: string) {
    const next = resources.filter(r => r.id !== id);
    saveAll(next);
  }

  const pair = useMemo(() => PAIRS.find((p) => p.key === pairKey)!, [pairKey]);
  const xVal = scores[pair.x];
  const yVal = scores[pair.y];
  const quad = useQuadrant(pair.key, xVal, yVal);

  const summaryRef = useRef<HTMLDivElement>(null);
  const handleExport = async (type: "png" | "pdf") => {
    if (!summaryRef.current) return;

    const node = summaryRef.current;
    node.classList.add('print-safe');
    await new Promise(requestAnimationFrame); // ensure styles applied
    try {
      const canvas = await html2canvas(node, {
        backgroundColor: "#ffffff",
        scale: 2,
      });
      if (type === "png") {
        const dataUrl = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = `Johari_Snapshot_${new Date().toISOString().slice(0, 10)}.png`;
        link.click();
        return;
      }
      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf = new jsPDF("landscape", "pt", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 40; // margins
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let remaining = imgHeight;
      let y = 20;
      pdf.addImage(imgData, "JPEG", 20, y, imgWidth, imgHeight);
      while (remaining > pageHeight - 40) {
        pdf.addPage();
        y = 20 - (imgHeight - remaining);
        pdf.addImage(imgData, "JPEG", 20, y, imgWidth, imgHeight);
        remaining -= (pageHeight - 40);
      }
      pdf.save(`Johari_Snapshot_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      node.classList.remove('print-safe');
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl grid gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">
            Johari Window – Education Resource Evaluator
            <Badge variant="outline" className="ml-2">High ≥ 4</Badge>
          </h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="defs" checked={showFull} onCheckedChange={setShowFull} />
              <label htmlFor="defs" className="text-sm">Show OECD-aligned definitions</label>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => handleExport("png")}>Export PNG</Button>
              <Button onClick={() => handleExport("pdf")}>Export PDF</Button>
            </div>
          </div>
        </div>

        <Tabs value={pairKey} onValueChange={(v) => setPairKey(v as PairKey)}>
          <TabsList className="grid grid-cols-3 w-full md:w-auto">
            {PAIRS.map((p) => (<TabsTrigger key={p.key} value={p.key}>{p.title}</TabsTrigger>))}
          </TabsList>

          {PAIRS.map((p) => (
            <TabsContent key={p.key} value={p.key} className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>{p.title}</CardTitle></CardHeader>
                <CardContent className="grid gap-4">
                  {(() => {
                    const pairPoints = resources.map((r, idx) => ({
                      x: r.scores[p.x],
                      y: r.scores[p.y],
                      color: COLORS[idx % COLORS.length],
                      title: r.name,
                    }));
                    return <Grid xLabel={p.x} yLabel={p.y} x={scores[p.x]} y={scores[p.y]} points={pairPoints} />;
                  })()}
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">Quadrant</Badge>
                    <span className="font-medium">{quad.name}</span>
                    {(scores[p.y] === 3 || scores[p.x] === 3) && (
                      <Badge variant="secondary" title="Evidence Gate: one or both ratings are moderate (3). Pilot & define measures before scaling.">Evidence Gate active</Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-600">{getEdgeCoach(p.key as PairKey, scores[p.x], scores[p.y], 4) ?? quad.desc}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Adjust Criteria</CardTitle></CardHeader>
                <CardContent className="grid gap-6">
                  <SliderRow label={p.y} value={scores[p.y]} setValue={(n) => setScores((s) => ({ ...s, [p.y]: n }))} showFull={showFull} />
                  <SliderRow label={p.x} value={scores[p.x]} setValue={(n) => setScores((s) => ({ ...s, [p.x]: n }))} showFull={showFull} />

                  <div className="grid gap-3">
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Resource name (e.g., Literacy Pilot)"
                        value={resourceName}
                        onChange={(e) => setResourceName(e.target.value)}
                        className="border rounded-md px-3 py-2 w-full"
                      />
                      <Button onClick={saveCurrentResource}>Save Resource</Button>
                    </div>

                    {resources.length > 0 && (
                      <div className="text-sm text-slate-600">
                        <div className="font-medium mb-1">Saved resources</div>
                        <ul className="grid gap-1">
                          {resources.map((r, idx) => (
                            <li key={r.id} className="flex items-center gap-2">
                              <span
                                className="inline-block w-3 h-3 rounded-full"
                                style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                                aria-hidden
                              />
                              <span className="truncate">{r.name}</span>
                              <Button className="ml-2" onClick={() => deleteResource(r.id)} aria-label={`Delete ${r.name}`}>
                                Delete
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>

        <div ref={summaryRef} className="bg-white p-6 rounded-2xl border grid gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Overall Assessment Snapshot</h2>
            <Badge>
              Scores: R {scores.Relevance} • A {scores.Alignment} • Ef {scores.Effectiveness} • Im {scores.Impact} • Su {scores.Sustainability} • Co {scores.Coherence}
            </Badge>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {PAIRS.map((p) => {
              return (
                <Card key={`summary-${p.key}`}>
                  <CardHeader><CardTitle>{p.title}</CardTitle></CardHeader>
                  <CardContent className="grid gap-2">
                    {(() => {
                      const pairPoints = resources.map((r, idx) => ({
                        x: r.scores[p.x],
                        y: r.scores[p.y],
                        color: COLORS[idx % COLORS.length],
                        title: r.name,
                      }));
                      return (
                        <Grid xLabel={p.x} yLabel={p.y} x={scores[p.x]} y={scores[p.y]} compact points={pairPoints} />
                      );
                    })()}
                    {(() => {
                      const q = useQuadrant(p.key as PairKey, scores[p.x], scores[p.y]);
                      const coach = getEdgeCoach(p.key as PairKey, scores[p.x], scores[p.y], 4);
                      const gateActive = scores[p.x] === 3 || scores[p.y] === 3;
                      return (
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <span>{q.name} — {coach ?? q.desc}</span>
                          {gateActive && (
                            <Badge
                              variant="secondary"
                              title="Evidence Gate: one or both ratings are moderate (3). Pilot & define measures before scaling."
                            >
                              Evidence Gate active
                            </Badge>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}