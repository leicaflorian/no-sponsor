// Messages between content script and popup (`type` keys from 0.1.0).
export type CountMessage = { type: 'nsp-count'; n: number };
export type GetMessage = { type: 'nsp-get' };
// `n` is the total: marked items plus veiled video ads; `video` is the veiled ads alone.
export type PageInfo = { n: number; video: number; host: string; site: string | null };
