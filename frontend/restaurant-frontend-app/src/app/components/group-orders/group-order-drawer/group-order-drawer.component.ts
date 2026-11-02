import { DatePipe, DOCUMENT } from '@angular/common';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { GroupOrderDrawerService } from '@app/services/group-orders/group-order-drawer.service';
import { ReservationService } from '@app/services/reservation/reservation.service';
import { Reservation, ReservationStatus } from '@app/models/reservations/reservation.model';
import { GroupOrderPageComponent } from '@app/pages/group-order-page/group-order-page.component';

@Component({
  selector: 'app-group-order-drawer',
  imports: [DatePipe, CdkTrapFocus, RouterLink, GroupOrderPageComponent],
  templateUrl: './group-order-drawer.component.html',
  styleUrl: './group-order-drawer.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class GroupOrderDrawerComponent implements OnInit, OnDestroy {
  readonly drawer = inject(GroupOrderDrawerService);
  private readonly reservationsService = inject(ReservationService);
  private readonly document = inject(DOCUMENT);
  @ViewChild(GroupOrderPageComponent) page?: GroupOrderPageComponent;
  readonly reservations = signal<Reservation[]>([]);
  readonly loading = signal(false);
  readonly failed = signal(false);
  private request?: Subscription;
  private previousOverflow = '';
  ngOnInit(): void {
    this.previousOverflow = this.document.body.style.overflow;
    this.document.body.style.overflow = 'hidden';
    if (!this.drawer.reservationId()) this.load();
  }
  ngOnDestroy(): void { this.request?.unsubscribe(); this.document.body.style.overflow = this.previousOverflow; }
  load(): void {
    this.request?.unsubscribe(); this.loading.set(true); this.failed.set(false);
    this.request = this.reservationsService.getReservationsForUser$().subscribe({
      next: (items) => { this.reservations.set(items.filter(item => item.guestCount >= 2 && item.status !== ReservationStatus.Cancelled)); this.loading.set(false); },
      error: () => { this.failed.set(true); this.loading.set(false); },
    });
  }
  busy(): boolean { return !!(this.page?.submitting() || this.page?.removing()); }
  close(): void { if (!this.busy()) this.drawer.close(); }
  back(): void { if (!this.busy()) { this.drawer.reservationId.set(''); this.load(); } }
  escape(event: Event): void {
    event.stopPropagation();
    if (this.busy()) return;
    if (this.page?.confirmSubmit()) this.page.confirmSubmit.set(false);
    else if (this.page?.removingGuest()) this.page.removingGuest.set(null);
    else this.close();
  }
}
