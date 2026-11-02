import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { DishListResponse } from '@app/models/dishes/dish-list-response.model';
import { PreOrdersService } from './pre-orders.service';
import { CartActivityService } from './cart-activity.service';

describe('Pre-order rapid additions', () => {
  let service: PreOrdersService;
  let http: HttpTestingController;
  const base = 'https://test.api';
  const salad = { id: 'salad', price: 14 } as DishListResponse;
  const bowl = { id: 'bowl', price: 22 } as DishListResponse;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: base },
      ],
    });
    service = TestBed.inject(PreOrdersService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('preserves different dishes and repeated quantities during rapid clicks', () => {
    const results: unknown[] = [];
    service
      .addDishToPreOrderByReservationId('r1', salad, 1)
      .subscribe((value) => results.push(value));
    service
      .addDishToPreOrderByReservationId('r1', bowl, 1)
      .subscribe((value) => results.push(value));
    service
      .addDishToPreOrderByReservationId('r1', salad, 1)
      .subscribe((value) => results.push(value));
    expect(TestBed.inject(CartActivityService).pendingAdditions()).toBe(3);
    http.expectOne(`${base}/orders`).flush([]);
    http.expectOne(`${base}/reservations`).flush([]);
    const first = http.expectOne(`${base}/orders`);
    expect(first.request.method).toBe('POST');
    expect(first.request.body.orderItems).toEqual([{ dishId: 'salad', quantity: 1 }]);
    http.expectNone(`${base}/reservations`);
    first.flush({});
    http.expectOne(`${base}/orders`).flush([]); // index has not caught up with the create yet
    http.expectOne(`${base}/reservations`).flush([]);
    const second = http.expectOne(`${base}/orders/r1`);
    expect(second.request.body.orderItems).toEqual([
      { dishId: 'salad', quantity: 1 },
      { dishId: 'bowl', quantity: 1 },
    ]);
    second.flush({});
    http
      .expectOne(`${base}/orders`)
      .flush([{ reservationId: 'r1', orderItems: [{ dish: salad, quantity: 1 }] }]); // stale index snapshot
    http.expectOne(`${base}/reservations`).flush([]);
    const third = http.expectOne(`${base}/orders/r1`);
    expect(third.request.body.orderItems).toEqual([
      { dishId: 'salad', quantity: 2 },
      { dishId: 'bowl', quantity: 1 },
    ]);
    third.flush({});
    expect(results.length).toBe(3);
    expect(TestBed.inject(CartActivityService).pendingAdditions()).toBe(0);
    expect(TestBed.inject(CartActivityService).needsReview()).toBeTrue();
  });
  it('reports an error and continues saving subsequent additions', () => {
    let failed = false;
    service
      .addDishToPreOrderByReservationId('r1', salad, 1)
      .subscribe({ error: () => (failed = true) });
    service.addDishToPreOrderByReservationId('r1', bowl, 1).subscribe();
    const cancelled = http.expectOne(`${base}/reservations`);
    http.expectOne(`${base}/orders`).flush('offline', { status: 500, statusText: 'Error' });
    expect(cancelled.cancelled).toBeTrue();
    http.expectOne(`${base}/orders`).flush([]);
    http.expectOne(`${base}/reservations`).flush([]);
    http.expectOne(`${base}/orders`).flush({});
    expect(failed).toBeTrue();
    expect(TestBed.inject(CartActivityService).pendingAdditions()).toBe(0);
  });
});
