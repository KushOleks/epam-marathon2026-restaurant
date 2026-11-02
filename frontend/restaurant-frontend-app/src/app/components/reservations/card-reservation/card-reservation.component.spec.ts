import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CardReservationComponent } from './card-reservation.component';
import { ReservationCustomer, ReservationStatusCustomer } from '@app/models/reservations/reservation.model';
import { GroupOrderDrawerService } from '@app/services/group-orders/group-order-drawer.service';

describe('Reservation group actions', () => {
  const reservation = { id: 'r1', guestCount: 3, status: ReservationStatusCustomer.Reserved, startTime: new Date(), endTime: new Date() } as ReservationCustomer;
  beforeEach(() => TestBed.configureTestingModule({ imports: [CardReservationComponent], providers: [provideRouter([])] }));
  it('keeps group actions inside the card and opens its drawer', () => {
    const fixture = TestBed.createComponent(CardReservationComponent); fixture.componentRef.setInput('r', reservation); fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.card .group-order-button'); expect(button).toBeTruthy(); button.click();
    expect(TestBed.inject(GroupOrderDrawerService).reservationId()).toBe('r1');
    spyOn(fixture.componentInstance.inviteGuests, 'emit'); fixture.nativeElement.querySelector('.invite-button').click();
    expect(fixture.componentInstance.inviteGuests.emit).toHaveBeenCalledWith(reservation);
  });
  it('hides group actions on cancelled reservations', () => {
    const fixture = TestBed.createComponent(CardReservationComponent); fixture.componentRef.setInput('r', { ...reservation, status: ReservationStatusCustomer.Cancelled }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.group-actions')).toBeNull();
  });
});
