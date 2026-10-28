interface TrackedEdit {
  read: () => string;
  active: () => boolean;
  baseline: string;
  busy: boolean;
  scope: object;
}

/** A page transition must not silently replace a form with unsaved work. */
export class EditSession {
  private edits = new Set<TrackedEdit>();

  track(
    read: () => string,
    active: () => boolean,
    scope: object = {},
  ): { saved: () => void; saving: (busy: boolean) => void } {
    this.prune();
    const edit: TrackedEdit = { read, active, baseline: read(), busy: false, scope };
    this.edits.add(edit);
    return {
      saved: () => {
        edit.baseline = read();
      },
      saving: (busy) => {
        edit.busy = busy;
      },
    };
  }

  private prune(): void {
    for (const edit of this.edits) if (!edit.active()) this.edits.delete(edit);
  }

  get dirty(): boolean {
    return this.hasChanges();
  }
  hasChanges(scope?: object): boolean {
    this.prune();
    return [...this.edits].some(
      (edit) => (scope === undefined || scope === edit.scope) && (edit.busy || edit.read() !== edit.baseline),
    );
  }
  isSaving(scope?: object): boolean {
    this.prune();
    return [...this.edits].some((edit) => (scope === undefined || scope === edit.scope) && edit.busy);
  }
  leave(action: () => void, scope?: object): boolean {
    if (this.hasChanges(scope)) return false;
    action();
    return true;
  }
  discard(scope?: object): boolean {
    if (this.isSaving(scope)) return false;
    for (const edit of this.edits)
      if (scope === undefined || scope === edit.scope) edit.baseline = edit.read();
    return true;
  }
}
