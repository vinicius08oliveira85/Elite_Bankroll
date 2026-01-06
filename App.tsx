import React, { useState, useMemo, useEffect } from 'react';
import './index.css';
import { 
  TrendingUp, 
  AlertTriangle,
  BrainCircuit,
  X,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Settings,
  Wallet,
  BarChart3,
  Download,
  Trophy,
  Skull,
  ShieldCheck,
  History,
  Target,
  ShieldAlert,
  Ghost,
  Edit2,
  Calendar
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
  Transaction,
  SentimentType
} from './types';
import { GoogleGenAI } from "@google/genai";

const STORAGE_KEY = 'elite_bankroll_system_v4';

interface ExtendedBankrollState extends BankrollState {
  dailyGoalPercent: number; 
}

const parseLocaleNumber = (val: string | null): number => {
  if (!val) return 0;
  const sanitized = val.replace(',', '.');
  const num = parseFloat(sanitized);
  return isNaN(num) ? 0 : num;
};

// Auxiliar para formatar data para o input HTML (YYYY-MM-DD)
const formatDateForInput = (timestamp: number) => {
  return new Date(timestamp).toISOString().split('T')[0];
};

const App: React.FC = () => {
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

  const [isOpModalOpen, setIsOpModalOpen] = useState(false);
  const [editingOp, setEditingOp] = useState<Operation | null>(null);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [showStopWarning, setShowStopWarning] = useState(false);
  const [pendingOp, setPendingOp] = useState<Operation | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [filter, setFilter] = useState<OperationStatus | 'ALL'>('ALL');
  
  const [previewUnits, setPreviewUnits] = useState("1.00");
  const [previewOdd, setPreviewOdd] = useState("");
  const [previewProb, setPreviewProb] = useState("50");
  const [previewDate, setPreviewDate] = useState(formatDateForInput(Date.now()));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bankroll));
  }, [bankroll]);

  useEffect(() => {
    if (editingOp) {
      setPreviewUnits(editingOp.stakeUnits.toString());
      setPreviewOdd(editingOp.odd.toString());
      setPreviewProb(editingOp.estimatedProbability.toString());
      setPreviewDate(formatDateForInput(editingOp.date));
    } else {
      setPreviewUnits("1.00");
      setPreviewOdd("");
      setPreviewProb("50");
      setPreviewDate(formatDateForInput(Date.now()));
    }
  }, [editingOp, isOpModalOpen]);

  const stats = useMemo(() => {
    const initial = bankroll.initialBalance || 0;
    const allOps = bankroll.operations || [];
    const allTxs = bankroll.transactions || [];
    
    let runningBalance = initial;
    let peakBalance = initial;
    let maxDDValue = 0;

    const sortedTimeline = [
      ...allOps.map(o => ({ date: o.date, value: o.profitLoss })),
      ...allTxs.map(t => ({ 
        date: t.date, 
        value: t.type === TransactionType.DEPOSIT ? t.amount : -t.amount 
      }))
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
    const opsHoje = allOps.filter(o => 
      new Date(o.date).setHours(0,0,0,0) === hoje && o.status !== OperationStatus.PENDING
    );

    const lucroPrejuizoDia = opsHoje.reduce((acc, o) => acc + o.profitLoss, 0);
    const startingBalanceToday = currentBalance - lucroPrejuizoDia;
    const valorMetaDiaria = startingBalanceToday * (bankroll.dailyGoalPercent / 100);
    const stopLossDiario = -valorMetaDiaria; 

    const isStopLossAtingido = lucroPrejuizoDia <= stopLossDiario && stopLossDiario !== 0;
    const isMetaBatida = lucroPrejuizoDia >= valorMetaDiaria && valorMetaDiaria !== 0;

    let progressoVisual = 0;
    if (lucroPrejuizoDia > 0) {
        progressoVisual = valorMetaDiaria > 0 ? Math.min(100, (lucroPrejuizoDia / valorMetaDiaria) * 100) : 0;
    } else if (lucroPrejuizoDia < 0) {
        progressoVisual = stopLossDiario < 0 ? Math.min(100, (Math.abs(lucroPrejuizoDia) / Math.abs(stopLossDiario)) * 100) : 0;
    }

    const finishedOps = allOps.filter(o => o.status !== OperationStatus.PENDING);
    const totalProfit = finishedOps.reduce((acc, o) => acc + o.profitLoss, 0);
    const totalStake = finishedOps.reduce((acc, o) => acc + o.stakeAmount, 0);
    const roi = totalStake > 0 ? (totalProfit / totalStake) * 100 : 0;
    const winRate = (finishedOps.filter(o => o.status === OperationStatus.GREEN).length / 
                    (finishedOps.filter(o => o.status === OperationStatus.GREEN || o.status === OperationStatus.RED).length || 1)) * 100;

    const categoryMap: Record<string, { profit: number, stake: number, wins: number, total: number }> = {};
    allOps.forEach(op => {
      const cat = (op.category || 'GERAL').toUpperCase();
      if (!categoryMap[cat]) categoryMap[cat] = { profit: 0, stake: 0, wins: 0, total: 0 };
      categoryMap[cat].profit += op.profitLoss;
      categoryMap[cat].stake += op.stakeAmount;
      categoryMap[cat].total += 1;
      if (op.status === OperationStatus.GREEN) categoryMap[cat].wins += 1;
    });

    const categoryStats = Object.entries(categoryMap).map(([name, data]) => ({
      name,
      profit: data.profit,
      roi: data.stake > 0 ? (data.profit / data.stake) * 100 : 0,
      winRate: (data.wins / data.total) * 100,
      total: data.total
    })).sort((a, b) => b.profit - a.profit);

    return {
      currentBalance,
      totalProfit,
      roi,
      winRate,
      unitValue,
      maxDrawdown: maxDDValue,
      bestCategory: categoryStats[0] || null,
      worstCategory: [...categoryStats].sort((a, b) => a.profit - b.profit)[0] || null,
      evRate: allOps.length > 0 ? (allOps.filter(o => o.isPositiveEV).length / allOps.length) * 100 : 0,
      lucroPrejuizoDia,
      progressoVisual,
      isStopLossAtingido,
      isMetaBatida,
      valorMetaDiaria
    };
  }, [bankroll]);

  const chartData = useMemo(() => {
    const initial = bankroll.initialBalance || 0;
    const allOps = bankroll.operations || [];
    const allTxs = bankroll.transactions || [];
    
    const sortedTimeline = [
      ...allOps.map(o => ({ date: o.date, value: o.profitLoss })),
      ...allTxs.map(t => ({ 
        date: t.date, 
        value: t.type === TransactionType.DEPOSIT ? t.amount : -t.amount 
      }))
    ].sort((a, b) => a.date - b.date);

    let runningBalance = initial;
    const data = [{ name: 'INIT', balance: initial, goal: initial }];
    
    sortedTimeline.forEach((item) => {
      runningBalance += item.value;
      data.push({
        name: new Date(item.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        balance: runningBalance,
        goal: initial
      });
    });
    
    return data;
  }, [bankroll.operations, bankroll.transactions, bankroll.initialBalance]);

  const executeAddOperation = (op: Operation) => {
    setBankroll(prev => {
      const exists = prev.operations.some(o => o.id === op.id);
      let newOps;
      if (exists) {
        newOps = prev.operations.map(o => o.id === op.id ? op : o);
      } else {
        newOps = [op, ...(prev.operations || [])];
      }
      // Reordena por data sempre que salvar
      newOps.sort((a, b) => b.date - a.date);
      return { ...prev, operations: newOps };
    });
    setIsOpModalOpen(false);
    setShowStopWarning(false);
    setPendingOp(null);
    setEditingOp(null);
  };

  const handleAddOperation = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const units = parseLocaleNumber(fd.get('units') as string);
    const odd = parseLocaleNumber(fd.get('odd') as string);
    const prob = parseLocaleNumber(fd.get('probability') as string);
    const status = fd.get('status') as OperationStatus;
    const sentiment = fd.get('sentiment') as SentimentType;
    const category = fd.get('category') as string;
    const matchDateString = fd.get('matchDate') as string;
    
    // Converte a string YYYY-MM-DD para timestamp
    const matchDate = matchDateString ? new Date(matchDateString).getTime() : Date.now();

    const stakeAmount = units * stats.unitValue;
    let profitLoss = 0;
    if (status === OperationStatus.GREEN) profitLoss = stakeAmount * (odd - 1);
    else if (status === OperationStatus.RED) profitLoss = -stakeAmount;

    const opData: Operation = {
      id: editingOp?.id || crypto.randomUUID(),
      date: matchDate,
      description: fd.get('description') as string,
      status,
      stakeUnits: units,
      stakeAmount,
      odd,
      profitLoss,
      category: category.toUpperCase() || "GERAL",
      sentiment,
      estimatedProbability: prob,
      isPositiveEV: (odd * prob) - 100 > 0
    };

    if (stats.isStopLossAtingido && !editingOp) {
      setPendingOp(opData);
      setShowStopWarning(true);
    } else {
      executeAddOperation(opData);
    }
  };

  const requestAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let prompt = stats.isStopLossAtingido 
        ? `ALERTA STOP LOSS. Saldo: R$${stats.currentBalance.toFixed(2)}. Foque em disciplina e parada imediata.`
        : `Análise tática. Saldo R$${stats.currentBalance.toFixed(2)}. ROI: ${stats.roi.toFixed(1)}%.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      setAiAnalysis(response.text || "Análise indisponível.");
    } catch (error) {
      setAiAnalysis("Erro na auditoria.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateConfig = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBankroll(prev => ({
      ...prev,
      initialBalance: parseLocaleNumber(fd.get('initial') as string),
      unitValuePercent: parseLocaleNumber(fd.get('risk') as string),
      dailyGoalPercent: parseLocaleNumber(fd.get('goal') as string)
    }));
    setIsConfigOpen(false);
  };

  const openEdit = (op: Operation) => {
    setEditingOp(op);
    setIsOpModalOpen(true);
  };

  const currentStakeValue = parseLocaleNumber(previewUnits) * stats.unitValue;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-emerald-500/20">
              <ShieldCheck size={32} className="text-slate-950" />
            </div>
            <div>
              <h1 className="text-4xl font-black bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent uppercase tracking-tighter italic leading-none">Elite Architect</h1>
              <p className="text-slate-500 font-bold text-[10px] uppercase tracking-[0.3em] mt-1">Institutional Risk Controller v4.2</p>
            </div>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button onClick={() => setIsConfigOpen(true)} className="p-3 bg-slate-900 rounded-2xl border border-slate-800 hover:bg-slate-800 transition text-slate-400"><Settings size={20}/></button>
            <button onClick={() => setIsTxModalOpen(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-900 px-6 py-3 rounded-2xl font-black border border-slate-800 transition hover:bg-slate-800 shadow-lg text-xs uppercase"><Wallet size={18}/> Fluxo</button>
            <button onClick={() => { setEditingOp(null); setIsOpModalOpen(true); }} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-3 rounded-2xl font-black uppercase text-sm tracking-widest transition shadow-xl ${stats.isStopLossAtingido ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/40' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40'}`}><Plus size={24}/> Registrar</button>
          </div>
        </header>

        {/* TOP CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className={`relative bg-slate-900/60 border ${stats.isStopLossAtingido ? 'border-rose-500 shadow-rose-900/20' : 'border-slate-800'} rounded-[2rem] p-6 shadow-xl backdrop-blur-md overflow-hidden transition-all duration-500`}>
            {stats.isStopLossAtingido && <div className="absolute inset-0 bg-rose-600/5 animate-pulse-slow pointer-events-none" />}
            <div className="flex justify-between items-start mb-2 relative z-10">
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Patrimônio Líquido</p>
              {stats.isStopLossAtingido ? <AlertTriangle size={14} className="text-rose-500 animate-bounce" /> : <Target size={14} className="text-slate-600" />}
            </div>
            <h2 className={`text-3xl font-black italic tracking-tighter relative z-10 ${stats.isStopLossAtingido ? 'text-rose-400' : 'text-white'}`}>
              R$ {stats.currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <div className="mt-4 space-y-2 relative z-10">
              <div className="flex justify-between items-center text-[10px] font-black uppercase">
                <span className="text-slate-500">{stats.lucroPrejuizoDia >= 0 ? 'Meta Diária' : 'Risco Stop Loss'}</span>
                <span className={stats.lucroPrejuizoDia >= 0 ? 'text-cyan-400' : 'text-rose-500'}>{stats.progressoVisual.toFixed(1)}%</span>
              </div>
              <div className="relative h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className={`absolute top-0 left-0 h-full transition-all duration-1000 ${stats.lucroPrejuizoDia >= 0 ? 'bg-gradient-to-r from-cyan-600 to-emerald-400' : 'bg-gradient-to-r from-rose-700 to-rose-400'}`} style={{ width: `${stats.progressoVisual}%` }} />
              </div>
              <div className="flex items-center justify-between text-[10px] font-black mt-2">
                <span className={stats.lucroPrejuizoDia >= 0 ? 'text-emerald-400' : 'text-rose-400'}>R$ {Math.abs(stats.lucroPrejuizoDia).toFixed(2)} HOJE</span>
                <span className="text-slate-500 uppercase tracking-tighter">Unit: R$ {stats.unitValue.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-[2rem] p-6 shadow-xl backdrop-blur-md">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Max Drawdown</p>
            <h2 className={`text-3xl font-black italic ${stats.maxDrawdown > 15 ? 'text-rose-400' : 'text-cyan-400'}`}>-{stats.maxDrawdown.toFixed(1)}%</h2>
            <p className="text-slate-500 text-[10px] mt-4 font-bold uppercase tracking-widest">Risco de Ruína</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-[2rem] p-6 shadow-xl backdrop-blur-md">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Value Rate (+EV)</p>
            <h2 className="text-3xl font-black text-indigo-400 italic">{stats.evRate.toFixed(1)}%</h2>
            <p className="text-slate-500 text-[10px] mt-4 font-bold uppercase tracking-widest">Edge Matemático</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-[2rem] p-6 shadow-xl backdrop-blur-md">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">ROI Global</p>
            <h2 className={`text-3xl font-black italic ${stats.roi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{stats.roi.toFixed(2)}%</h2>
            <div className="w-full bg-slate-800 h-1 mt-4 rounded-full overflow-hidden">
               <div className="bg-emerald-500 h-full" style={{ width: `${Math.min(100, stats.winRate)}%` }}></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-8 min-w-0">
            {/* CHART */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 h-[450px] shadow-2xl backdrop-blur-xl flex flex-col">
               <h3 className="font-black uppercase text-[10px] tracking-[0.3em] text-slate-500 mb-8 flex items-center gap-3">
                 <TrendingUp size={14} className="text-emerald-500"/> Equity Performance
               </h3>
               <div className="flex-1 w-full min-h-0 relative">
                 <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <defs>
                      <linearGradient id="colorBal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.2} />
                    <XAxis dataKey="name" stroke="#475569" fontSize={9} axisLine={false} tickLine={false} />
                    <YAxis stroke="#475569" fontSize={9} axisLine={false} tickLine={false} />
                    <Tooltip 
                      formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }} 
                    />
                    <Area type="monotone" dataKey="balance" stroke="#10b981" fill="url(#colorBal)" strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="goal" stroke="#f59e0b" strokeDasharray="5 5" dot={false} strokeWidth={1.5} opacity={0.5} />
                  </ComposedChart>
                </ResponsiveContainer>
               </div>
            </div>

            {/* AUDIT LOG */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
              <div className="p-8 border-b border-slate-800/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h3 className="font-black uppercase text-[10px] tracking-[0.3em] text-slate-500 flex items-center gap-2 italic"><History size={16}/> Audit Log</h3>
                <div className="flex gap-2">
                  {['ALL', 'GREEN', 'RED'].map(st => (
                    <button key={st} onClick={() => setFilter(st as any)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${filter === st ? 'bg-slate-800 text-white border border-slate-700 shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}>
                      {st}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left table-auto border-collapse">
                  <thead className="bg-slate-900/60 text-[10px] text-slate-500 uppercase font-black tracking-widest">
                    <tr>
                      <th className="px-8 py-5">Data</th>
                      <th className="px-8 py-5">Mercado / Ativo</th>
                      <th className="px-8 py-5 text-center">Value Analysis</th>
                      <th className="px-8 py-5 text-center">Psique</th>
                      <th className="px-8 py-5 text-right">Profit</th>
                      <th className="px-8 py-5 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {bankroll.operations.filter(o => filter === 'ALL' || o.status === filter).map(op => (
                      <tr key={op.id} className="hover:bg-slate-800/20 transition group">
                        <td className="px-8 py-5 text-slate-500 font-mono text-[11px] whitespace-nowrap">{new Date(op.date).toLocaleDateString()}</td>
                        <td className="px-8 py-5">
                          <div className="flex flex-col">
                             <span className="font-black text-slate-200 uppercase tracking-tighter text-sm whitespace-nowrap">{op.description}</span>
                             <span className="text-[9px] text-cyan-500 font-black uppercase tracking-widest mt-0.5">@{op.category} · ODD {op.odd.toFixed(2)}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-center">
                           <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${op.isPositiveEV ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' : 'text-slate-500 border-slate-800 bg-slate-900'}`}>
                             {op.isPositiveEV ? '+EV OK' : 'LOW VAL'}
                           </span>
                        </td>
                        <td className="px-8 py-5 text-center">
                           <span className="text-[10px] font-black text-slate-400 bg-slate-950 px-3 py-1 rounded-full uppercase tracking-tighter border border-slate-800">{op.sentiment}</span>
                        </td>
                        <td className={`px-8 py-5 text-right font-black italic text-base whitespace-nowrap ${op.status === 'GREEN' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {op.status === 'GREEN' ? '+' : ''} R$ {op.profitLoss.toFixed(2)}
                        </td>
                        <td className="px-8 py-5 text-center">
                           <button onClick={() => openEdit(op)} className="p-2 text-slate-500 hover:text-cyan-400 transition-colors bg-slate-950/40 rounded-lg border border-slate-800">
                             <Edit2 size={14}/>
                           </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            {/* INSIGHTS */}
            <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl flex flex-col gap-8">
               <h3 className="font-black text-cyan-400 uppercase text-[10px] tracking-[0.4em] flex items-center gap-3 italic">
                 <BarChart3 size={18}/> Market Insights
               </h3>
               <div className="space-y-8">
                  <div className="group">
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2 group-hover:text-emerald-400 transition-colors">
                      <Trophy size={14} className="text-emerald-500"/> Alpha Sector (Top)
                    </p>
                    {stats.bestCategory ? (
                      <div className="bg-slate-950/40 p-5 rounded-2xl border-l-4 border-emerald-500 flex justify-between items-center transition-all hover:bg-slate-800/40">
                        <div className="flex flex-col">
                          <span className="font-black text-slate-200 uppercase text-xs tracking-tight">{stats.bestCategory.name}</span>
                          <span className="text-[9px] text-slate-500 font-bold uppercase mt-1">ROI {stats.bestCategory.roi.toFixed(1)}%</span>
                        </div>
                        <div className="text-right text-emerald-400 font-black text-sm">+R$ {stats.bestCategory.profit.toFixed(2)}</div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-700 italic px-2">Análise pendente.</p>
                    )}
                  </div>
                  <div className="group">
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2 group-hover:text-rose-400 transition-colors">
                      <Skull size={14} className="text-rose-500"/> Risk Sector (Loss)
                    </p>
                    {stats.worstCategory && stats.worstCategory.profit < 0 ? (
                      <div className="bg-slate-950/40 p-5 rounded-2xl border-l-4 border-rose-500 flex justify-between items-center transition-all hover:bg-slate-800/40">
                        <div className="flex flex-col">
                          <span className="font-black text-slate-200 uppercase text-xs tracking-tight">{stats.worstCategory.name}</span>
                          <span className="text-[9px] text-slate-500 font-bold uppercase mt-1">ROI {stats.worstCategory.roi.toFixed(1)}%</span>
                        </div>
                        <div className="text-right text-rose-500 font-black text-sm">R$ {stats.worstCategory.profit.toFixed(2)}</div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-700 italic px-2">Performance estável.</p>
                    )}
                  </div>
               </div>
            </div>

            {/* MENTOR IA */}
            <div className={`bg-gradient-to-br border rounded-[2.5rem] p-8 space-y-8 relative overflow-hidden group min-h-[300px] flex flex-col justify-between transition-all duration-700 ${stats.isStopLossAtingido ? 'from-rose-950/20 to-slate-950 border-rose-500/30' : 'from-indigo-900/10 to-slate-950 border-indigo-500/20'}`}>
               <div className="absolute -top-10 -right-10 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                 {stats.isStopLossAtingido ? <Ghost size={180}/> : <BrainCircuit size={180}/>}
               </div>
               <div className="space-y-6">
                 <h3 className={`font-black uppercase text-[10px] tracking-[0.4em] flex items-center gap-3 italic relative z-10 ${stats.isStopLossAtingido ? 'text-rose-400' : 'text-indigo-400'}`}>
                   {stats.isStopLossAtingido ? <ShieldAlert size={18}/> : <BrainCircuit size={18}/>} Mentor IA {stats.isStopLossAtingido && " (EMERGÊNCIA)"}
                 </h3>
                 <p className="text-sm text-slate-300 leading-relaxed italic font-medium relative z-10 border-l-2 border-indigo-500/30 pl-4 py-1">
                   {aiAnalysis || "Solicite uma auditoria institucional para correlacionar seu Drawdown com seu pior mercado."}
                 </p>
               </div>
               <button 
                onClick={requestAiAnalysis} 
                disabled={isAnalyzing}
                className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition border shadow-lg disabled:opacity-50 relative z-10 ${stats.isStopLossAtingido ? 'bg-rose-600/10 text-rose-400 border-rose-500/20 hover:bg-rose-600/20' : 'bg-indigo-600/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-600/20'}`}
               >
                 {isAnalyzing ? "AUDITANDO VETORES..." : "SOLICITAR MENTORIA PRO"}
               </button>
            </div>
          </div>
        </div>
      </div>

      {/* INTERVENTION MODAL */}
      {showStopWarning && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-xl flex items-center justify-center p-4 z-[100]">
          <div className="bg-slate-900 border-2 border-rose-500/50 rounded-[3rem] p-10 max-w-lg w-full space-y-8 shadow-[0_0_50px_rgba(244,63,94,0.3)] relative overflow-hidden animate-in zoom-in duration-300">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="h-20 w-20 bg-rose-500/10 rounded-full flex items-center justify-center animate-pulse border border-rose-500/20">
                <AlertTriangle size={48} className="text-rose-500 animate-bounce" />
              </div>
              <div className="space-y-2">
                <h2 className="text-4xl font-black uppercase tracking-tighter text-rose-500 italic">Intervenção de Risco</h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.2em]">O limite de Stop Loss diário foi atingido</p>
              </div>
              <p className="text-slate-300 text-sm leading-relaxed font-medium bg-slate-950/50 p-6 rounded-2xl italic border border-slate-800">
                Detectamos que seu prejuízo ultrapassou o limite de segurança. Continuar operando nestas condições aumenta o risco emocional.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <button 
                onClick={() => { setShowStopWarning(false); setPendingOp(null); setIsOpModalOpen(false); }}
                className="w-full bg-rose-600 hover:bg-rose-500 text-white py-6 rounded-2xl font-black uppercase tracking-[0.4em] text-sm transition-all shadow-xl active:scale-95"
              >
                Encerrar por Hoje
              </button>
              <button 
                onClick={() => { if(pendingOp) executeAddOperation(pendingOp); }}
                className="w-full bg-slate-800/50 hover:bg-slate-800 text-rose-400/60 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.3em] transition-all border border-slate-700/50"
              >
                Ignorar Gestão e Assumir Risco
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OPERATION MODAL (ADD/EDIT) */}
      {isOpModalOpen && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-2xl flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddOperation} className="bg-slate-900 border border-slate-800 rounded-[3rem] p-10 max-w-lg w-full space-y-8 shadow-2xl relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-full h-1 ${stats.isStopLossAtingido && !editingOp ? 'bg-rose-500' : 'bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500'}`}></div>
            <button type="button" onClick={() => { setIsOpModalOpen(false); setEditingOp(null); }} className="absolute top-8 right-8 text-slate-500 hover:text-white transition-colors"><X size={24}/></button>
            <div className="space-y-2">
              <h2 className={`text-3xl font-black uppercase tracking-tighter italic ${stats.isStopLossAtingido && !editingOp ? 'text-rose-500' : 'text-emerald-400'}`}>
                {editingOp ? 'Editar Ordem' : 'Novo Registro'}
              </h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Protocolo de Entrada</p>
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-6">
                  <input name="units" type="text" inputMode="decimal" required value={previewUnits} onChange={(e) => setPreviewUnits(e.target.value)}
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black text-emerald-400 outline-none focus:ring-2 ring-emerald-500/20 text-xl font-mono" placeholder="Unidades" />
                  <input name="odd" type="text" inputMode="decimal" required value={previewOdd} onChange={(e) => setPreviewOdd(e.target.value)}
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black text-cyan-400 outline-none focus:ring-2 ring-cyan-500/20 text-xl font-mono" placeholder="Odd" />
                </div>
                {/* Stake Preview Real-time */}
                <div className="flex justify-between px-2 text-[10px] font-black uppercase tracking-widest">
                  <span className="text-slate-500">Valor da Stake:</span>
                  <span className="text-emerald-400">R$ {currentStakeValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              {/* Match Date Input */}
              <div className="relative group">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-400 transition-colors pointer-events-none">
                  <Calendar size={18} />
                </div>
                <input 
                  name="matchDate" 
                  type="date" 
                  required 
                  value={previewDate} 
                  onChange={(e) => setPreviewDate(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl pl-14 pr-5 py-4 font-black text-slate-300 outline-none focus:ring-2 ring-indigo-500/20 text-sm uppercase" 
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                 <input name="probability" type="number" required value={previewProb} onChange={(e) => setPreviewProb(e.target.value)}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black text-indigo-400 outline-none text-xl" placeholder="Confiança %" />
                  <select name="sentiment" defaultValue={editingOp?.sentiment || "Calmo"} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black text-slate-300 outline-none">
                    <option value="Calmo">Calmo</option>
                    <option value="Ansioso">Ansioso</option>
                    <option value="Raiva">Raiva</option>
                    <option value="Excesso de Confiança">Excesso de Confiança</option>
                  </select>
              </div>
              <div className="grid grid-cols-2 gap-6">
                 <input name="description" required defaultValue={editingOp?.description} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-bold outline-none uppercase text-xs" placeholder="Evento" />
                 <input name="category" required defaultValue={editingOp?.category} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-bold outline-none uppercase text-xs" placeholder="Mercado (Ex: Cantos)" />
              </div>
              <select name="status" defaultValue={editingOp?.status || "GREEN"} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black outline-none appearance-none text-center tracking-widest uppercase text-xs">
                 <option value="GREEN" className="text-emerald-500">VITÓRIA (GREEN)</option>
                 <option value="RED" className="text-rose-500">DERROTA (RED)</option>
                 <option value="PENDING">PENDENTE (LIVE)</option>
              </select>
            </div>
            <button type="submit" className={`w-full py-6 rounded-2xl font-black uppercase tracking-[0.4em] text-sm transition-all shadow-2xl active:scale-95 ${stats.isStopLossAtingido && !editingOp ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
              {editingOp ? 'Confirmar Alteração' : 'Executar Ordem'}
            </button>
          </form>
        </div>
      )}

      {/* CONFIG MODAL */}
      {isConfigOpen && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-2xl flex items-center justify-center p-4 z-50">
          <form onSubmit={updateConfig} className="bg-slate-900 border border-slate-800 rounded-[3rem] p-10 max-w-md w-full space-y-8 relative shadow-2xl">
            <button type="button" onClick={() => setIsConfigOpen(false)} className="absolute top-8 right-8 text-slate-500 hover:text-white"><X size={24}/></button>
            <h2 className="text-3xl font-black uppercase text-cyan-400 italic">Parâmetros</h2>
            <div className="space-y-6">
                <input name="initial" type="text" inputMode="decimal" className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-5 font-black outline-none text-2xl text-white font-mono" defaultValue={bankroll.initialBalance} placeholder="Capital Inicial" />
                <div className="grid grid-cols-2 gap-6">
                  <input name="risk" type="text" inputMode="decimal" className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black text-emerald-400 outline-none" defaultValue={bankroll.unitValuePercent} placeholder="Risco %" />
                  <input name="goal" type="text" inputMode="decimal" className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black text-amber-500 outline-none" defaultValue={bankroll.dailyGoalPercent} placeholder="Meta %" />
                </div>
            </div>
            <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 py-6 rounded-2xl font-black uppercase text-sm shadow-xl active:scale-95 transition-all">Efetivar Estratégia</button>
          </form>
        </div>
      )}

      {/* TRANSACTION MODAL */}
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
            <h2 className="text-3xl font-black uppercase text-white italic">Caixa Operacional</h2>
            <div className="space-y-6">
              <select name="type" className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 font-black outline-none appearance-none text-xs uppercase tracking-widest">
                <option value="DEPOSIT">APORTE (IN)</option>
                <option value="WITHDRAWAL">SAQUE (OUT)</option>
              </select>
              <input name="amount" type="text" inputMode="decimal" required className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-6 font-black text-white text-3xl outline-none font-mono" placeholder="0,00" />
              <input name="description" required className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 font-bold outline-none italic" placeholder="Motivo" />
            </div>
            <button type="submit" className="w-full bg-white text-slate-950 hover:bg-slate-200 py-6 rounded-2xl font-black uppercase text-sm transition-all shadow-xl active:scale-95">Registrar Fluxo</button>
          </form>
        </div>
      )}
    </div>
  );
};

export default App;
