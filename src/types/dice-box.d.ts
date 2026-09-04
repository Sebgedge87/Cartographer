/**
 * Minimal typings for @3d-dice/dice-box, which ships none.
 *
 * Only what this app calls is declared, and only options the library actually reads.
 * It ignores anything it does not recognise, so an invented setting would otherwise
 * look configured and silently do nothing.
 */
declare module '@3d-dice/dice-box' {
  export interface DiceBoxOptions {
    /** A CSS selector. The library looks it up itself and rejects an element. */
    container: string;
    /** Where the ammo.js wasm and theme folders are served from. */
    assetPath: string;
    id?: string;
    theme?: string;
    themeColor?: string;
    scale?: number;
    enableShadows?: boolean;
    shadowTransparency?: number;
    lightIntensity?: number;
    /** Milliseconds between dice entering — zero makes the physics stutter. */
    delay?: number;
    offscreen?: boolean;
    suspendSimulation?: boolean;
  }

  export interface DieResult {
    sides: number | string;
    value: number;
  }

  export interface RollGroupResult {
    /** The group's total, modifier included. */
    value: number;
    qty: number;
    sides: number | string;
    modifier?: number;
    rolls: DieResult[];
  }

  export default class DiceBox {
    constructor(options: DiceBoxOptions);
    init(): Promise<void>;
    /** Clears the box, then rolls. Resolves with the same results as onRollComplete. */
    roll(notation: string | string[]): Promise<DieResult[]>;
    add(notation: string | string[]): Promise<DieResult[]>;
    clear(): void;
    hide(): void;
    show(): void;
    getRollResults(): RollGroupResult[];
    onRollComplete: (results: RollGroupResult[]) => void;
  }
}
