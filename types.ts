
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
  stakeUnits: number; // units (ex: 0.5, 1.0, 2.0)
  stakeAmount: number; // Valor absoluto calculado no momento da entrada
  odd: number;
  profitLoss: number; // 0 se PENDING, (Stake * (Odd-1)) se GREEN, (-Stake) se RED
  category: string;
}

export interface BankrollState {
  initialBalance: number;
  unitValuePercent: number; // Configuração de risco (ex: 1 para 1%)
  transactions: Transaction[];
  operations: Operation[];
}
