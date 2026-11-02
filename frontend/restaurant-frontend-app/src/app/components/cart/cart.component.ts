import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed, effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { Subscription, finalize } from 'rxjs';
import { CartActivityService } from '@app/services/pre-orders/cart-activity.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { Order } from '@app/models/orders/order.model';
import { PreOrdersService } from '@app/services/pre-orders/pre-orders.service';

import { CancelOrderModalComponent } from './components/cancel-order-modal/cancel-order-modal.component';
import { NotSubmittedOrderComponent } from './components/not-submitted-order/not-submitted-order.component';
import { SubmitOrderModalComponent } from './components/submit-order-modal/submit-order-modal.component';
import { SubmittedOrderComponent } from './components/submitted-order/submitted-order.component';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [
    SubmittedOrderComponent,
    NotSubmittedOrderComponent,
    CancelOrderModalComponent,
    SubmitOrderModalComponent,
  ],
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartComponent implements OnInit {
  private readonly preOrdersService =
    inject(PreOrdersService);

  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly closeCartEvent = output<void>();

  readonly orders = signal<Order[]>([]);
  readonly activity = inject(CartActivityService);
  readonly saving = signal(false);
  readonly loading = signal(false);
  readonly loadFailed = signal(false);
  readonly busy = computed(() => this.saving() || this.loading() || this.activity.pendingAdditions() > 0);
  private loadRequest?: Subscription;
  constructor() { effect(() => { if (this.activity.revision() > 0) this.loadOrders(); }); }


  readonly cancelOrderId = signal<string | null>(null);
  readonly submitOrderId = signal<string | null>(null);

  readonly submittedOrders = computed(() =>
    this.orders().filter(
      (order) => order.status === 1 || order.status === 3,
    ),
  );

  readonly unsubmittedOrders = computed(() =>
    this.orders().filter((order) => order.status === 0),
  );

  readonly submittedOrder = computed(() => {
    const orderId = this.submitOrderId();

    if (!orderId) {
      return undefined;
    }

    return this.orders().find(
      (order) => order.orderId === orderId,
    );
  });

  ngOnInit(): void {
    this.loadOrders();
  }

  closeCart(): void {
    this.closeCartEvent.emit();
  }

  openCancelModal(orderId: string): void {
    this.cancelOrderId.set(orderId);
    this.submitOrderId.set(null);
  }

  closeCancelModal(): void {
    this.cancelOrderId.set(null);
  }

  closeSubmitModal(): void {
    this.submitOrderId.set(null);
  }

  editOrderModal(): void {
    const orderId = this.submitOrderId();

    if (!orderId) {
      console.error('No order selected for editing');
      return;
    }

    this.editOrder(orderId);
    this.closeSubmitModal();
  }

  goToReservations(): void {
    this.closeCart();
    void this.router.navigate(['/reservations']);
  }

  cancelOrder(orderId: string): void {
    if (this.busy()) return;
    const order = this.findOrder(orderId);

    if (!order) {
      return;
    }

    this.saving.set(true);
    this.preOrdersService
      .cancelPreOrderByReservationId(order.reservationId)
      .pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.closeCancelModal();
          this.loadOrders();
        },
        error: (error) => {
          this.loadOrders();
          console.error(
            `Error cancelling order ${orderId}:`,
            error,
          );
        },
      });
  }

  editOrder(orderId: string): void {
    if (this.busy()) return;
    const order = this.findOrder(orderId);

    if (!order) {
      return;
    }

    this.saving.set(true);
    this.preOrdersService
      .unsubmitPreOrderByReservationId(order.reservationId)
      .pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loadOrders();
        },
        error: (error) => {
          this.loadOrders();
          console.error(
            `Error un-submitting order ${orderId}:`,
            error,
          );
        },
      });
  }

  submitOrder(orderId: string): void {
    if (this.busy()) return;
    const order = this.findOrder(orderId);

    if (!order) {
      return;
    }

    this.saving.set(true);
    this.preOrdersService
      .submitPreOrderByReservationId(order.reservationId)
      .pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitOrderId.set(orderId);
          this.loadOrders();
        },
        error: (error) => {
          this.loadOrders();
          console.error(
            `Error submitting order ${orderId}:`,
            error,
          );
        },
      });
  }

  addDishToOrder(orderId: string): void {
    const order = this.findOrder(orderId);
    if (!order || this.busy()) return;
    this.closeCart();
    void this.router.navigate(['/menu'], { queryParams: { preOrder: true, reservationId: order.reservationId, reservationLabel: order.reservationAddress } });
  }

  updateDishQuantity(
    orderId: string,
    itemId: string,
    quantity: number,
  ): void {
    if (this.busy() || quantity <= 0) {
      return;
    }

    const originalOrder = this.findOrder(orderId);

    if (!originalOrder) {
      return;
    }

    const updatedOrder: Order = {
      ...originalOrder,
      orderItems: originalOrder.orderItems.map((item) =>
        item.dish.id === itemId
          ? {
            ...item,
            quantity,
          }
          : item,
      ),
    };

    this.orders.update(orders => orders.map(order => order.orderId === updatedOrder.orderId ? updatedOrder : order));
    this.saving.set(true);
    this.preOrdersService
      .editPreOrderByReservationId(
        updatedOrder.reservationId,
        updatedOrder,
      )
      .pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loadOrders();
        },
        error: (error) => {
          this.loadOrders();
          console.error(
            `Error updating item ${itemId}:`,
            error,
          );
        },
      });
  }

  removeDishFromOrder(
    orderId: string,
    itemId: string,
  ): void {
    if (this.busy()) return;
    const originalOrder = this.findOrder(orderId);

    if (!originalOrder) {
      return;
    }

    const updatedOrder: Order = {
      ...originalOrder,
      orderItems: originalOrder.orderItems.filter(
        (item) => item.dish.id !== itemId,
      ),
    };

    this.orders.update(orders => orders.map(order => order.orderId === updatedOrder.orderId ? updatedOrder : order));
    this.saving.set(true);
    this.preOrdersService
      .editPreOrderByReservationId(
        updatedOrder.reservationId,
        updatedOrder,
      )
      .pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loadOrders();
        },
        error: (error) => {
          this.loadOrders();
          console.error(
            `Error removing item ${itemId}:`,
            error,
          );
        },
      });
  }

  private findOrder(orderId: string): Order | undefined {
    const order = this.orders().find(
      (item) => item.orderId === orderId,
    );

    if (!order) {
      console.error(`Order with ID ${orderId} not found`);
    }

    return order;
  }

  loadOrders(): void {
    this.loadRequest?.unsubscribe();
    this.loading.set(true); this.loadFailed.set(false);
    this.loadRequest = this.preOrdersService.getPreOrders()
      .pipe(finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: orders => this.orders.set(orders),
        error: () => this.loadFailed.set(true),
      });
  }
}
