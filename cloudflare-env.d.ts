interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = unknown>(): Promise<{ results: T[] }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface CloudflareEnv {
  ABSCISSA_REGISTRY: D1Database;
  AUTH_EMAIL?: {
    send(message: { to: string; from: string; subject: string; text: string; html?: string }): Promise<unknown>;
  };
}
