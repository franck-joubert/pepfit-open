export type Parametres = (string | number | null)[];

export interface Executeur {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: Parametres): Promise<unknown>;
  getFirstAsync<T>(sql: string, params: Parametres): Promise<T | null>;
  getAllAsync<T>(sql: string, params: Parametres): Promise<T[]>;
  withTransactionAsync(tache: () => Promise<void>): Promise<void>;
}
