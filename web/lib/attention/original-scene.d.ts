export type SceneItem = {
  id: string;
  title: string;
  /** position in [-1, 1]^3: [confidence, impact, urgency] */ w: [
    number,
    number,
    number,
  ];
};

export type SceneCallbacks = {
  onHover?: (id: string | null) => void;
  onSelect?: (id: string | null) => void;
  onZone?: (on: boolean) => void;
  /** Disabled for published signals: the reference cube must not become an eligibility gate. */
  zoneInteractive?: boolean;
  thirdAxisLabel?: string;
};

export type AttentionScene = {
  setItems(items: SceneItem[]): void;
  focus(id: string | null): void;
  reset(): void;
  setHover(id: string | null): void;
  setZone(on: boolean): void;
  dispose(): void;
};

export function createScene(
  host: HTMLElement,
  callbacks?: SceneCallbacks,
): AttentionScene;
