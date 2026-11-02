import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { GroupOrderDrawerComponent } from './group-order-drawer.component';
import { GroupOrderDrawerService } from '@app/services/group-orders/group-order-drawer.service';
import { ReservationService } from '@app/services/reservation/reservation.service';
import { Reservation, ReservationStatus } from '@app/models/reservations/reservation.model';

describe('Group order drawer', () => {
  const reservation = { id: 'r1', locationAddress: 'Test restaurant', startTime: new Date('2026-11-04T18:00:00'), guestCount: 3, status: ReservationStatus.Reserved } as Reservation;
  let api: jasmine.SpyObj<ReservationService>;
  beforeEach(() => {
    api = jasmine.createSpyObj('ReservationService', ['getReservationsForUser$']);
    api.getReservationsForUser$.and.returnValue(of([reservation]));
    TestBed.configureTestingModule({ imports: [GroupOrderDrawerComponent], providers: [provideRouter([]), { provide: ReservationService, useValue: api }] });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('renders group reservations and excludes cancelled and individual bookings', () => {
    api.getReservationsForUser$.and.returnValue(of([reservation, { ...reservation, id: 'single', guestCount: 1 }, { ...reservation, id: 'cancelled', status: ReservationStatus.Cancelled }]));
    const fixture = TestBed.createComponent(GroupOrderDrawerComponent); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.reservation').length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Test restaurant');
  });
  it('shows an empty state', () => {
    api.getReservationsForUser$.and.returnValue(of([]));
    const fixture = TestBed.createComponent(GroupOrderDrawerComponent); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No group reservations yet');
  });
  it('shows an error and retries', () => {
    api.getReservationsForUser$.and.returnValue(throwError(() => new Error('offline')));
    const fixture = TestBed.createComponent(GroupOrderDrawerComponent); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
    api.getReservationsForUser$.and.returnValue(of([reservation])); fixture.componentInstance.load(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.reservation')).toBeTruthy();
  });
  it('closes with Escape and restores body scrolling when destroyed', () => {
    const previous = document.body.style.overflow;
    const drawer = TestBed.inject(GroupOrderDrawerService); drawer.open();
    const fixture = TestBed.createComponent(GroupOrderDrawerComponent); fixture.detectChanges();
    expect(document.body.style.overflow).toBe('hidden');
    fixture.nativeElement.querySelector('aside').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(drawer.isOpen()).toBeFalse(); fixture.destroy();
    expect(document.body.style.overflow).toBe(previous);
  });
  it('opens a selected reservation without a redundant list request', () => {
    TestBed.inject(GroupOrderDrawerService).open('r1');
    const component = TestBed.runInInjectionContext(() => new GroupOrderDrawerComponent());
    component.ngOnInit(); expect(api.getReservationsForUser$).not.toHaveBeenCalled(); component.ngOnDestroy();
  });
});
