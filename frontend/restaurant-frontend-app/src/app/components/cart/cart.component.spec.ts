import { Subject } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { Order } from '@app/models/orders/order.model';
import { PreOrdersService } from '@app/services/pre-orders/pre-orders.service';

import { CartComponent } from './cart.component';

describe('CartComponent', () => {
  let component: CartComponent;
  let fixture: ComponentFixture<CartComponent>;

  let preOrdersServiceMock: jasmine.SpyObj<PreOrdersService>;
  let routerMock: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    preOrdersServiceMock =
      jasmine.createSpyObj<PreOrdersService>(
        'PreOrdersService',
        [
          'getPreOrders',
          'cancelPreOrderByReservationId',
          'unsubmitPreOrderByReservationId',
          'submitPreOrderByReservationId',
          'editPreOrderByReservationId',
        ],
      );

    routerMock = jasmine.createSpyObj<Router>(
      'Router',
      ['navigate'],
    );

    preOrdersServiceMock.getPreOrders.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [CartComponent],
      providers: [
        {
          provide: PreOrdersService,
          useValue: preOrdersServiceMock,
        },
        {
          provide: Router,
          useValue: routerMock,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CartComponent);
    component = fixture.componentInstance;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit closeCartEvent when closeCart is called', () => {
    spyOn(component.closeCartEvent, 'emit');

    component.closeCart();

    expect(
      component.closeCartEvent.emit,
    ).toHaveBeenCalled();
  });

  it('should return submitted orders with statuses 1 and 3', () => {
    component.orders.set([
      {
        orderId: 'order-1',
        status: 1,
      },
      {
        orderId: 'order-2',
        status: 2,
      },
      {
        orderId: 'order-3',
        status: 3,
      },
      {
        orderId: 'order-4',
        status: 0,
      },
    ] as Order[]);

    expect(
      component
        .submittedOrders()
        .map((order) => order.status),
    ).toEqual([1, 3]);
  });

  it('should return unsubmitted orders with status 0', () => {
    component.orders.set([
      {
        orderId: 'order-1',
        status: 0,
      },
      {
        orderId: 'order-2',
        status: 1,
      },
      {
        orderId: 'order-3',
        status: 3,
      },
    ] as Order[]);

    expect(
      component
        .unsubmittedOrders()
        .map((order) => order.status),
    ).toEqual([0]);
  });

  it('should navigate to reservations when goToReservations is called', () => {
    component.goToReservations();

    expect(routerMock.navigate).toHaveBeenCalledWith([
      '/reservations',
    ]);
  });
  it('keeps reservation context when adding another dish', () => {
    component.orders.set([{ orderId: 'order-1', reservationId: 'reservation-1', reservationAddress: 'Test restaurant', reservationTime: 'Nov 6', status: 0, orderItems: [] } as Order]);
    spyOn(component.closeCartEvent, 'emit');
    component.addDishToOrder('order-1');
    expect(routerMock.navigate).toHaveBeenCalledWith(['/menu'], { queryParams: { preOrder: true, reservationId: 'reservation-1', reservationLabel: 'Test restaurant' } });
    expect(component.closeCartEvent.emit).toHaveBeenCalled();
  });

  it('updates quantities and totals together and blocks repeated writes until saved', () => {
    const pending = new Subject<object>();
    preOrdersServiceMock.editPreOrderByReservationId.and.returnValue(pending);
    component.orders.set([{ orderId: 'order-1', reservationId: 'reservation-1', orderItems: [{ dish: { id: 'dish-1', price: 14 }, quantity: 1 }] } as Order]);
    component.updateDishQuantity('order-1', 'dish-1', 2);
    expect(component.orders()[0].orderItems[0].quantity).toBe(2);
    expect(component.busy()).toBeTrue();
    component.updateDishQuantity('order-1', 'dish-1', 3);
    expect(preOrdersServiceMock.editPreOrderByReservationId.calls.count()).toBe(1);
    pending.next({}); pending.complete(); expect(component.busy()).toBeFalse();
  });

});
