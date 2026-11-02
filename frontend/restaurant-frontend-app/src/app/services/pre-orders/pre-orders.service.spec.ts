import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { PreOrdersService } from './pre-orders.service';

describe('PreOrdersService reservation time', () => {
  let service: PreOrdersService;
  let http: HttpTestingController;
  const base = 'https://test.api';
  const order = { orderId: 'order-1', reservationId: 'reservation-1', reservationTime: 'UTC legacy time', orderItems: [] };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: base },
    ] });
    service = TestBed.inject(PreOrdersService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('shows local reservation times instead of the stored UTC label in the cart', () => {
    service.getPreOrders().subscribe((orders) => {
      expect(orders[0].reservationTime.replace(/\s/g, ' ')).toBe('Nov 03, 2026, 6:00 PM - 7:30 PM');
    });
    http.expectOne(`${base}/orders`).flush([order]);
    http.expectOne(`${base}/reservations`).flush([{
      id: 'reservation-1',
      startTime: new Date(2026, 10, 3, 18, 0).toISOString(),
      endTime: new Date(2026, 10, 3, 19, 30).toISOString(),
    }]);
  });

  it('uses the local calendar date for a reservation near midnight', () => {
    service.getByReservationId('reservation-1').subscribe((result) => {
      expect(result.reservationTime.replace(/\s/g, ' ')).toBe('Nov 03, 2026, 12:30 AM - 2:00 AM');
    });
    http.expectOne(`${base}/orders/reservation-1`).flush(order);
    http.expectOne(`${base}/reservations/reservation-1`).flush({
      id: 'reservation-1',
      startTime: new Date(2026, 10, 3, 0, 30).toISOString(),
      endTime: new Date(2026, 10, 3, 2, 0).toISOString(),
    });
  });

  it('preserves legacy orders when their reservation is no longer listed', () => {
    service.getPreOrders().subscribe((orders) => expect(orders[0].reservationTime).toBe('UTC legacy time'));
    http.expectOne(`${base}/orders`).flush([order]);
    http.expectOne(`${base}/reservations`).flush([]);
  });
});
