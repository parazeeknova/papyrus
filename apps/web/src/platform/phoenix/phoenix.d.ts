declare module "phoenix" {
  export type ReceiveStatus = "error" | "ok" | "timeout";

  export interface Push {
    receive(
      status: ReceiveStatus,
      callback: (response?: unknown) => void
    ): Push;
  }

  export interface Channel {
    join(timeout?: number): Push;
    leave(timeout?: number): Push;
    off(event: string, ref?: number): void;
    on(event: string, callback: (payload?: unknown) => void): number;
    onClose(callback: (event?: unknown) => void): void;
    onError(callback: (reason?: unknown) => void): void;
    push(event: string, payload: unknown, timeout?: number): Push;
  }

  export interface SocketOptions {
    params?: Record<string, unknown>;
    timeout?: number;
  }

  export class Socket {
    constructor(endPoint: string, options?: SocketOptions);
    channel(topic: string, payload?: Record<string, unknown>): Channel;
    connect(params?: Record<string, unknown>): void;
    disconnect(callback?: () => void, code?: number, reason?: string): void;
    onClose(callback: (event?: unknown) => void): void;
    onError(callback: (error?: unknown) => void): void;
  }
}
