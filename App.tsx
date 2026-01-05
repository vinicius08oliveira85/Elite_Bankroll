import React, { useState, useMemo, useEffect } from 'react';
import { 
  PlusCircle, 
  TrendingUp, 
  History, 
  AlertTriangle,
  BrainCircuit,
  Trash2,
  X,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Settings,
  Wallet
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  ComposedChart
} from 'recharts';
import { 
  OperationStatus, 
  TransactionType, 
  BankrollState, 
  Operation, 
  Transaction 
} from './types';
import { GoogleGenAI } from "@google/genai";

const STORAGE_KEY = 'elite_bankroll_system_v3';

// Extensão do estado para incluir metas
interface ExtendedBankrollState extends BankrollState {
  dailyGoalPercent: number; // Meta diária de crescimento (ex: 3 para 3%)
}

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
      const parsed = JSON.parse(saved);
      return { ...defaultState, ...parsed };
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bankroll));
  }, [bankroll]);

  // 🧮 Lógica de Cálculo (Core Engine)
  const stats = useMemo(() => {
    const totalDeposits = (bankroll.transactions || [])
      .filter(t => t.type === TransactionType.DEPOSIT)
      .reduce((acc, t) => acc + t.amount, 0) + (bankroll.initialBalance || 0);
    
    const totalWithdrawals = (bankroll.transactions || [])
      .filter(t => t.type === TransactionType.WITHDRAWAL)
      .reduce((acc, t) => acc + t.amount, 0);

    const netInvestment = totalDeposits - totalWithdrawals;
    
    const finishedOps = (bankroll.operations || []).filter(o => o.status !== OperationStatus.PENDING);
    const totalProfit = finishedOps.reduce((acc, o) => acc + o.profitLoss, 0);
    const totalStake = finishedOps.reduce((acc, o) => acc + o.stakeAmount, 0);
    
    const currentBalance = netInvestment + totalProfit;
    const unitValue = (currentBalance * bankroll.unitValuePercent) / 100;
    
    const roi = totalStake > 0 ? (totalProfit / totalStake) * 100 : 0;
    const yieldValue = netInvestment > 0 ? (totalProfit / netInvestment) * 100 : 0;
    
    const reds = finishedOps.filter(o => o.status === OperationStatus.RED).length;
    const greens = finishedOps.filter(o => o.status === OperationStatus.GREEN).length;
    const refunds = finishedOps.filter(o => o.status === OperationStatus.REFUND).length;
    const winRate = (greens + reds) > 0 ? (greens / (greens + reds)) * 100 : 0;

    return {
      currentBalance,
      netInvestment,
      totalProfit,
      roi,
      yieldValue,
      winRate,
      greens,
      reds,
      refunds,
      unitValue: unitValue > 0 ? unitValue : 0
    };
  }, [bankroll]);

  // 🚀 Curva de Performance vs Meta
  const chartData = useMemo(() => {
    let cumulative = bankroll.initialBalance;
    const data = [{ 
      name: 'Início', 
      balance: cumulative, 
      goal: cumulative 
    }];
    
    const timeline = [
      ...(bankroll.operations || []).map(o => ({ date: o.date, value: o.profitLoss })),
      ...(bankroll.transactions || []).map(t => ({ 
        date: t.date, 
        value: t.type === TransactionType.DEPOSIT ? t.amount : -t.amount
      }))
    ].sort((a, b) => a.date - b.date);

    let goalCumulative = bankroll.initialBalance;
    const dailyGrowthFactor = 1 + (bankroll.dailyGoalPercent / 100);

    timeline.forEach((item) => {
      cumulative += item.value;
      goalCumulative *= dailyGrowthFactor; 
      
      data.push({ 
        name: new Date(item.date).toLocaleDateString(), 
        balance: Number(cumulative.toFixed(2)),
        goal: Number(goalCumulative.toFixed(2))
      });
    });

    return data;
  }, [bankroll]);

  const handleAddOperation = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const units = Number(fd.get('units'));
    const odd = Number(fd.get('odd'));
    const status = fd.get('status') as OperationStatus;
    const stakeAmount = units * stats.unitValue;
    
    if (stakeAmount > stats.currentBalance && stats.currentBalance > 0) {
      alert("⚠️ Gestão de Risco: Stake excede o saldo disponível.");
      return;
    }

    let profitLoss = 0;
    if (status === OperationStatus.GREEN) profitLoss = stakeAmount * (odd - 1);
    else if (status === OperationStatus.RED) profitLoss = -stakeAmount;
    else if (status === OperationStatus.REFUND) profitLoss = 0;

    const newOp: Operation = {
      id: crypto.randomUUID(),
      date: Date.now(),
      description: fd.get('description') as string,
      status,
      stakeUnits: units,
      stakeAmount,
      odd,
      profitLoss,
      category: fd.get('category') as string
    };

    setBankroll(prev => ({
      ...prev,
      operations: [newOp, ...(prev.operations || [])]
    }));
    setIsOpModalOpen(false);
  };

  const handleAddTransaction = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get('amount'));
    const type = fd.get('type') as TransactionType;

    if (type === TransactionType.WITHDRAWAL && stats.currentBalance < amount) {
      alert("❌ Saldo insuficiente para saque.");
      return;
    }

    const newTx: Transaction = {
      id: crypto.randomUUID(),
      type,
      amount,
      date: Date.now(),
      description: fd.get('description') as string
    };

    setBankroll(prev => ({
      ...prev,
      transactions: [newTx, ...(prev.transactions || [])]
    }));
    setIsTxModalOpen(false);
  };

  const deleteOperation = (id: string) => {
    if (window.confirm("Confirmar exclusão definitiva?")) {
      setBankroll(prev => ({
        ...prev,
        operations: prev.operations.filter(o => o.id !== id)
      }));
    }
  };

  const updateConfig = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBankroll(prev => ({
      ...prev,
      initialBalance: Number(fd.get('initial')),
      unitValuePercent: Number(fd.get('risk')),
      dailyGoalPercent: Number(fd.get('goal'))
    }));
    setIsConfigOpen(false);
  };

  const runAiAnalysis = async () => {
    if (bankroll.operations.length < 3) {
      setAiAnalysis("Registre ao menos 3 operações para análise.");
      return;
    }
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Analise os seguintes dados de banca de apostas:
      - Saldo: R$${stats.currentBalance.toFixed(2)}
      - ROI: ${stats.roi.toFixed(2)}%
      - WinRate: ${stats.winRate.toFixed(2)}%
      - Meta Diária: ${bankroll.dailyGoalPercent}%
      Forneça 3 dicas curtas e técnicas de gestão de risco em português.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      setAiAnalysis(response.text || "Sem insights no momento.");
    } catch (e) {
      setAiAnalysis("Erro na conexão com Gemini AI.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const filteredOperations = useMemo(() => 
    filter === 'ALL' ? bankroll.operations : (bankroll.operations || []).filter(o => o.status === filter)
  , [bankroll.operations, filter]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Target size={28} className="text-slate-950" />
            </div>
            <div>
              <h1 className="text-3xl font-black bg-gradient-to-r from-emerald-400 to-cyan-500 bg-clip-text text-transparent uppercase tracking-tighter">
                Elite Bankroll
              </h1>
              <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">Risk Architect v3.1</p>
            </div>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button onClick={() => setIsConfigOpen(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 px-4 py-2.5 rounded-xl font-bold transition border border-slate-800">
              <Settings size={18} />
            </button>
            <button onClick={() => setIsTxModalOpen(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 px-4 py-2.5 rounded-xl font-bold transition border border-slate-800">
              <Wallet size={18} /> Caixa
            </button>
            <button onClick={() => setIsOpModalOpen(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-6 py-2.5 rounded-xl font-black shadow-lg shadow-emerald-900/20 transition uppercase text-sm tracking-widest">
              <Plus size={20} /> Entrada
            </button>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Saldo Atual', val: `R$ ${stats.currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, sub: `1un = R$ ${stats.unitValue.toFixed(2)}`, color: 'text-white' },
            { label: 'P/L Líquido', val: `R$ ${stats.totalProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, sub: 'Acumulado', color: stats.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400' },
            { label: 'ROI (%)', val: `${stats.roi.toFixed(2)}%`, sub: `Meta: ${bankroll.dailyGoalPercent}%`, color: stats.roi >= 0 ? 'text-emerald-400' : 'text-rose-400' },
            { label: 'WinRate', val: `${stats.winRate.toFixed(1)}%`, sub: `${stats.greens}G / ${stats.reds}R`, color: 'text-cyan-400' },
          ].map((s, i) => (
            <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 shadow-xl">
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-1">{s.label}</p>
              <h2 className={`text-2xl font-black ${s.color}`}>{s.val}</h2>
              <p className="text-slate-500 text-xs mt-2 font-bold uppercase tracking-widest">{s.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Chart */}
            <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-8 h-[400px]">
              <h3 className="font-black uppercase text-xs tracking-[0.3em] text-slate-500 mb-8 flex items-center gap-3">Equity Curve</h3>
              <ResponsiveContainer width="100%" height="80%">
                <ComposedChart data={chartData}>
                  <defs>
                    <linearGradient id="colorBal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.2} />
                  <XAxis dataKey="name" stroke="#475569" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={10} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px' }} />
                  <Area type="monotone" dataKey="balance" stroke="#10b981" fill="url(#colorBal)" strokeWidth={3} />
                  <Line type="monotone" dataKey="goal" stroke="#f59e0b" strokeDasharray="5 5" dot={false} strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Table */}
            <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl overflow-hidden">
              <div className="p-8 border-b border-slate-800/60 flex justify-between items-center bg-slate-900/20">
                <h3 className="font-black uppercase text-xs tracking-[0.3em] text-slate-500">Histórico</h3>
                <div className="flex gap-2">
                  {['ALL', 'GREEN', 'RED', 'REFUND'].map(st => (
                    <button key={st} onClick={() => setFilter(st as any)} className={`px-3 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase transition ${filter === st ? 'bg-slate-800 text-white' : 'text-slate-600'}`}>
                      {st}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-950/20 text-[10px] text-slate-500 uppercase font-black tracking-widest">
                    <tr>
                      <th className="px-8 py-5 text-left">Data</th>
                      <th className="px-8 py-5 text-left">Evento</th>
                      <th className="px-8 py-5 text-center">Odd</th>
                      <th className="px-8 py-5 text-right">P/L</th>
                      <th className="px-8 py-5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 text-sm">
                    {filteredOperations.map(op => (
                      <tr key={op.id} className="hover:bg-slate-800/20 transition">
                        <td className="px-8 py-5 text-slate-500 font-mono text-xs">{new Date(op.date).toLocaleDateString()}</td>
                        <td className="px-8 py-5 font-bold">{op.description}</td>
                        <td className="px-8 py-5 text-center text-slate-400">{op.odd.toFixed(2)}</td>
                        <td className={`px-8 py-5 text-right font-black ${op.status === 'GREEN' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {op.profitLoss.toFixed(2)}
                        </td>
                        <td className="px-8 py-5 text-right">
                          <button onClick={() => deleteOperation(op.id)} className="text-slate-700 hover:text-rose-500"><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-3xl p-8 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:opacity-10 transition">
                <BrainCircuit size={100} />
              </div>
              <h3 className="font-black text-indigo-400 uppercase text-[10px] tracking-[0.3em] mb-6 flex items-center gap-3">
                <BrainCircuit size={18} /> IA Strategy
              </h3>
              <div className="min-h-[120px] mb-8">
                {isAnalyzing ? (
                  <div className="space-y-2 animate-pulse"><div className="h-2 bg-indigo-500/20 rounded w-full"></div><div className="h-2 bg-indigo-500/20 rounded w-5/6"></div></div>
                ) : (
                  <p className="text-sm text-slate-300 italic">{aiAnalysis || "Clique para analisar seu desempenho."}</p>
                )}
              </div>
              <button onClick={runAiAnalysis} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition">Analisar Agora</button>
            </div>

            {stats.currentBalance < stats.netInvestment * 0.8 && stats.netInvestment > 0 && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-3xl p-6 flex gap-4">
                <AlertTriangle className="text-rose-500 shrink-0" size={24} />
                <p className="text-slate-400 text-xs font-bold">Drawdown alto. Considere reduzir a stake.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {isOpModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddOperation} className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 max-w-md w-full space-y-6 relative">
            <button type="button" onClick={() => setIsOpModalOpen(false)} className="absolute top-6 right-6 text-slate-500"><X size={24}/></button>
            <h2 className="text-2xl font-black uppercase">Registrar Entrada</h2>
            <div className="grid grid-cols-2 gap-4">
              <input name="units" type="number" step="0.25" required className="w-full bg-slate-800 rounded-xl px-4 py-3 font-bold outline-none" defaultValue="1" placeholder="Unidades" />
              <input name="odd" type="number" step="0.01" required className="w-full bg-slate-800 rounded-xl px-4 py-3 font-bold outline-none" placeholder="Odd (ex: 1.90)" />
            </div>
            <input name="description" required className="w-full bg-slate-800 rounded-xl px-4 py-3 font-bold outline-none" placeholder="Descrição do evento" />
            <div className="grid grid-cols-2 gap-4">
              <select name="status" className="w-full bg-slate-800 rounded-xl px-4 py-3 font-bold outline-none">
                <option value="GREEN">WIN (GREEN)</option>
                <option value="RED">LOSS (RED)</option>
                <option value="REFUND">VOID</option>
              </select>
              <input name="category" className="w-full bg-slate-800 rounded-xl px-4 py-3 font-bold outline-none" defaultValue="Futebol" />
            </div>
            <button type="submit" className="w-full bg-emerald-600 py-4 rounded-xl font-black uppercase tracking-widest transition">Confirmar Entrada</button>
          </form>
        </div>
      )}

      {isTxModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddTransaction} className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 max-w-md w-full space-y-6 relative">
            <button type="button" onClick={() => setIsTxModalOpen(false)} className="absolute top-6 right-6 text-slate-500"><X size={24}/></button>
            <h2 className="text-2xl font-black uppercase tracking-tighter">Caixa</h2>
            <select name="type" className="w-full bg-slate-800 rounded-xl px-4 py-4 font-bold outline-none">
              <option value="DEPOSIT">DEPÓSITO</option>
              <option value="WITHDRAWAL">SAQUE</option>
            </select>
            <input name="amount" type="number" step="0.01" required className="w-full bg-slate-800 rounded-xl px-4 py-4 font-bold text-white text-xl outline-none" placeholder="Valor R$ 0,00" />
            <input name="description" required className="w-full bg-slate-800 rounded-xl px-4 py-4 font-bold outline-none" placeholder="Justificativa" />
            <button type="submit" className="w-full bg-white text-slate-950 py-4 rounded-xl font-black uppercase transition">Confirmar</button>
          </form>
        </div>
      )}

      {isConfigOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <form onSubmit={updateConfig} className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 max-w-md w-full space-y-6 relative">
            <button type="button" onClick={() => setIsConfigOpen(false)} className="absolute top-6 right-6 text-slate-500"><X size={24}/></button>
            <h2 className="text-2xl font-black uppercase text-cyan-400">Settings</h2>
            <input name="initial" type="number" step="0.01" className="w-full bg-slate-800 rounded-xl px-4 py-3 font-bold outline-none" defaultValue={bankroll.initialBalance} placeholder="Saldo Inicial" />
            <div className="grid grid-cols-2 gap-4">
              <input name="risk" type="number" step="0.1" className="w-full bg-slate-800 rounded-xl px-4 py-3 font-bold outline-none" defaultValue={bankroll.unitValuePercent} placeholder="Unidade %" />
              <input name="goal" type="number" step="0.1" className="w-full bg-slate-800 rounded-xl px-4 py-3 font-bold outline-none" defaultValue={bankroll.dailyGoalPercent} placeholder="Meta %" />
            </div>
            <button type="submit" className="w-full bg-cyan-600 py-4 rounded-xl font-black uppercase tracking-widest transition">Salvar</button>
          </form>
        </div>
      )}
    </div>
  );
};

export default App;