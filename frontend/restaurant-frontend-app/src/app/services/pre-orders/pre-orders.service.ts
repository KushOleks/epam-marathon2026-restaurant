import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { Order } from '@app/models/orders/order.model';
import { DishListResponse } from '@app/models/dishes/dish-list-response.model';
import { map, switchMap } from 'rxjs';
import { CreateOrderRequest } from '@app/models/cart/create-order-request.model';
import { formatDate } from '@angular/common';
import { ReservationCustomer } from '@app/models/reservations/reservation.model';
import { forkJoin } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class PreOrdersService {
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);

  getPreOrders() {
    return forkJoin({
      orders: this.http.get<Order[]>(`${this.baseUrl}/orders`),
      reservations: this.http.get<ReservationCustomer[]>(`${this.baseUrl}/reservations`),
    }).pipe(
      map(({ orders, reservations }) => {
        const byId = new Map(reservations.map((reservation) => [reservation.id, reservation]));
        return orders.map((order) => this.withLocalReservationTime(order, byId.get(order.reservationId)));
      })
    );
  }

  getByReservationId(reservationId: string) {
    return forkJoin({
      order: this.http.get<Order>(`${this.baseUrl}/orders/${reservationId}`),
      reservation: this.http.get<ReservationCustomer>(`${this.baseUrl}/reservations/${reservationId}`),
    }).pipe(map(({ order, reservation }) => this.withLocalReservationTime(order, reservation)));
  }

  private withLocalReservationTime(order: Order, reservation?: ReservationCustomer): Order {
    if (!reservation) return order;
    // Use the same browser-local timezone as the reservation card's DatePipe.
    // The legacy reservationTime string is formatted by the server in UTC.
    const date = formatDate(reservation.startTime, 'MMM dd, yyyy', 'en-US');
    const start = formatDate(reservation.startTime, 'shortTime', 'en-US');
    const end = formatDate(reservation.endTime, 'shortTime', 'en-US');
    return { ...order, reservationTime: `${date}, ${start} - ${end}` };
  }

  addDishToPreOrderByReservationId(
    reservationId: string,
    dish: DishListResponse,
    quantity: number
  ) {
    return this.getPreOrders().pipe(
      map((orders) => {
        const order = orders.find((o) => o.reservationId === reservationId);
        if (!order) {
          return order;
        }

        const existingItem = order.orderItems.find((item) => item.dish.id === dish.id);
        if (existingItem) {
          existingItem.quantity += quantity;
        } else {
          order.orderItems.push({ dish, quantity, state: 0 });
        }
        return order;
      }),
      switchMap((order) => {
        if (!order) {
          const orderCreateRequest: CreateOrderRequest = {
            reservationId,
            orderItems: [{ dish, quantity, state: 0 }],
          };
          return this.createPreOrder(orderCreateRequest);
        }

        return this.editPreOrderByReservationId(reservationId, order);
      })
    );
  }

  createPreOrder(order: CreateOrderRequest) {
    const createOrderRequest = {
      reservationId: order.reservationId,
      orderItems: order.orderItems.map((item) => ({
        dishId: item.dish.id,
        quantity: item.quantity,
      })),
    };

    return this.http.post<Order>(`${this.baseUrl}/orders`, createOrderRequest);
  }

  editPreOrderByReservationId(reservationId: string, order: Order) {
    const orderItems = order.orderItems.map((item) => ({
      dishId: item.dish.id,
      quantity: item.quantity,
    }));

    if (orderItems.length === 0) {
      return this.cancelPreOrderByReservationId(reservationId);
    }

    return this.http.put(`${this.baseUrl}/orders/${reservationId}`, { orderItems });
  }

  cancelPreOrderByReservationId(reservationId: string) {
    return this.http.delete(`${this.baseUrl}/orders/${reservationId}`);
  }

  submitPreOrderByReservationId(reservationId: string) {
    return this.http.post(`${this.baseUrl}/orders/${reservationId}/submit`, {});
  }

  unsubmitPreOrderByReservationId(reservationId: string) {
    return this.http.post(`${this.baseUrl}/orders/${reservationId}/unsubmit`, {});
  }

  confirmDishInOrder(reservationId: string, dishId: string) {
    return this.http.patch(
      `${this.baseUrl}/reservations/${reservationId}/order/confirmations/${dishId}`,
      {}
    );
  }

  rejectDishInOrder(reservationId: string, dishId: string) {
    return this.http.patch(
      `${this.baseUrl}/reservations/${reservationId}/order/cancellations/${dishId}`,
      {}
    );
  }
}
