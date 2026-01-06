
export enum OperationStatus {
  GREEN = 'GREEN',
  RED = 'RED',
  REFUND = 'REFUND',
  PENDING = 'PENDING'
}

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL'
}

export type SentimentType = 'Calmo' | 'Ansioso' | 'Raiva' | 'Excesso de Confiança';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  date: number;
  description: string;
}

export interface Operation {
  id: string;
  date: number;
  description: string;
  status: OperationStatus;
  stakeUnits: number;
  stakeAmount: number;
  odd: number;
  profitLoss: number;
  category: string;
  // Novos campos de inteligência
  sentiment: SentimentType;
  estimatedProbability: number; // 0-100
  isPositiveEV: boolean;
}

export interface BankrollState {
  initialBalance: number;
  unitValuePercent: number;
  transactions: Transaction[];
  operations: Operation[];
}
