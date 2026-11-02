import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GroupOrderDrawerService {
  readonly isOpen = signal(false);
  readonly reservationId = signal('');
  open(reservationId = ''): void { this.reservationId.set(reservationId); this.isOpen.set(true); }
  close(): void { this.isOpen.set(false); this.reservationId.set(''); }
}
