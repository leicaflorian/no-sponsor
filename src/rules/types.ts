// Entry of `selectors`: "selector" marks the element found,
// [selector, container] marks el.closest(container).
export type SelectorEntry = string | [selector: string, container: string];

export interface Detector {
  id: string;
  name: string;
  selectors: SelectorEntry[];
  labels: string[];
  container: string[];
  scope?: string;
  obfuscated?: boolean;
}

export interface SiteDetector extends Detector {
  match: RegExp;
}
