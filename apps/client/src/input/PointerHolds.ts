// Per-pointer ownership for simultaneous touch controls. Releasing one finger must not
// cancel another finger's movement/aim. A tap steps immediately once (never again on click);
// held repeats are still driven by the scene's fixed-rate input path.
export class PointerHolds<Control extends string> {
  private readonly pointers = new Map<number, Control>();

  public constructor(
    private readonly onHold: (control: Control, held: boolean) => void,
    private readonly onStep: (control: Control) => void,
  ) {}

  public start(pointerId: number, control: Control): void {
    if (this.pointers.has(pointerId)) return;
    const alreadyHeld = [...this.pointers.values()].includes(control);
    this.pointers.set(pointerId, control);
    if (!alreadyHeld) this.onHold(control, true);
    this.onStep(control);
  }

  public stop(pointerId: number): void {
    const control = this.pointers.get(pointerId);
    if (control === undefined) return;
    this.pointers.delete(pointerId);
    if (![...this.pointers.values()].includes(control)) this.onHold(control, false);
  }

  public cancelControl(control: Control): void {
    for (const [id, held] of this.pointers) if (held === control) this.stop(id);
  }

  public clear(): void {
    for (const id of this.pointers.keys()) this.stop(id);
  }
}
