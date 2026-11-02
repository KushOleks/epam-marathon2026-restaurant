import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GuestInviteService } from '@app/services/reservation/guest-invite.service';
import { ToastService } from '@app/services/toast/toast.service';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component, DestroyRef, OnInit, inject,
  input,
  output,
  signal,
} from '@angular/core';

import {
  Reservation,
  ReservationStatus,
} from '@app/models/reservations/reservation.model';
import { CustomButtonComponent } from '@app/shared/custom-components/custom-button/custom-button.component';

@Component({
  selector: 'app-reservation-confirmed',
  standalone: true,
  imports: [
    DatePipe,
    CustomButtonComponent,
  ],
  templateUrl: './reservation-confirmed.component.html',
  styleUrl: './reservation-confirmed.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.fade-out]': 'isFading()',
  },
})
export class ReservationConfirmedComponent implements OnInit {
  private readonly invites = inject(GuestInviteService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly inviteLink = signal('');
  readonly inviteLoading = signal(false);
  readonly inviteError = signal(false);
  ngOnInit(): void { if (this.reservation().guestCount >= 2) this.loadInvite(); }
  loadInvite(): void {
    this.inviteLoading.set(true); this.inviteError.set(false);
    this.invites.getInviteToken$(this.reservation().id, true).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ token }) => { this.inviteLink.set(`${window.location.origin}/join/${token}`); this.inviteLoading.set(false); },
      error: () => { this.inviteLoading.set(false); this.inviteError.set(true); },
    });
  }
  async copyInvite(): Promise<void> {
    try { await navigator.clipboard.writeText(this.inviteLink()); this.toast.success('Share this link with your guests.', 'Link copied'); }
    catch { this.toast.error('Please copy the invitation link manually.'); }
  }

  readonly reservation = input.required<Reservation>();
  readonly customClass = input('');

  readonly closed = output<void>();
  readonly editReservation = output<void>();
  readonly cancelReservation = output<void>();

  readonly isFading = signal(false);

  protected readonly ReservationStatus = ReservationStatus;

  onClose(): void {
    if (this.isFading()) {
      return;
    }

    this.isFading.set(true);
    this.closed.emit();
  }

  onEdit(): void {
    this.editReservation.emit();
  }

  onCancel(): void {
    this.cancelReservation.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }
}
