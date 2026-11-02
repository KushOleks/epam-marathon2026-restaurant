import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { EMPTY, Subscription, catchError, exhaustMap, finalize, forkJoin, interval, switchMap, tap } from 'rxjs';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { ToastService } from '@app/services/toast/toast.service';
import { Participant } from '@app/models/group-orders/participant.model';
import { GroupReservationStatus } from '@app/models/group-orders/group-status.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { consolidatePreOrder } from '@app/shared/helpers/consolidate-pre-order';
import { ParticipantCardComponent } from '@app/components/group-orders/participant-card/participant-card.component';
import { ModalComponent } from '@app/shared/custom-components/modal/modal.component';

@Component({
  selector: 'app-group-order-page', host: { '[class.embedded]': 'embedded()' }, imports: [CurrencyPipe, DatePipe, ParticipantCardComponent, ModalComponent],
  templateUrl: './group-order-page.component.html', styleUrl: './group-order-page.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class GroupOrderPageComponent implements OnInit, OnDestroy {
  private readonly service = inject(GroupOrdersService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  readonly selectedReservationId = input('', { alias: 'reservationId' });
  readonly embedded = input(false);
  private get reservationId(): string { return this.selectedReservationId() || this.route.snapshot.paramMap.get('reservationId') || ''; }
  readonly editOrderHref = computed(() => '/menu?preOrder=true&reservationId=' + encodeURIComponent(this.reservationId) + '&reservationLabel=' + encodeURIComponent(this.invite()?.LocationAddress ?? 'this reservation'));
  readonly loading = signal(true);
  readonly error = signal('');
  readonly invite = signal<GuestInvite | null>(null);
  readonly participants = signal<Participant[]>([]);
  readonly ownerSessionId = signal('');
  readonly status = signal<GroupReservationStatus>('Open');
  readonly submitting = signal(false);
  readonly removing = signal(false);
  readonly refreshing = signal(false);
  readonly updatedAt = signal<Date | null>(null);
  readonly refreshFailed = signal(false);
  readonly confirmSubmit = signal(false);
  readonly removingGuest = signal<Participant | null>(null);
  readonly consolidated = computed(() => consolidatePreOrder(this.participants()));
  readonly unsubmitted = computed(() => this.participants().filter((person) => !person.isSubmitted).length);
  readonly readOnly = computed(() => this.status() !== 'Open');
  readonly empty = computed(() => this.participants().every((person) => person.items.length === 0));
  private timer?: Subscription;
  private loadRequest?: Subscription;
  private manualRefresh?: Subscription;
  private mutation?: Subscription;

  ngOnInit(): void { this.load(); }
  ngOnDestroy(): void {
    this.stopPolling(); this.loadRequest?.unsubscribe(); this.mutation?.unsubscribe();
  }
  load(): void {
    this.stopPolling(); this.loadRequest?.unsubscribe();
    this.loading.set(true); this.error.set('');
    this.loadRequest = this.service.getGroupInvite$(this.reservationId).pipe(
      tap((invite) => this.invite.set(invite)),
      switchMap((invite) => forkJoin({
        sessions: this.service.getSessions$(invite.GroupReservationId),
        owner: this.service.getOwnerSessionId$(this.reservationId),
        status: this.service.getStatus$(invite.GroupReservationId),
      })),
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (response) => {
        this.participants.set(response.sessions.participants); this.ownerSessionId.set(response.owner);
        this.status.set(response.status.status); this.updatedAt.set(new Date()); this.refreshFailed.set(false);
        this.startPolling();
      },
      error: (error: HttpErrorResponse) => this.error.set(error.status === 404 ? 'Group reservation not found' : error.status === 403 ? 'Only the owner can view this group' : 'Could not load group pre-order'),
    });
  }
  private startPolling(): void {
    this.timer?.unsubscribe();
    if (!this.readOnly()) this.timer = interval(15_000).pipe(exhaustMap(() => this.refreshRequest())).subscribe();
  }
  private stopPolling(): void { this.timer?.unsubscribe(); this.manualRefresh?.unsubscribe(); }
  private refreshRequest() {
    const groupId = this.invite()?.GroupReservationId;
    if (!groupId || this.readOnly() || this.refreshing() || this.submitting() || this.removing()) return EMPTY;
    this.refreshing.set(true);
    return forkJoin({ sessions: this.service.getSessions$(groupId, { silent: true }), status: this.service.getStatus$(groupId, { silent: true }) }).pipe(
      tap((response) => {
        this.participants.set(response.sessions.participants); this.status.set(response.status.status);
        this.updatedAt.set(new Date()); this.refreshFailed.set(false);
        if (this.readOnly()) this.timer?.unsubscribe();
      }),
      catchError(() => { this.refreshFailed.set(true); return EMPTY; }),
      finalize(() => this.refreshing.set(false))
    );
  }
  refresh(): void { if (!this.refreshing()) this.manualRefresh = this.refreshRequest().subscribe(); }
  openSubmit(): void {
    if (!this.readOnly() && this.consolidated().items.length && !this.submitting()) this.confirmSubmit.set(true);
  }
  submit(): void {
    const groupId = this.invite()?.GroupReservationId;
    if (!groupId || this.submitting() || this.readOnly()) return;
    this.stopPolling(); this.submitting.set(true);
    this.mutation = this.service.submit$(groupId, this.reservationId).pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: () => { this.status.set('Submitted'); this.confirmSubmit.set(false); this.toast.success('Pre-order sent to the restaurant', 'Success'); },
      error: () => { this.confirmSubmit.set(false); this.startPolling(); },
    });
  }
  removeGuest(guest: Participant): void { if (!this.readOnly() && !this.submitting() && guest.type === 'Guest') this.removingGuest.set(guest); }
  remove(): void {
    const groupId = this.invite()?.GroupReservationId, guest = this.removingGuest();
    if (!groupId || !guest || this.removing() || this.readOnly()) return;
    this.stopPolling(); this.removing.set(true);
    this.mutation = this.service.removeSession$(groupId, guest.id).pipe(finalize(() => { this.removing.set(false); this.startPolling(); })).subscribe({
      next: (snapshot) => { this.participants.set(snapshot.participants); this.updatedAt.set(new Date()); this.removingGuest.set(null); },
      error: () => this.removingGuest.set(null),
    });
  }
}
