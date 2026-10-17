// Messages between content script and popup (`type` keys from 0.1.0).
export type CountMessage = { type: 'nsp-count'; n: number };
export type GetMessage = { type: 'nsp-get' };
export type PageInfo = { n: number; host: string; site: string | null };
