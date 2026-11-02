import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CartActivityService {
  readonly needsReview = signal(false);
  readonly pendingAdditions = signal(0);
  readonly revision = signal(0);
  added(): void {
    this.needsReview.set(true);
    this.revision.update((value) => value + 1);
  }
  acknowledge(): void {
    this.needsReview.set(false);
  }
}
