
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
  Zap,
  BarChart3,
  Download,
  Trophy,
  Skull,
  ShieldCheck
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Area,
  Line,
  ComposedChart,
  BarChart,
  Bar,
  Cell
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
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [filter, setFilter] = useState<OperationStatus | 'ALL'>('ALL');
  
  // Modal UI Helpers
  const [previewUnits, setPreviewUnits] = useState("1.00");
  const [previewOdd, setPreviewOdd] = useState("");
  const [previewProb, setPreviewProb] = useState("50");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bankroll));
  }, [bankroll]);

  // FUNÇÃO DE EXPORTAÇÃO (AUDITORIA)
  const handleExportBackup = () => {
    const data = {
      ...bankroll,
      version: "4.2.PRO",
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria_banca_elite_${new Date().getTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // LÓGICA DE MÉTRICAS (stats useMemo)
  const stats = useMemo(() => {
    const initial = bankroll.initialBalance || 0;
    const allOps = bankroll.operations || [];
    const allTxs = bankroll.transactions || [];
    
    let runningBalance = initial;
    let peakBalance = initial;
    let maxDDValue = 0;

    const timeline = [
      ...allOps.map(o => ({ date: o.date, value: o.profitLoss })),
      ...allTxs.map(t => ({ 
        date: t.date, 
        value: t.type === TransactionType.DEPOSIT ? t.amount : -t.amount 
      }))
    ].sort((a, b) => a.date - b.date);

    timeline.forEach(item => {
      runningBalance += item.value;
      if (runningBalance > peakBalance) peakBalance = runningBalance;
      
      const currentDD = peakBalance > 0 ? ((peakBalance - runningBalance) / peakBalance) * 100 : 0;
      if (currentDD > maxDDValue) maxDDValue = currentDD;
    });

    const finishedOps = allOps.filter(o => o.status !== OperationStatus.PENDING);
    const totalProfit = finishedOps.reduce((acc, o) => acc + o.profitLoss, 0);
    const totalStake = finishedOps.reduce((acc, o) => acc + o.stakeAmount, 0);
    const currentBalance = runningBalance;
    const unitValue = (currentBalance * bankroll.unitValuePercent) / 100;
    
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

    const bestCategory = categoryStats[0] || null;
    const worstCategory = [...categoryStats].sort((a, b) => a.profit - b.profit)[0] || null;

    const sentimentMap: Record<SentimentType, number> = {
      'Calmo': 0, 'Ansioso': 0, 'Raiva': 0, 'Excesso de Confiança': 0
    };
    allOps.forEach(op => { sentimentMap[op.sentiment] = (sentimentMap[op.sentiment] || 0) + op.profitLoss; });

    return {
      currentBalance,
      totalProfit,
      roi,
      winRate,
      unitValue: unitValue > 0 ? unitValue : 0,
      maxDrawdown: maxDDValue,
      bestCategory,
      worstCategory,
      categoryStats,
      sentimentData: Object.entries(sentimentMap).map(([name, value]) => ({ name, value })),
      evRate: allOps.length > 0 ? (allOps.filter(o => o.isPositiveEV).length / allOps.length) * 100 : 0
    };
  }, [bankroll]);

  const handleAddOperation = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const units = parseLocaleNumber(fd.get('units') as string);
    const odd = parseLocaleNumber(fd.get('odd') as string);
    const prob = parseLocaleNumber(fd.get('probability') as string);
    const status = fd.get('status') as OperationStatus;
    const sentiment = fd.get('sentiment') as SentimentType;
    const category = fd.get('category') as string;
    
    const stakeAmount = units * (stats.unitValue || 1);
    
    let profitLoss = 0;
    if (status === OperationStatus.GREEN) profitLoss = stakeAmount * (odd - 1);
    else if (status === OperationStatus.RED) profitLoss = -stakeAmount;

    const newOp: Operation = {
      id: crypto.randomUUID(),
      date: Date.now(),
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

    setBankroll(prev => ({ ...prev, operations: [newOp, ...(prev.operations || [])] }));
    setIsOpModalOpen(false);
  };

  const updateConfig = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBankroll(prev => ({
      ...prev,
      initialBalance: parseLocaleNumber(fd.get('initial') as string),
      unitValuePercent: parseLocaleNumber(fd.get('risk') as string),
      dailyGoalPercent: parseLocaleNumber(fd.get('goal') as string),
    }));
    setIsConfigOpen(false);
  };

  const chartData = useMemo(() => {
    let cumulative = bankroll.initialBalance;
    const data = [{ name: 'Início', balance: cumulative, goal: cumulative }];
    const timeline = [
      ...(bankroll.operations || []).map(o => ({ date: o.date, value: o.profitLoss })),
      ...(bankroll.transactions || []).map(t => ({ date: t.date, value: t.type === TransactionType.DEPOSIT ? t.amount : -t.amount }))
    ].sort((a, b) => a.date - b.date);

    let goalCumulative = bankroll.initialBalance;
    const dailyFactor = 1 + (bankroll.dailyGoalPercent / 100);

    timeline.forEach((item) => {
      cumulative += item.value;
      goalCumulative *= dailyFactor; 
      data.push({ 
        name: new Date(item.date).toLocaleDateString(), 
        balance: Number(cumulative.toFixed(2)),
        goal: Number(goalCumulative.toFixed(2))
      });
    });
    return data;
  }, [bankroll]);

  const requestAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Você é um Mentor Financeiro Institucional focado em apostas esportivas e trading de alto risco.
        Contexto Auditado Atual:
        - Saldo: R$${stats.currentBalance.toFixed(2)}
        - Drawdown Máximo: ${stats.maxDrawdown.toFixed(1)}%
        - ROI Global: ${stats.roi.toFixed(1)}%
        - Melhor Mercado: ${stats.bestCategory?.name || 'N/A'}
        - Pior Mercado: ${stats.worstCategory?.name || 'N/A'} (Profit: ${stats.worstCategory?.profit.toFixed(2)})
        
        Sua missão é dar um conselho direto e agressivo. Se o Drawdown estiver acima de 15%, o tom deve ser de alerta crítico. Foque em como estancar perdas no pior mercado e proteger o capital principal. Máximo 2 frases.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });

      setAiAnalysis(response.text || "Análise indisponível no momento.");
    } catch (error) {
      console.error("AI Analysis Error:", error);
      setAiAnalysis("Erro na auditoria de rede. Verifique seu capital ou tente novamente mais tarde.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-4 md:p-8 font-sans selection:bg-emerald-500/30">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-emerald-500/20 animate-pulse-slow">
              <ShieldCheck size={32} className="text-slate-950" />
            </div>
            <div>
              <h1 className="text-4xl font-black bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent uppercase tracking-tighter italic">Elite Architect</h1>
              <p className="text-slate-500 font-bold text-[10px] uppercase tracking-[0.3em]">Institutional Risk Controller v4.2</p>
            </div>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button onClick={handleExportBackup} title="Exportar Auditoria JSON" className="flex items-center justify-center gap-2 p-3 bg-slate-900 rounded-2xl border border-slate-800 hover:bg-slate-800 transition shadow-lg text-slate-400 hover:text-emerald-400 px-4">
              <Download size={18}/> <span className="text-[10px] font-black uppercase hidden sm:block">Exportar</span>
            </button>
            <button onClick={() => setIsConfigOpen(true)} className="p-3 bg-slate-900 rounded-2xl border border-slate-800 hover:bg-slate-800 transition shadow-lg"><Settings size={20}/></button>
            <button onClick={() => setIsTxModalOpen(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-900 px-6 py-3 rounded-2xl font-black border border-slate-800 transition hover:bg-slate-800 shadow-lg font-mono text-xs uppercase"><Wallet size={18}/> Fluxo</button>
            <button onClick={() => setIsOpModalOpen(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 px-8 py-3 rounded-2xl font-black uppercase text-sm tracking-widest transition hover:bg-emerald-500 active:scale-95 shadow-xl shadow-emerald-900/40"><Plus size={24}/> Registrar</button>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-[2rem] p-6 shadow-xl backdrop-blur-md">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Patrimônio Líquido</p>
            <h2 className="text-3xl font-black text-white italic">R$ {stats.currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] font-black text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">Unit: R$ {stats.unitValue.toFixed(2)}</span>
            </div>
          </div>

          <div className={`bg-slate-900/60 border rounded-[2rem] p-6 shadow-xl backdrop-blur-md transition-all duration-500 ${
            stats.maxDrawdown > 25 ? 'border-rose-500 shadow-rose-950/20' : stats.maxDrawdown > 15 ? 'border-amber-500 shadow-amber-950/20' : 'border-slate-800'
          }`}>
            <div className="flex justify-between items-center mb-1">
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Max Drawdown</p>
              <AlertTriangle size={14} className={stats.maxDrawdown > 15 ? (stats.maxDrawdown > 25 ? 'text-rose-500 animate-pulse' : 'text-amber-500') : 'text-slate-600'} />
            </div>
            <h2 className={`text-3xl font-black italic ${
              stats.maxDrawdown > 25 ? 'text-rose-500' : stats.maxDrawdown > 15 ? 'text-amber-500' : 'text-cyan-400'
            }`}>
              -{stats.maxDrawdown.toFixed(1)}%
            </h2>
            <p className="text-slate-500 text-[10px] mt-2 font-bold uppercase">Risco de Ruína Histórico</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-[2rem] p-6 shadow-xl backdrop-blur-md">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Value Rate (+EV)</p>
            <h2 className="text-3xl font-black text-indigo-400 italic">{stats.evRate.toFixed(1)}%</h2>
            <p className="text-slate-500 text-[10px] mt-2 font-bold uppercase">Edge Matemático</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-[2rem] p-6 shadow-xl backdrop-blur-md">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">ROI Total</p>
            <h2 className={`text-3xl font-black italic ${stats.roi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{stats.roi.toFixed(2)}%</h2>
            <div className="w-full bg-slate-800 h-1 mt-4 rounded-full overflow-hidden">
               <div className="bg-emerald-500 h-full" style={{ width: `${Math.min(100, stats.winRate)}%` }}></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 h-[450px] shadow-2xl backdrop-blur-xl">
               <h3 className="font-black uppercase text-xs tracking-[0.3em] text-slate-500 mb-8 flex items-center gap-3">
                 <TrendingUp size={16} className="text-emerald-500"/> Equity Performance
               </h3>
               <ResponsiveContainer width="100%" height="85%">
                <ComposedChart data={chartData}>
                  <defs>
                    <linearGradient id="colorBal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.3} />
                  <XAxis dataKey="name" stroke="#475569" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={10} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', fontWeight: 'bold' }} />
                  <Area type="monotone" dataKey="balance" stroke="#10b981" fill="url(#colorBal)" strokeWidth={4} dot={false} />
                  <Line type="monotone" dataKey="goal" stroke="#f59e0b" strokeDasharray="6 6" dot={false} strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl backdrop-blur-xl">
              <div className="p-8 border-b border-slate-800/60 flex justify-between items-center bg-slate-900/20">
                <h3 className="font-black uppercase text-xs tracking-[0.3em] text-slate-500 italic">Audit Log</h3>
                <div className="flex gap-2">
                  {['ALL', 'GREEN', 'RED'].map(st => (
                    <button key={st} onClick={() => setFilter(st as any)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${filter === st ? 'bg-slate-800 text-white border border-slate-700 shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}>
                      {st}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto max-h-[500px] custom-scrollbar">
                <table className="w-full">
                  <thead className="sticky top-0 bg-slate-900/90 backdrop-blur-md text-[10px] text-slate-500 uppercase font-black tracking-widest z-10">
                    <tr>
                      <th className="px-8 py-5 text-left">Data</th>
                      <th className="px-8 py-5 text-left">Mercado / Ativo</th>
                      <th className="px-8 py-5 text-center">Value Anlysis</th>
                      <th className="px-8 py-5 text-center">Psique</th>
                      <th className="px-8 py-5 text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 text-sm">
                    {bankroll.operations.filter(o => filter === 'ALL' || o.status === filter).map(op => (
                      <tr key={op.id} className="hover:bg-slate-800/20 transition group">
                        <td className="px-8 py-5 text-slate-500 font-mono text-xs">{new Date(op.date).toLocaleDateString()}</td>
                        <td className="px-8 py-5">
                          <div className="flex flex-col">
                             <span className="font-black text-slate-200 uppercase tracking-tighter">{op.description}</span>
                             <span className="text-[9px] text-cyan-500 font-black uppercase tracking-widest mt-0.5">@{op.category} · ODD {op.odd.toFixed(2)}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-center">
                           {op.isPositiveEV ? 
                            <span className="text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded text-[9px] font-black tracking-widest italic border border-emerald-500/20">+EV OK</span> : 
                            <span className="text-slate-600 bg-slate-800 px-2 py-1 rounded text-[9px] font-black tracking-widest italic border border-slate-700/50">NO VAL</span>}
                        </td>
                        <td className="px-8 py-5 text-center">
                           <span className="text-[10px] font-black text-slate-400 bg-slate-950 px-3 py-1 rounded-full uppercase tracking-tighter border border-slate-800">{op.sentiment}</span>
                        </td>
                        <td className={`px-8 py-5 text-right font-black italic text-lg ${op.status === 'GREEN' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {op.status === 'GREEN' ? '+' : ''}{op.profitLoss.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl">
               <h3 className="font-black text-cyan-400 uppercase text-[10px] tracking-[0.4em] flex items-center gap-3 italic mb-8">
                 <BarChart3 size={18}/> Market Insights
               </h3>
               
               <div className="space-y-6">
                  <div>
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Trophy size={12} className="text-emerald-500"/> Alpha Sector (Top Performance)
                    </p>
                    {stats.bestCategory ? (
                      <div className="flex justify-between items-center text-xs bg-slate-950/40 p-4 rounded-2xl border-l-2 border-emerald-500 shadow-lg">
                        <div className="flex flex-col">
                          <span className="font-black text-slate-200 uppercase tracking-tighter">{stats.bestCategory.name}</span>
                          <span className="text-[9px] text-slate-500 font-bold uppercase mt-1">ROI {stats.bestCategory.roi.toFixed(1)}%</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="font-black text-emerald-400">+R$ {stats.bestCategory.profit.toFixed(2)}</span>
                          <ArrowUpRight size={14} className="text-emerald-500 mt-1" />
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-700 italic px-4">Sem dados operacionais registrados.</p>
                    )}
                  </div>

                  <div>
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Skull size={12} className="text-rose-500"/> Risk Sector (Loss Focus)
                    </p>
                    {stats.worstCategory && stats.worstCategory.profit < 0 ? (
                      <div className="flex justify-between items-center text-xs bg-slate-950/40 p-4 rounded-2xl border-l-2 border-rose-500 shadow-lg">
                        <div className="flex flex-col">
                          <span className="font-black text-slate-200 uppercase tracking-tighter">{stats.worstCategory.name}</span>
                          <span className="text-[9px] text-slate-500 font-bold uppercase mt-1">ROI {stats.worstCategory.roi.toFixed(1)}%</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="font-black text-rose-500">R$ {stats.worstCategory.profit.toFixed(2)}</span>
                          <ArrowDownRight size={14} className="text-rose-500 mt-1" />
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-700 italic px-4">Todas as categorias apresentam lucro.</p>
                    )}
                  </div>
               </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-900/10 to-slate-950 border border-indigo-500/20 rounded-[2.5rem] p-8 space-y-6 relative overflow-hidden group">
               <div className="absolute -top-10 -right-10 opacity-5 group-hover:opacity-10 transition-opacity">
                 <BrainCircuit size={150}/>
               </div>
               <h3 className="font-black text-indigo-400 uppercase text-[10px] tracking-[0.4em] flex items-center gap-3 italic">
                 <BrainCircuit size={18}/> Mentor IA (Gestão de Risco)
               </h3>
               <p className="text-sm text-slate-300 leading-relaxed italic font-medium">
                 {aiAnalysis || "Solicite uma auditoria para correlacionar seu Drawdown com seu pior mercado e estancar fugas de capital."}
               </p>
               <button 
                onClick={requestAiAnalysis} 
                disabled={isAnalyzing}
                className="w-full bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition border border-indigo-500/20 shadow-lg disabled:opacity-50"
               >
                 {isAnalyzing ? "AUDITANDO VETORES..." : "SOLICITAR MENTORIA PRO"}
               </button>
            </div>
          </div>
        </div>
      </div>

      {isOpModalOpen && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-2xl flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddOperation} className="bg-slate-900 border border-slate-800 rounded-[3rem] p-10 max-w-lg w-full space-y-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500"></div>
            <button type="button" onClick={() => setIsOpModalOpen(false)} className="absolute top-8 right-8 text-slate-500 hover:text-white transition-colors"><X size={24}/></button>
            <div className="space-y-2">
              <h2 className="text-3xl font-black uppercase tracking-tighter text-emerald-400 italic">Novo Registro</h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Protocolo de Entrada</p>
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <input name="units" type="text" inputMode="decimal" required value={previewUnits} onChange={(e) => setPreviewUnits(e.target.value)}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black text-emerald-400 outline-none focus:ring-2 ring-emerald-500/20 text-xl font-mono" placeholder="Units" />
                <input name="odd" type="text" inputMode="decimal" required value={previewOdd} onChange={(e) => setPreviewOdd(e.target.value)}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black text-cyan-400 outline-none focus:ring-2 ring-cyan-500/20 text-xl font-mono" placeholder="Odd" />
              </div>
              <div className="grid grid-cols-2 gap-6">
                 <input name="probability" type="number" required value={previewProb} onChange={(e) => setPreviewProb(e.target.value)}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black text-indigo-400 outline-none text-xl" placeholder="Confiança %" />
                  <select name="sentiment" className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black text-slate-300 outline-none">
                    <option value="Calmo">Calmo</option>
                    <option value="Ansioso">Ansioso</option>
                    <option value="Raiva">Raiva</option>
                    <option value="Excesso de Confiança">Excesso de Confiança</option>
                  </select>
              </div>
              <div className="grid grid-cols-2 gap-6">
                 <input name="description" required className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-bold outline-none uppercase text-xs" placeholder="Evento" />
                 <input name="category" required className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-bold outline-none uppercase text-xs" placeholder="Mercado (Ex: Cantos)" />
              </div>
              <select name="status" className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 font-black outline-none appearance-none text-center tracking-widest uppercase text-xs">
                 <option value="GREEN" className="text-emerald-500">LIQUIDAR COM WIN (GREEN)</option>
                 <option value="RED" className="text-rose-500">LIQUIDAR COM LOSS (RED)</option>
                 <option value="PENDING">MANTER EM ABERTO (LIVE)</option>
              </select>
            </div>
            <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 py-6 rounded-2xl font-black uppercase tracking-[0.4em] text-sm transition-all shadow-2xl active:scale-95">Executar Ordem</button>
          </form>
        </div>
      )}

      {isConfigOpen && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-2xl flex items-center justify-center p-4 z-50">
          <form onSubmit={updateConfig} className="bg-slate-900 border border-slate-800 rounded-[3rem] p-10 max-w-md w-full space-y-8 relative shadow-2xl">
            <button type="button" onClick={() => setIsConfigOpen(false)} className="absolute top-8 right-8 text-slate-500 hover:text-white"><X size={24}/></button>
            <h2 className="text-3xl font-black uppercase text-cyan-400 italic">Parametrização</h2>
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
          }} className="bg-slate-900 border border-slate-800 rounded-[3rem] p-10 max-w-md w-full space-y-8 shadow-2xl relative">
            <button type="button" onClick={() => setIsTxModalOpen(false)} className="absolute top-8 right-8 text-slate-500"><X size={24}/></button>
            <h2 className="text-3xl font-black uppercase text-white italic">Caixa Operacional</h2>
            <div className="space-y-6">
              <select name="type" className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 font-black outline-none">
                <option value="DEPOSIT">APORTE (IN)</option>
                <option value="WITHDRAWAL">SAQUE (OUT)</option>
              </select>
              <input name="amount" type="text" inputMode="decimal" required className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-6 font-black text-white text-3xl outline-none font-mono" placeholder="0,00" />
              <input name="description" required className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-6 py-4 font-bold outline-none italic" placeholder="Motivo da movimentação" />
            </div>
            <button type="submit" className="w-full bg-white text-slate-950 hover:bg-slate-200 py-6 rounded-2xl font-black uppercase text-sm transition-all shadow-xl active:scale-95">Registrar Fluxo</button>
          </form>
        </div>
      )}
    </div>
  );
};

export default App;
