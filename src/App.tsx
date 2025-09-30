import React, { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import html2canvas from "html2canvas";
import { motion } from "framer-motion";
import { jsPDF } from "jspdf";

// --- Scale descriptors (school-adapted, OECD-derived) ---
const SCALE: Record<string, Record<number, string>> = {
  Relevance: {
    1: "Very Low – Does not meet student or teacher needs.",
    2: "Low – Generic; not tailored to our context.",
    3: "Moderate – Some relevance; limited adaptability.",
    4: "High – Meets needs; adaptable and valued.",
    5: "Very High – Highly relevant and transformative.",
  },
  Alignment: {
    1: "Very Low – No connection to curriculum/system.",
    2: "Low – Loose links; significant gaps.",
    3: "Moderate – Partially aligned; needs adaptation.",
    4: "High – Well aligned to curriculum and strategy.",
    5: "Very High – Strongly aligned across plans and goals.",
  },
  Effectiveness: {
    1: "Very Low – Fails to achieve intended outcomes.",
    2: "Low – Limited outcomes; weak/anecdotal evidence.",
    3: "Moderate – Some outcomes; varies by class/group.",
    4: "High – Consistently achieves most outcomes.",
    5: "Very High – Strong results across diverse learners.",
  },
  Impact: {
    1: "Very Low – No wider/lasting change.",
    2: "Low – Minimal, short-term impact.",
    3: "Moderate – Some broader change; limited scale/duration.",
    4: "High – Clear, positive change across cohorts.",
    5: "Very High – Transformational, sustained school-wide change.",
  },
  Sustainability: {
    1: "Very Low – One-off/individual-dependent; fades quickly.",
    2: "Low – Fragile; vulnerable to staff/budget changes.",
    3: "Moderate – Needs ongoing effort/external support.",
    4: "High – Embedded in routines, capability, resourcing.",
    5: "Very High – Structures and funding ensure longevity.",
  },
  Coherence: {
    1: "Very Low – Conflicts; duplicates or confuses.",
    2: "Low – Weak alignment; friction with initiatives.",
    3: "Moderate – Fits some efforts; awkward with others.",
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
  const xHigh = xVal >= 3;
  const yHigh = yVal >= 3;
  const code = `${pair}_${yHigh ? "H" : "L"}${xHigh ? "H" : "L"}` as keyof typeof QUADRANTS;
  return QUADRANTS[code];
}

const SliderRow: React.FC<{
  label: string;
  value: number;
  setValue: (n: number) => void;
  showFull?: boolean;
}> = ({ label, value, setValue, showFull }) => {
  const descriptor = SCALE[label][value as 1 | 2 | 3 | 4 | 5];
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

const Grid: React.FC<{ xLabel: string; yLabel: string; x: number; y: number; compact?: boolean; }> = ({ xLabel, yLabel, x, y, compact }) => {
  const size = compact ? 220 : 300;
  const padding = 24;
  const plotW = size - padding * 2;
  const plotH = size - padding * 2;
  const xPos = padding + ((x - 1) / 4) * plotW;
  const yPos = padding + (1 - (y - 1) / 4) * plotH;

  return (
    <svg width={size} height={size} className="rounded-2xl shadow-sm bg-white border">
      <rect x={padding} y={padding} width={plotW/2} height={plotH/2} fill="#f8fafc" />
      <rect x={padding+plotW/2} y={padding} width={plotW/2} height={plotH/2} fill="#f1f5f9" />
      <rect x={padding} y={padding+plotH/2} width={plotW/2} height={plotH/2} fill="#f1f5f9" />
      <rect x={padding+plotW/2} y={padding+plotH/2} width={plotW/2} height={plotH/2} fill="#e2e8f0" />
      <line x1={padding} y1={padding} x2={padding} y2={size-padding} stroke="#94a3b8" />
      <line x1={padding} y1={size-padding} x2={size-padding} y2={size-padding} stroke="#94a3b8" />
      <motion.circle cx={xPos} cy={yPos} r={8} fill="#1f2937" stroke="white" strokeWidth={2}
        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 20 }} />
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
          <h1 className="text-2xl font-semibold">Johari Window – Education Resource Evaluator</h1>
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
                  <Grid xLabel={p.x} yLabel={p.y} x={scores[p.x]} y={scores[p.y]} />
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">Quadrant</Badge>
                    <span className="font-medium">{quad.name}</span>
                  </div>
                  <p className="text-sm text-slate-600">{quad.desc}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Adjust Criteria</CardTitle></CardHeader>
                <CardContent className="grid gap-6">
                  <SliderRow label={p.y} value={scores[p.y]} setValue={(n) => setScores((s) => ({ ...s, [p.y]: n }))} showFull={showFull} />
                  <SliderRow label={p.x} value={scores[p.x]} setValue={(n) => setScores((s) => ({ ...s, [p.x]: n }))} showFull={showFull} />
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
              const q = useQuadrant(p.key as PairKey, scores[p.x], scores[p.y]);
              return (
                <Card key={`summary-${p.key}`}>
                  <CardHeader><CardTitle>{p.title}</CardTitle></CardHeader>
                  <CardContent className="grid gap-2">
                    <Grid xLabel={p.x} yLabel={p.y} x={scores[p.x]} y={scores[p.y]} compact />
                    <div className="text-xs text-slate-600">{q.name} — {q.desc}</div>
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