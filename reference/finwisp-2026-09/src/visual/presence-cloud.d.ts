export class PresenceCloud {
  constructor(host: HTMLElement, options?: { renderer?: 'particles' });
  setState(value: 'idle' | 'listening' | 'thinking' | 'speaking'): void;
  setSkin(value: number): void;
  setLevel(value: number): void;
  setLow(value: boolean): void;
  setPaused(value: boolean): void;
  dispose(): void;
}
