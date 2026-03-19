import React, { useState, useEffect, useMemo, useCallback, cloneElement } from 'react';
import { 
  Calculator, 
  History, 
  Settings as SettingsIcon, 
  Download, 
  Trash2, 
  AlertTriangle, 
  Plus, 
  CheckCircle2,
  ChevronRight,
  Info,
  Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

type BGUnit = 'mg/dL' | 'mmol/L';

interface KIFactor {
  id: string;
  name: string;
  start: string; // HH:mm
  end: string;   // HH:mm
  factor: number;
}

interface Settings {
  kiFactors: KIFactor[];
  targetDayFrom: number;
  targetDayTo: number;
  targetNightFrom: number;
  targetNightTo: number;
  correctionDay: number;
  correctionNight: number;
  allowNegativeCorrection: boolean;
  rounding: 'none' | '0.5' | '1.0';
  unit: BGUnit;
}

interface HistoryEntry {
  id: string;
  timestamp: string;
  slot: string;
  kh: number | null;
  bg: number;
  unit: BGUnit;
  kiFactor: number | null;
  insulinA: number | null;
  insulinB: number | null;
  total: number | null;
}

// --- Constants ---

const DEFAULT_KI_FACTORS: KIFactor[] = [
  { id: 'f1', name: 'Frühstück 1', start: '06:00', end: '10:00', factor: 1.0 },
  { id: 'f2', name: 'Frühstück 2', start: '10:00', end: '12:00', factor: 1.0 },
  { id: 'm', name: 'Mittag', start: '12:00', end: '15:00', factor: 1.0 },
  { id: 'v', name: 'Vesper', start: '15:00', end: '17:00', factor: 1.0 },
  { id: 'a', name: 'Abendbrot', start: '17:00', end: '21:00', factor: 1.0 },
  { id: 's', name: 'Spätstück', start: '21:00', end: '22:00', factor: 1.0 },
  { id: 'n', name: 'Nacht', start: '22:00', end: '06:00', factor: 1.0 },
];

const INITIAL_SETTINGS: Settings = {
  kiFactors: DEFAULT_KI_FACTORS,
  targetDayFrom: 80,
  targetDayTo: 140,
  targetNightFrom: 90,
  targetNightTo: 150,
  correctionDay: 40,
  correctionNight: 50,
  allowNegativeCorrection: false,
  rounding: '0.5',
  unit: 'mg/dL',
};

// --- Helper Functions ---

const formatNumber = (num: number | null): string => {
  if (num === null) return '';
  // Use comma as decimal separator for Numbers
  return num.toFixed(2).replace('.', ',');
};

const getCurrentTimeStr = () => {
  const now = new Date();
  return now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
};

const getActiveSlotId = (factors: KIFactor[]) => {
  const nowStr = getCurrentTimeStr();
  const active = factors.find(f => {
    if (f.start <= f.end) {
      return nowStr >= f.start && nowStr < f.end;
    } else {
      // Overnight slot (e.g. 22:00 - 06:00)
      return nowStr >= f.start || nowStr < f.end;
    }
  });
  return active?.id || 'n';
};

// --- Components ---

export default function App() {
  const [activeTab, setActiveTab] = useState<'calc' | 'history' | 'settings'>('calc');
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('diabetes_settings');
    return saved ? JSON.parse(saved) : INITIAL_SETTINGS;
  });
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    const saved = localStorage.getItem('diabetes_history');
    return saved ? JSON.parse(saved) : [];
  });

  // Calculator State
  const [kh, setKh] = useState<string>('');
  const [bg, setBg] = useState<string>('');
  const [manualSlotId, setManualSlotId] = useState<string | null>(null);
  const [isHypoOverride, setIsHypoOverride] = useState(false);

  // Save settings to LocalStorage
  useEffect(() => {
    localStorage.setItem('diabetes_settings', JSON.stringify(settings));
  }, [settings]);

  // Save history to LocalStorage
  useEffect(() => {
    localStorage.setItem('diabetes_history', JSON.stringify(history));
  }, [history]);

  const activeSlotId = manualSlotId || getActiveSlotId(settings.kiFactors);
  const activeSlot = settings.kiFactors.find(f => f.id === activeSlotId) || settings.kiFactors[0];

  // Calculation Logic
  const calculation = useMemo(() => {
    const khVal = parseFloat(kh) || 0;
    const bgVal = parseFloat(bg) || 0;
    
    if (activeSlotId === 'lantus' || isHypoOverride) {
      return { a: 0, b: 0, total: 0 };
    }

    if (!bgVal && !khVal) return { a: 0, b: 0, total: 0 };

    // A = KH / Factor
    const a = khVal / activeSlot.factor;

    // B = Correction
    const isNight = activeSlotId === 'n' || activeSlotId === 's';
    const targetFrom = isNight ? settings.targetNightFrom : settings.targetDayFrom;
    const targetTo = isNight ? settings.targetNightTo : settings.targetDayTo;
    const corrFactor = isNight ? settings.correctionNight : settings.correctionDay;

    let b = 0;
    if (bgVal > targetTo) {
      b = (bgVal - targetTo) / corrFactor;
    } else if (bgVal < targetFrom) {
      b = (bgVal - targetFrom) / corrFactor;
    }

    if (!settings.allowNegativeCorrection && b < 0) {
      b = 0;
    }

    let total = a + b;
    if (!settings.allowNegativeCorrection && total < 0) {
      total = 0;
    }

    // Rounding
    if (settings.rounding === '0.5') {
      total = Math.round(total * 2) / 2;
    } else if (settings.rounding === '1.0') {
      total = Math.round(total);
    }

    return { a, b, total };
  }, [kh, bg, activeSlot, activeSlotId, settings, isHypoOverride]);

  const handleSave = () => {
    const bgVal = parseFloat(bg);
    if (isNaN(bgVal)) return;

    const entry: HistoryEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      slot: activeSlotId === 'lantus' ? 'Vor Lantus' : activeSlot.name,
      kh: activeSlotId === 'lantus' ? null : parseFloat(kh) || 0,
      bg: bgVal,
      unit: settings.unit,
      kiFactor: activeSlotId === 'lantus' ? null : activeSlot.factor,
      insulinA: activeSlotId === 'lantus' ? null : calculation.a,
      insulinB: activeSlotId === 'lantus' ? null : calculation.b,
      total: activeSlotId === 'lantus' ? null : calculation.total,
    };

    setHistory(prev => [entry, ...prev].slice(0, 100));
    setKh('');
    setBg('');
    setManualSlotId(null);
    setIsHypoOverride(false);
    setActiveTab('history');
  };

  const exportCSV = () => {
    // BOM for UTF-8
    const BOM = '\uFEFF';
    const header = 'Zeitstempel;Slot;KH;Blutzucker;Einheit;KI-Faktor;Insulin A;Insulin B;Gesamt\n';
    
    const rows = history.map(e => {
      const date = new Date(e.timestamp);
      const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      
      return [
        dateStr,
        e.slot,
        formatNumber(e.kh),
        formatNumber(e.bg),
        e.unit,
        formatNumber(e.kiFactor),
        formatNumber(e.insulinA),
        formatNumber(e.insulinB),
        formatNumber(e.total)
      ].join(';');
    }).join('\n');

    const blob = new Blob([BOM + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `diabetes_export_numbers_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isHypo = useMemo(() => {
    const val = parseFloat(bg);
    if (isNaN(val)) return false;
    if (settings.unit === 'mg/dL') return val < 70;
    return val < 3.9;
  }, [bg, settings.unit]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Calculator className="text-black w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Insulin Calc Pro</h1>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">iPad/iPhone Edition</p>
          </div>
        </div>
        <div className="text-[10px] text-zinc-500 font-mono bg-white/5 px-2 py-1 rounded border border-white/5">
          {getCurrentTimeStr()}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-6 pt-6 pb-32">
        <AnimatePresence mode="wait">
          {activeTab === 'calc' && (
            <motion.div
              key="calc"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Warning */}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex gap-3">
                <AlertTriangle className="text-amber-500 w-5 h-5 shrink-0" />
                <p className="text-xs text-amber-200/80 leading-relaxed">
                  <strong>Warnung:</strong> Nur Rechenhilfe, keine medizinische Entscheidungshilfe.
                </p>
              </div>

              {/* Input Section */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold ml-1">KH Menge</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={kh}
                      onChange={(e) => setKh(e.target.value)}
                      placeholder="0"
                      className="w-full bg-zinc-900 border border-white/10 rounded-2xl px-4 py-4 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all placeholder:text-zinc-800"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold ml-1">Blutzucker ({settings.unit})</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={bg}
                      onChange={(e) => setBg(e.target.value)}
                      placeholder="0"
                      className={`w-full bg-zinc-900 border ${isHypo ? 'border-red-500/50 bg-red-500/5' : 'border-white/10'} rounded-2xl px-4 py-4 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all placeholder:text-zinc-800`}
                    />
                  </div>
                </div>

                {/* Slot Selection */}
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold ml-1">Zeit-Slot / Faktor</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={activeSlotId}
                      onChange={(e) => setManualSlotId(e.target.value)}
                      className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-3 text-sm font-medium focus:outline-none"
                    >
                      {settings.kiFactors.map(f => (
                        <option key={f.id} value={f.id}>{f.name} ({f.start}-{f.end})</option>
                      ))}
                      <option value="lantus">Vor Lantus (Nur Messung)</option>
                    </select>
                    <div className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-3 text-sm font-medium flex items-center justify-center text-emerald-500">
                      KI: {activeSlotId === 'lantus' ? '-' : activeSlot.factor.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Hypo Button */}
                {isHypo && (
                  <button
                    onClick={() => setIsHypoOverride(!isHypoOverride)}
                    className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${isHypoOverride ? 'bg-red-500 text-white' : 'bg-red-500/20 text-red-500 border border-red-500/30'}`}
                  >
                    <AlertTriangle className="w-5 h-5" />
                    UNTERZUCKER / NICHT KORRIGIEREN
                  </button>
                )}
              </div>

              {/* Results */}
              <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 space-y-6">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Gesamt Insulin</p>
                    <p className="text-6xl font-black text-emerald-500 tabular-nums">
                      {activeSlotId === 'lantus' ? '--' : calculation.total.toFixed(1)}
                    </p>
                  </div>
                  <div className="text-right space-y-2">
                    <div className="flex justify-between gap-4 text-xs">
                      <span className="text-zinc-500">Mahlzeit (A):</span>
                      <span className="font-mono text-zinc-300">{activeSlotId === 'lantus' ? '-' : calculation.a.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-xs">
                      <span className="text-zinc-500">Korrektur (B):</span>
                      <span className="font-mono text-zinc-300">{activeSlotId === 'lantus' ? '-' : calculation.b.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSave}
                  disabled={!bg}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 disabled:hover:bg-emerald-500 text-black font-bold py-5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                >
                  <Save className="w-5 h-5" />
                  WERT SPEICHERN
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Verlauf</h2>
                <div className="flex gap-2">
                  <button
                    onClick={exportCSV}
                    className="p-3 bg-zinc-900 border border-white/10 rounded-xl text-emerald-500 active:scale-90 transition-all"
                    title="Export für Numbers"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Verlauf wirklich löschen?')) setHistory([]);
                    }}
                    className="p-3 bg-zinc-900 border border-white/10 rounded-xl text-red-500 active:scale-90 transition-all"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {history.length === 0 ? (
                  <div className="py-20 text-center space-y-4">
                    <History className="w-12 h-12 text-zinc-800 mx-auto" />
                    <p className="text-zinc-500 text-sm">Noch keine Einträge vorhanden.</p>
                  </div>
                ) : (
                  history.map(entry => (
                    <div key={entry.id} className="bg-zinc-900/50 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase text-zinc-500">{entry.slot}</span>
                          <span className="text-[10px] text-zinc-600">•</span>
                          <span className="text-[10px] text-zinc-500">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-bold">{entry.bg}</span>
                          <span className="text-[10px] text-zinc-500 uppercase">{entry.unit}</span>
                          {entry.kh !== null && (
                            <>
                              <span className="text-zinc-700">|</span>
                              <span className="text-sm text-zinc-400">{entry.kh}g KH</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        {entry.total !== null ? (
                          <div className="flex flex-col items-end">
                            <span className="text-xl font-black text-emerald-500">{entry.total.toFixed(1)}</span>
                            <span className="text-[8px] uppercase tracking-tighter text-zinc-600 font-bold">Einheiten</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-zinc-600 italic">Nur Messung</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8 pb-10"
            >
              <h2 className="text-xl font-bold">Einstellungen</h2>

              {/* KI Factors */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <Calculator className="w-3 h-3" /> KI-Faktoren (Einheiten pro 10g KH)
                </h3>
                <div className="space-y-3">
                  {settings.kiFactors.map(f => (
                    <div key={f.id} className="bg-zinc-900/50 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold">{f.name}</p>
                        <p className="text-[10px] text-zinc-500">{f.start} - {f.end}</p>
                      </div>
                      <input
                        type="number"
                        step="0.1"
                        value={f.factor}
                        onChange={(e) => {
                          const newFactors = settings.kiFactors.map(sf => sf.id === f.id ? { ...sf, factor: parseFloat(e.target.value) || 0 } : sf);
                          setSettings({ ...settings, kiFactors: newFactors });
                        }}
                        className="w-20 bg-black border border-white/10 rounded-lg px-2 py-2 text-right font-mono text-emerald-500"
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* Correction Settings */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3" /> Korrektur & Zielwerte
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-4 space-y-3">
                    <p className="text-[10px] font-bold uppercase text-zinc-500">Tag</p>
                    <div className="space-y-2">
                      <label className="text-[9px] text-zinc-600 block">Ziel (von - bis)</label>
                      <div className="flex items-center gap-1">
                        <input type="number" value={settings.targetDayFrom} onChange={e => setSettings({...settings, targetDayFrom: parseInt(e.target.value)})} className="w-full bg-black border border-white/10 rounded p-1 text-xs text-center" />
                        <span className="text-zinc-700">-</span>
                        <input type="number" value={settings.targetDayTo} onChange={e => setSettings({...settings, targetDayTo: parseInt(e.target.value)})} className="w-full bg-black border border-white/10 rounded p-1 text-xs text-center" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-zinc-600 block">Korrekturwert</label>
                      <input type="number" value={settings.correctionDay} onChange={e => setSettings({...settings, correctionDay: parseInt(e.target.value)})} className="w-full bg-black border border-white/10 rounded p-2 text-sm text-center text-emerald-500" />
                    </div>
                  </div>
                  <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-4 space-y-3">
                    <p className="text-[10px] font-bold uppercase text-zinc-500">Nacht</p>
                    <div className="space-y-2">
                      <label className="text-[9px] text-zinc-600 block">Ziel (von - bis)</label>
                      <div className="flex items-center gap-1">
                        <input type="number" value={settings.targetNightFrom} onChange={e => setSettings({...settings, targetNightFrom: parseInt(e.target.value)})} className="w-full bg-black border border-white/10 rounded p-1 text-xs text-center" />
                        <span className="text-zinc-700">-</span>
                        <input type="number" value={settings.targetNightTo} onChange={e => setSettings({...settings, targetNightTo: parseInt(e.target.value)})} className="w-full bg-black border border-white/10 rounded p-1 text-xs text-center" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-zinc-600 block">Korrekturwert</label>
                      <input type="number" value={settings.correctionNight} onChange={e => setSettings({...settings, correctionNight: parseInt(e.target.value)})} className="w-full bg-black border border-white/10 rounded p-2 text-sm text-center text-emerald-500" />
                    </div>
                  </div>
                </div>
              </section>

              {/* General Settings */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <SettingsIcon className="w-3 h-3" /> Allgemein
                </h3>
                <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-4 space-y-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Einheit</span>
                    <select value={settings.unit} onChange={e => setSettings({...settings, unit: e.target.value as BGUnit})} className="bg-black border border-white/10 rounded-lg px-3 py-2 text-xs">
                      <option value="mg/dL">mg/dL</option>
                      <option value="mmol/L">mmol/L</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Rundung</span>
                    <select value={settings.rounding} onChange={e => setSettings({...settings, rounding: e.target.value as any})} className="bg-black border border-white/10 rounded-lg px-3 py-2 text-xs">
                      <option value="none">Keine</option>
                      <option value="0.5">0,5 IE</option>
                      <option value="1.0">Ganze IE</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Negative Korrektur</span>
                    <button 
                      onClick={() => setSettings({...settings, allowNegativeCorrection: !settings.allowNegativeCorrection})}
                      className={`w-12 h-6 rounded-full transition-all relative ${settings.allowNegativeCorrection ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${settings.allowNegativeCorrection ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-[#0a0a0a]/80 backdrop-blur-xl border-t border-white/5 px-6 pb-8 pt-4">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <NavButton 
            active={activeTab === 'calc'} 
            onClick={() => setActiveTab('calc')} 
            icon={<Calculator />} 
            label="Rechner" 
          />
          <NavButton 
            active={activeTab === 'history'} 
            onClick={() => setActiveTab('history')} 
            icon={<History />} 
            label="Verlauf" 
          />
          <NavButton 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
            icon={<SettingsIcon />} 
            label="Setup" 
          />
        </div>
      </nav>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition-all ${active ? 'text-emerald-500' : 'text-zinc-600'}`}
    >
      <div className={`p-2 rounded-xl transition-all ${active ? 'bg-emerald-500/10' : ''}`}>
        {cloneElement(icon as React.ReactElement, { className: 'w-6 h-6' })}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
    </button>
  );
}
