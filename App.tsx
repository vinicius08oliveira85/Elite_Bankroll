
import React, { useState, useMemo, useEffect } from 'react';
import './index.css';
import { 
  TrendingUp, 
  BrainCircuit,
  X,
  Plus,
  Settings,
  Wallet,
  BarChart3,
  Trophy,
  Skull,
  ShieldCheck,
  History,
  Ghost,
  Edit2,
  Calendar,
  Layers,
  Zap,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Area,
  Line,
  ComposedChart
} from 'recharts';
import { 
  OperationStatus, 
  TransactionType, 
  BankrollState, 
  Operation, 
  SentimentType
} from './types';
import { GoogleGenAI } from "@google/genai";

const STORAGE_KEY = 'elite_bankroll_system_v4';

interface LeverageRow {
  step: number;
  stake: number;
  odd: number;
  retorno: number;
  saquePotencial: number;
  isWithdrawn: boolean;
  status: OperationStatus;
  nextStake: number;
}

interface ExtendedBankrollState extends BankrollState {
  dailyGoalPercent: number; 
}

const parseLocaleNumber = (val: string | number | null): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const sanitized = val.toString().replace(',', '.');
  const num = parseFloat(sanitized);
  return isNaN(num) ? 0 : num;
};

const formatDateForInput = (timestamp: number) => {
  return new Date(timestamp).toISOString().split('T')[0];
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'MANAGEMENT' | 'LEVERAGE'>('MANAGEMENT');
  const [bankroll, setBankroll] = useState<ExtendedBankrollState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const defaultState = {
      initialBalance: 0,
      unitValuePercent: 1.0, 
      dailyGoalPercent: 3.0,
      transactions: [],
      operations: []
    };
    if (!saved) return defaultState;
    try {
      return { ...defaultState, ...JSON.parse(saved) };
    } catch (e) {
      return defaultState;
    }
  });

  // Leverage Config
  const [levStartCapital, setLevStartCapital] = useState("5.00");
  const [levOdd, setLevOdd] = useState("1.26");
  const [levSteps, setLevSteps] = useState(10);
  const [levWithdrawPercent, setLevWithdrawPercent] = useState(20);
  const [levRows, setLevRows] = useState<LeverageRow[]>([]);

  // Modals
  const [isOpModalOpen, setIsOpModalOpen] = useState(false);
  const [editingOp, setEditingOp] = useState<Operation | null>(null);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [filter, setFilter] = useState<OperationStatus | 'ALL'>('ALL');
  
  // Previews
  const [previewUnits, setPreviewUnits] = useState("1.00");
  const [previewOdd, setPreviewOdd] = useState("");
  const [previewProb, setPreviewProb] = useState("50");
  const [previewDate, setPreviewDate] = useState(formatDateForInput(Date.now()));

  // Auto-generate Leverage Rows
  useEffect(() => {
    generateCycle();
  }, [levSteps, levStartCapital, levOdd, levWithdrawPercent]);

  const generateCycle = () => {
    const capital = parseLocaleNumber(levStartCapital);
    const oddVal = parseLocaleNumber(levOdd);
    const newRows: LeverageRow[] = [];
    let currentStake = capital;

    for (let i = 1; i <= levSteps; i++) {
      const retorno = currentStake * oddVal;
      const saquePotencial = retorno * (levWithdrawPercent / 100);
      
      newRows.push({
        step: i,
        stake: currentStake,
        odd: oddVal,
        retorno: retorno,
        saquePotencial: saquePotencial,
        isWithdrawn: false,
        status: OperationStatus.PENDING,
        nextStake: retorno // Default reinvest 100%
      });
      currentStake = retorno;
    }
    setLevRows(newRows);
  };

  const recalculateChain = (currentRows: LeverageRow[], startIndex: number) => {
    const updated = [...currentRows];
    for (let i = startIndex; i < updated.length; i++) {
      const prev = updated[i - 1];
      if (prev) {
        // Se a aposta anterior foi RED, o ciclo quebra (stake 0)
        updated[i].stake = prev.status === OperationStatus.RED ? 0 : prev.nextStake;
      } else {
        updated[i].stake = parseLocaleNumber(levStartCapital);
      }

      updated[i].retorno = updated[i].stake * updated[i].odd;
      updated[i].saquePotencial = updated[i].retorno * (levWithdrawPercent / 100);
      updated[i].nextStake = updated[i].isWithdrawn 
        ? (updated[i].retorno - updated[i].saquePotencial) 
        : updated[i].retorno;
    }
    setLevRows(updated);
  };

  const toggleWithdraw = (index: number) => {
    const updated = [...levRows];
    updated[index].isWithdrawn = !updated[index].isWithdrawn;
    recalculateChain(updated, index);
  };

  const setRowStatus = (index: number, status: OperationStatus) => {
    const updated = [...levRows];
    updated[index].status = status;
    recalculateChain(updated, index);
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bankroll));
  }, [bankroll]);

  const stats = useMemo(() => {
    const initial = bankroll.initialBalance || 0;
    const allOps = bankroll.operations || [];
    const allTxs = bankroll.transactions || [];
    let runningBalance = initial;
    let peakBalance = initial;
    let maxDDValue = 0;
    const sortedTimeline = [
      ...allOps.map(o => ({ date: o.date, value: o.profitLoss })),
      ...allTxs.map(t => ({ date: t.date, value: t.type === TransactionType.DEPOSIT ? t.amount : -t.amount }))
    ].sort((a, b) => a.date - b.date);
    sortedTimeline.forEach(item => {
      runningBalance += item.value;
      if (runningBalance > peakBalance) peakBalance = runningBalance;
      const currentDD = peakBalance > 0 ? ((peakBalance - runningBalance) / peakBalance) * 100 : 0;
      if (currentDD > maxDDValue) maxDDValue = currentDD;
    });
    const currentBalance = runningBalance;
    let unitValue = (currentBalance * bankroll.unitValuePercent) / 100;
    if (unitValue <= 0) unitValue = 1.0; 
    const hoje = new Date().setHours(0,0,0,0);
    const opsHoje = allOps.filter(o => new Date(o.date).setHours(0,0,0,0) === hoje && o.status !== OperationStatus.PENDING);
    const lucroPrejuizoDia = opsHoje.reduce((acc, o) => acc + o.profitLoss, 0);
    const startingBalanceToday = currentBalance - lucroPrejuizoDia;
    const valorMetaDiaria = startingBalanceToday * (bankroll.dailyGoalPercent / 100);
    const stopLossDiario = -valorMetaDiaria; 
    const isStopLossAtingido = lucroPrejuizoDia <= stopLossDiario && stopLossDiario !== 0;
    let progressoVisual = 0;
    if (lucroPrejuizoDia > 0) progressoVisual = valorMetaDiaria > 0 ? Math.min(100, (lucroPrejuizoDia / valorMetaDiaria) * 100) : 0;
    else if (lucroPrejuizoDia < 0) progressoVisual = stopLossDiario < 0 ? Math.min(100, (Math.abs(lucroPrejuizoDia) / Math.abs(stopLossDiario)) * 100) : 0;
    const finishedOps = allOps.filter(o => o.status !== OperationStatus.PENDING);
    const totalProfit = finishedOps.reduce((acc, o) => acc + o.profitLoss, 0);
    const totalStake = finishedOps.reduce((acc, o) => acc + o.stakeAmount, 0);
    const roi = totalStake > 0 ? (totalProfit / totalStake) * 100 : 0;
    const winRate = (finishedOps.filter(o => o.status === OperationStatus.GREEN).length / (finishedOps.filter(o => o.status === OperationStatus.GREEN || o.status === OperationStatus.RED).length || 1)) * 100;
    
    return {
      currentBalance, totalProfit, roi, winRate, unitValue, maxDrawdown: maxDDValue,
      lucroPrejuizoDia, progressoVisual, isStopLossAtingido, valorMetaDiaria,
      evRate: allOps.length > 0 ? (allOps.filter(o => o.isPositiveEV).length / allOps.length) * 100 : 0,
    };
  }, [bankroll]);

  const leverageSummary = useMemo(() => {
    const totalWithdrawals = levRows.reduce((acc, r) => r.isWithdrawn ? acc + r.saquePotencial : acc, 0);
    const currentBalance = levRows.findLast(r => r.status === OperationStatus.GREEN)?.nextStake || 0;
    return { totalWithdrawals, currentBalance };
  }, [levRows]);

  const executeAddOperation = (op: Operation) => {
    setBankroll(prev => {
      const exists = prev.operations.some(o => o.id === op.id);
      let newOps = exists ? prev.operations.map(o => o.id === op.id ? op : o) : [op, ...(prev.operations || [])];
      newOps.sort((a, b) => b.date - a.date);
      return { ...prev, operations: newOps };
    });
    setIsOpModalOpen(false);
    setEditingOp(null);
  };

  const handleAddOperation = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const units = parseLocaleNumber(fd.get('units') as string);
    const odd = parseLocaleNumber(fd.get('odd') as string);
    const prob = parseLocaleNumber(fd.get('probability') as string);
    const status = fd.get('status') as OperationStatus;
    const matchDate = fd.get('matchDate') ? new Date(fd.get('matchDate') as string).getTime() : Date.now();
    const stakeAmount = units * stats.unitValue;
    let profitLoss = status === OperationStatus.GREEN ? stakeAmount * (odd - 1) : status === OperationStatus.RED ? -stakeAmount : 0;

    executeAddOperation({
      id: editingOp?.id || crypto.randomUUID(),
      date: matchDate,
      description: fd.get('description') as string,
      status, stakeUnits: units, stakeAmount, odd, profitLoss,
      category: (fd.get('category') as string).toUpperCase() || "GERAL",
      sentiment: fd.get('sentiment') as SentimentType,
      estimatedProbability: prob, isPositiveEV: (odd * prob) - 100 > 0
    });
  };

  const chartData = useMemo(() => {
    const initial = bankroll.initialBalance || 0;
    let runningBalance = initial;
    const data = [{ name: 'INIT', balance: initial, goal: initial }];
    [...bankroll.operations, ...bankroll.transactions.map(t => ({ date: t.date, profitLoss: t.type === TransactionType.DEPOSIT ? t.amount : -t.amount }))]
      .sort((a, b) => a.date - b.date)
      .forEach((item: any) => {
        runningBalance += item.profitLoss || 0;
        data.push({ name: new Date(item.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), balance: runningBalance, goal: initial });
      });
    return data;
  }, [bankroll]);

  const requestAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analise estatística curta. Saldo R$${stats.currentBalance.toFixed(2)}. ROI ${stats.roi.toFixed(1)}%.`
      });
      setAiAnalysis(response.text || "Sem insights no momento.");
    } catch { setAiAnalysis("Erro na análise."); } finally { setIsAnalyzing(false); }
  };

  const currentStakeValue = parseLocaleNumber(previewUnits) * stats.unitValue;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-4 md:p-8 font-sans transition-all duration-500">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-emerald-500/20">
              <ShieldCheck size={32} className="text-slate-950" />
            </div>
            <div>
              <h1 className="text-4xl font-black bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent uppercase tracking-tighter italic leading-none">Elite Architect</h1>
              <div className="flex gap-4 mt-1">
                <button onClick={() => setActiveTab('MANAGEMENT')} className={`text-[10px] font-black uppercase tracking-[0.2em] pb-1 border-b-2 transition ${activeTab === 'MANAGEMENT' ? 'text-cyan-400 border-cyan-400' : 'text-slate-600 border-transparent'}`}>Gestão Core</button>
                <button onClick={() => setActiveTab('LEVERAGE')} className={`text-[10px] font-black uppercase tracking-[0.2em] pb-1 border-b-2 transition ${activeTab === 'LEVERAGE' ? 'text-amber-400 border-amber-400' : 'text-slate-600 border-transparent'}`}>Alavancagem Pro</button>
              </div>
            </div>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button onClick={() => setIsConfigOpen(true)} className="p-3 bg-slate-900 rounded-2xl border border-slate-800 hover:bg-slate-800 transition text-slate-400"><Settings size={20}/></button>
            <button onClick={() => setIsTxModalOpen(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-900 px-6 py-3 rounded-2xl font-black border border-slate-800 transition hover:bg-slate-800 shadow-lg text-xs uppercase"><Wallet size={18}/> Fluxo</button>
            <button onClick={() => { setEditingOp(null); setIsOpModalOpen(true); }} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-3 rounded-2xl font-black uppercase text-sm tracking-widest transition shadow-xl ${stats.isStopLossAtingido ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/40' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40'}`}><Plus size={24}/> Registrar</button>
          </div>
        </header>

        {activeTab === 'MANAGEMENT' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className={`relative bg-slate-900/60 border ${stats.isStopLossAtingido ? 'border-rose-500' : 'border-slate-800'} rounded-[2rem] p-6 shadow-xl backdrop-blur-md`}>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Patrimônio Líquido</p>
                <h2 className="text-3xl font-black italic tracking-tighter text-white">R$ {stats.currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase">
                    <span className="text-slate-500">Progresso</span>
                    <span className={stats.lucroPrejuizoDia >= 0 ? 'text-cyan-400' : 'text-rose-500'}>{stats.progressoVisual.toFixed(1)}%</span>
                  </div>
                  <div className="relative h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div className={`absolute top-0 left-0 h-full transition-all duration-1000 ${stats.lucroPrejuizoDia >= 0 ? 'bg-cyan-500' : 'bg-rose-500'}`} style={{ width: `${stats.progressoVisual}%` }} />
                  </div>
                </div>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-[2rem] p-6 shadow-xl backdrop-blur-md">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Max Drawdown</p>
                <h2 className={`text-3xl font-black italic ${stats.maxDrawdown > 15 ? 'text-rose-400' : 'text-cyan-400'}`}>-{stats.maxDrawdown.toFixed(1)}%</h2>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-[2rem] p-6 shadow-xl backdrop-blur-md">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Edge (+EV)</p>
                <h2 className="text-3xl font-black text-indigo-400 italic">{stats.evRate.toFixed(1)}%</h2>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-[2rem] p-6 shadow-xl backdrop-blur-md">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">ROI Global</p>
                <h2 className={`text-3xl font-black italic ${stats.roi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{stats.roi.toFixed(2)}%</h2>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 h-[450px] shadow-2xl backdrop-blur-xl flex flex-col">
                   <h3 className="font-black uppercase text-[10px] tracking-[0.3em] text-slate-500 mb-8 flex items-center gap-3"><TrendingUp size={14} className="text-emerald-500"/> Equity Performance</h3>
                   <div className="flex-1 w-full min-h-0 relative">
                     <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData}>
                        <defs><linearGradient id="colorBal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.2} />
                        <XAxis dataKey="name" stroke="#475569" fontSize={9} axisLine={false} tickLine={false} />
                        <YAxis stroke="#475569" fontSize={9} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: any) => `R$ ${v.toFixed(2)}`} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }} />
                        <Area type="monotone" dataKey="balance" stroke="#10b981" fill="url(#colorBal)" strokeWidth={3} dot={false} />
                        <Line type="monotone" dataKey="goal" stroke="#f59e0b" strokeDasharray="5 5" dot={false} strokeWidth={1.5} opacity={0.5} />
                      </ComposedChart>
                    </ResponsiveContainer>
                   </div>
                </div>

                <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
                  <div className="p-8 border-b border-slate-800/60 flex justify-between items-center">
                    <h3 className="font-black uppercase text-[10px] tracking-[0.3em] text-slate-500 flex items-center gap-2 italic"><History size={16}/> Audit Log</h3>
                    <div className="flex gap-2">
                      {['ALL', 'GREEN', 'RED'].map(st => (
                        <button key={st} onClick={() => setFilter(st as any)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${filter === st ? 'bg-slate-800 text-white' : 'text-slate-600'}`}>{st}</button>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left table-auto border-collapse">
                      <thead className="bg-slate-900/60 text-[10px] text-slate-500 uppercase font-black tracking-widest">
                        <tr><th className="px-8 py-5">Data</th><th className="px-8 py-5">Mercado</th><th className="px-8 py-5 text-right">Profit</th><th className="px-8 py-5 text-center">Ações</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {bankroll.operations.filter(o => filter === 'ALL' || o.status === filter).map(op => (
                          <tr key={op.id} className="hover:bg-slate-800/20 transition group">
                            <td className="px-8 py-5 text-slate-500 font-mono text-[11px]">{new Date(op.date).toLocaleDateString()}</td>
                            <td className="px-8 py-5">
                              <div className="flex flex-col"><span className="font-black text-slate-200 uppercase text-sm">{op.description}</span><span className="text-[9px] text-cyan-500 font-black uppercase">@{op.category} · ODD {op.odd.toFixed(2)}</span></div>
                            </td>
                            <td className={`px-8 py-5 text-right font-black italic text-base ${op.status === 'GREEN' ? 'text-emerald-400' : 'text-rose-400'}`}>{op.status === 'GREEN' ? '+' : ''} R$ {op.profitLoss.toFixed(2)}</td>
                            <td className="px-8 py-5 text-center">
                              <button onClick={() => { setEditingOp(op); setIsOpModalOpen(true); }} className="p-2 text-slate-500 hover:text-cyan-400 transition-colors bg-slate-950/40 rounded-lg border border-slate-800"><Edit2 size={14}/></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                 <div className={`bg-gradient-to-br border rounded-[2.5rem] p-8 space-y-8 relative overflow-hidden group min-h-[300px] flex flex-col justify-between transition-all duration-700 ${stats.isStopLossAtingido ? 'from-rose-950/20 to-slate-950 border-rose-500/30' : 'from-indigo-900/10 to-slate-950 border-indigo-500/20'}`}>
                   <div className="absolute -top-10 -right-10 opacity-5 group-hover:opacity-10 pointer-events-none"><BrainCircuit size={180}/></div>
                   <div className="space-y-6">
                     <h3 className="font-black uppercase text-[10px] tracking-[0.4em] flex items-center gap-3 italic relative z-10 text-indigo-400"><BrainCircuit size={18}/> Mentor IA</h3>
                     <p className="text-sm text-slate-300 leading-relaxed italic font-medium relative z-10 border-l-2 border-indigo-500/30 pl-4 py-1">{aiAnalysis || "Solicite uma análise para otimizar sua gestão."}</p>
                   </div>
                   <button onClick={requestAiAnalysis} disabled={isAnalyzing} className="w-full py-4 bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 rounded-2xl font-black text-[10px] uppercase tracking-widest transition shadow-lg disabled:opacity-50 relative z-10">{isAnalyzing ? "ANALISANDO..." : "GERAR INSIGHT"}</button>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* LEVERAGE DASHBOARD */
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* CONTROLS */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl space-y-8 sticky top-8">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-amber-500/20 rounded-xl flex items-center justify-center border border-amber-500/30">
                    <Zap size={20} className="text-amber-500" />
                  </div>
                  <div>
                    <h3 className="font-black uppercase text-xs tracking-widest">Setup Soros</h3>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Ciclo de Alavancagem</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase px-2 tracking-widest">Stake Inicial</label>
                    <input type="text" value={levStartCapital} onChange={(e) => setLevStartCapital(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 font-black text-emerald-400 outline-none focus:ring-2 ring-emerald-500/20 text-lg font-mono" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase px-2 tracking-widest">Odd Alvo</label>
                    <input type="text" value={levOdd} onChange={(e) => setLevOdd(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 font-black text-cyan-400 outline-none focus:ring-2 ring-cyan-500/20 text-lg font-mono" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase px-2 tracking-widest">Níveis do Ciclo</label>
                    <input type="number" value={levSteps} onChange={(e) => setLevSteps(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 font-black text-white outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase px-2 tracking-widest">Saque de Lucro %</label>
                    <div className="flex items-center gap-4">
                      <input type="range" min="0" max="50" value={levWithdrawPercent} onChange={(e) => setLevWithdrawPercent(Number(e.target.value))} className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500" />
                      <span className="text-amber-500 font-black text-xs font-mono">{levWithdrawPercent}%</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800 space-y-3">
                   <div className="flex justify-between items-center text-[10px] font-black uppercase">
                     <span className="text-slate-500">Total Sacado:</span>
                     <span className="text-amber-500 font-mono">R$ {leverageSummary.totalWithdrawals.toFixed(2)}</span>
                   </div>
                   <button onClick={generateCycle} className="w-full py-4 bg-slate-950 border border-slate-800 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] hover:text-white transition flex items-center justify-center gap-2"><RotateCcw size={14}/> Resetar Ciclo</button>
                </div>
              </div>
            </div>

            {/* LEVERAGE TABLE */}
            <div className="lg:col-span-3">
              <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden backdrop-blur-md">
                <div className="p-8 border-b border-slate-800/60 flex justify-between items-center bg-slate-900/40">
                   <h3 className="font-black uppercase text-[10px] tracking-[0.3em] text-slate-500 flex items-center gap-2 italic"><Layers size={16}/> Protocolo de Progressão</h3>
                   <div className="flex items-center gap-2">
                     <span className="text-[9px] font-bold text-slate-600 uppercase">Clique no Saque para Efetivar</span>
                   </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left table-auto border-collapse">
                    <thead className="bg-slate-950/60 text-[10px] text-slate-500 uppercase font-black tracking-widest">
                      <tr>
                        <th className="px-6 py-5">Nível</th>
                        <th className="px-6 py-5 text-center">Status</th>
                        <th className="px-6 py-5">Stake (B)</th>
                        <th className="px-6 py-5">Retorno (C)</th>
                        <th className="px-6 py-5">Saque (E)</th>
                        <th className="px-6 py-5 text-right">Próxima</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/20">
                      {levRows.map((row, idx) => (
                        <tr key={idx} className={`transition group ${row.status === OperationStatus.GREEN ? 'bg-emerald-500/[0.03]' : row.status === OperationStatus.RED ? 'bg-rose-500/[0.03] opacity-50' : ''}`}>
                          <td className="px-6 py-4">
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center font-black text-xs border ${row.status === OperationStatus.GREEN ? 'border-emerald-500/50 text-emerald-400' : 'border-slate-800 text-slate-500'}`}>
                              {row.step}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => setRowStatus(idx, OperationStatus.GREEN)} className={`p-2 rounded-lg transition ${row.status === OperationStatus.GREEN ? 'bg-emerald-500 text-slate-950' : 'bg-slate-950 border border-slate-800 text-slate-700 hover:text-emerald-500'}`}><CheckCircle2 size={16}/></button>
                              <button onClick={() => setRowStatus(idx, OperationStatus.RED)} className={`p-2 rounded-lg transition ${row.status === OperationStatus.RED ? 'bg-rose-500 text-slate-950' : 'bg-slate-950 border border-slate-800 text-slate-700 hover:text-rose-500'}`}><XCircle size={16}/></button>
                              <button onClick={() => setRowStatus(idx, OperationStatus.PENDING)} className={`p-2 rounded-lg transition ${row.status === OperationStatus.PENDING ? 'bg-slate-800 text-white' : 'bg-slate-950 border border-slate-800 text-slate-700 hover:text-white'}`}><Clock size={16}/></button>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-mono text-sm font-bold text-slate-400">R$ {row.stake.toFixed(2)}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-mono text-sm font-black text-emerald-400">R$ {row.retorno.toFixed(2)}</span>
                          </td>
                          <td className="px-6 py-4">
                            <button 
                              onClick={() => toggleWithdraw(idx)}
                              className={`group/btn flex items-center gap-3 px-4 py-2 rounded-xl border transition-all ${row.isWithdrawn ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-lg shadow-amber-500/20' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-amber-500/50 hover:text-amber-400'}`}
                            >
                               <span className="text-[10px] font-black uppercase tracking-tighter">R$</span>
                               <span className="font-mono font-black">{row.saquePotencial.toFixed(2)}</span>
                               {row.isWithdrawn && <CheckCircle2 size={12} />}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-right">
                             <div className="flex flex-col items-end">
                               <div className="flex items-center gap-2">
                                 <span className="text-slate-600"><ArrowRight size={12}/></span>
                                 <span className={`font-mono font-black text-sm ${row.status === OperationStatus.RED ? 'text-slate-700 line-through' : 'text-cyan-400'}`}>R$ {row.nextStake.toFixed(2)}</span>
                               </div>
                               <span className="text-[8px] font-black uppercase text-slate-600 mt-1">{row.isWithdrawn ? 'Saque Aplicado' : 'Reinvestimento Total'}</span>
                             </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODALS */}
      {isOpModalOpen && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-2xl flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
          <form onSubmit={handleAddOperation} className="bg-slate-900 border border-slate-800 rounded-[3rem] p-10 max-w-lg w-full space-y-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500"></div>
            <button type="button" onClick={() => { setIsOpModalOpen(false); setEditingOp(null); }} className="absolute top-8 right-8 text-slate-500 hover:text-white transition-colors"><X size={24}/></button>
            <div className="space-y-2">
              <h2 className="text-3xl font-black uppercase tracking-tighter italic text-emerald-400">{editingOp ? 'Editar Ordem' : 'Novo Registro'}</h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Protocolo de Entrada</p>
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <input name="units" type="text" inputMode="decimal" required value={previewUnits} onChange={(e) => setPreviewUnits(e.target.value)}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black text-emerald-400 outline-none focus:ring-2 ring-emerald-500/20 text-xl font-mono" placeholder="Unidades" />
                <input name="odd" type="text" inputMode="decimal" required value={previewOdd} onChange={(e) => setPreviewOdd(e.target.value)}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black text-cyan-400 outline-none focus:ring-2 ring-cyan-500/20 text-xl font-mono" placeholder="Odd" />
              </div>
              <div className="relative group">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"><Calendar size={18} /></div>
                <input name="matchDate" type="date" required value={previewDate} onChange={(e) => setPreviewDate(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl pl-14 pr-5 py-4 font-black text-slate-300 outline-none focus:ring-2 ring-indigo-500/20 text-sm uppercase" />
              </div>
              <div className="grid grid-cols-2 gap-6">
                 <input name="probability" type="number" required value={previewProb} onChange={(e) => setPreviewProb(e.target.value)}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black text-indigo-400 outline-none text-xl" placeholder="Confiança %" />
                  <select name="sentiment" defaultValue={editingOp?.sentiment || "Calmo"} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black text-slate-300 outline-none">
                    <option value="Calmo">Calmo</option><option value="Ansioso">Ansioso</option><option value="Raiva">Raiva</option><option value="Excesso de Confiança">Excesso de Confiança</option>
                  </select>
              </div>
              <div className="grid grid-cols-2 gap-6">
                 <input name="description" required defaultValue={editingOp?.description} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-bold outline-none uppercase text-xs" placeholder="Evento" />
                 <input name="category" required defaultValue={editingOp?.category} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-bold outline-none uppercase text-xs" placeholder="Mercado" />
              </div>
              <select name="status" defaultValue={editingOp?.status || "GREEN"} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black outline-none appearance-none text-center tracking-widest uppercase text-xs">
                 <option value="GREEN" className="text-emerald-500">VITÓRIA (GREEN)</option><option value="RED" className="text-rose-500">DERROTA (RED)</option><option value="PENDING">PENDENTE (LIVE)</option>
              </select>
            </div>
            <button type="submit" className="w-full py-6 rounded-2xl font-black uppercase tracking-[0.4em] text-sm transition-all shadow-2xl bg-emerald-600 hover:bg-emerald-500">
              Confirmar Execução
            </button>
          </form>
        </div>
      )}

      {isConfigOpen && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-2xl flex items-center justify-center p-4 z-50">
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); setBankroll(p => ({...p, initialBalance: parseLocaleNumber(fd.get('initial') as string), unitValuePercent: parseLocaleNumber(fd.get('risk') as string), dailyGoalPercent: parseLocaleNumber(fd.get('goal') as string) })); setIsConfigOpen(false); }} className="bg-slate-900 border border-slate-800 rounded-[3rem] p-10 max-w-md w-full space-y-8 relative shadow-2xl">
            <button type="button" onClick={() => setIsConfigOpen(false)} className="absolute top-8 right-8 text-slate-500 hover:text-white"><X size={24}/></button>
            <h2 className="text-3xl font-black uppercase text-cyan-400 italic">Parâmetros</h2>
            <div className="space-y-6">
                <input name="initial" type="text" inputMode="decimal" className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-5 font-black outline-none text-2xl text-white font-mono" defaultValue={bankroll.initialBalance} placeholder="Capital Inicial" />
                <div className="grid grid-cols-2 gap-6">
                  <input name="risk" type="text" inputMode="decimal" className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black text-emerald-400 outline-none" defaultValue={bankroll.unitValuePercent} placeholder="Risco %" />
                  <input name="goal" type="text" inputMode="decimal" className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black text-amber-500 outline-none" defaultValue={bankroll.dailyGoalPercent} placeholder="Meta %" />
                </div>
            </div>
            <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 py-6 rounded-2xl font-black uppercase text-sm shadow-xl transition-all">Efetivar Estratégia</button>
          </form>
        </div>
      )}

      {isTxModalOpen && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-2xl flex items-center justify-center p-4 z-50">
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const amount = parseLocaleNumber(fd.get('amount') as string);
            const type = fd.get('type') as TransactionType;
            setBankroll(p => ({
              ...p,
              transactions: [{ id: crypto.randomUUID(), type, amount, date: Date.now(), description: fd.get('description') as string }, ...(p.transactions || [])]
            }));
            setIsTxModalOpen(false);
          }} className="bg-slate-900 border border-slate-800 rounded-[3rem] p-10 max-md w-full space-y-8 shadow-2xl relative">
            <button type="button" onClick={() => setIsTxModalOpen(false)} className="absolute top-8 right-8 text-slate-500"><X size={24}/></button>
            <h2 className="text-3xl font-black uppercase text-white italic">Fluxo de Caixa</h2>
            <div className="space-y-6">
              <select name="type" className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 font-black outline-none appearance-none text-xs uppercase tracking-widest">
                <option value="DEPOSIT">APORTE (IN)</option><option value="WITHDRAWAL">SAQUE (OUT)</option>
              </select>
              <input name="amount" type="text" inputMode="decimal" required className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-6 font-black text-white text-3xl outline-none font-mono" placeholder="0,00" />
              <input name="description" required className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 font-bold outline-none italic" placeholder="Motivo" />
            </div>
            <button type="submit" className="w-full bg-white text-slate-950 hover:bg-slate-200 py-6 rounded-2xl font-black uppercase text-sm shadow-xl">Registrar</button>
          </form>
        </div>
      )}
    </div>
  );
};

export default App;
