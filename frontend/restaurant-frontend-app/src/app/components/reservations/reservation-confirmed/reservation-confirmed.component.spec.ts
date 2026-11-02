import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ReservationConfirmedComponent } from './reservation-confirmed.component';
import { GuestInviteService } from '@app/services/reservation/guest-invite.service';
import { ToastService } from '@app/services/toast/toast.service';
import { Reservation } from '@app/models/reservations/reservation.model';

describe('Reservation confirmation invitation', () => {
  const reservation = { id: 'r1', guestCount: 3, startTime: new Date(), endTime: new Date(), locationAddress: 'Test restaurant' } as Reservation;
  let invites: jasmine.SpyObj<GuestInviteService>;
  beforeEach(() => {
    invites = jasmine.createSpyObj('GuestInviteService', ['getInviteToken$']); invites.getInviteToken$.and.returnValue(of({ token: 'test-invite' }));
    TestBed.configureTestingModule({ imports: [ReservationConfirmedComponent], providers: [{ provide: GuestInviteService, useValue: invites }, { provide: ToastService, useValue: {} }] });
  });
  it('offers the shareable link after updating a group reservation', () => {
    const fixture = TestBed.createComponent(ReservationConfirmedComponent); fixture.componentRef.setInput('reservation', reservation); fixture.detectChanges();
    expect(invites.getInviteToken$).toHaveBeenCalledWith('r1', true);
    expect(fixture.nativeElement.querySelector('input').value).toContain('/join/test-invite');
    expect(fixture.nativeElement.textContent).toContain('Copy link');
  });
  it('does not request an invitation for one guest', () => {
    const fixture = TestBed.createComponent(ReservationConfirmedComponent); fixture.componentRef.setInput('reservation', { ...reservation, guestCount: 1 }); fixture.detectChanges();
    expect(invites.getInviteToken$).not.toHaveBeenCalled(); expect(fixture.nativeElement.querySelector('input')).toBeNull();
  });
  it('shows a retry state if the invitation is unavailable', () => {
    invites.getInviteToken$.and.returnValue(throwError(() => new Error('closed')));
    const fixture = TestBed.createComponent(ReservationConfirmedComponent); fixture.componentRef.setInput('reservation', reservation); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Retry invitation');
  });
});
