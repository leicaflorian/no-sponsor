// Settings stored in storage.sync. The keys are those of 0.1.0: they do not change.
export type Mode = 'highlight' | 'collapse' | 'hide';

export interface Settings {
  mode: Mode;
  generic: boolean;
  disabledHosts: string[];
}

export const DEFAULTS: Settings = { mode: 'highlight', generic: true, disabledHosts: [] };
