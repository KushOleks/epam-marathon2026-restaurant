import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { GuestPreorderStore } from './guest-preorder.store';
import { GuestSessionsService } from '@app/services/guest-sessions/guest-sessions.service';
import { GuestInviteService } from '@app/services/reservation/guest-invite.service';

describe('Guest cart rapid additions', () => {
  it('queues every click and includes quantity in the total', async () => {
    const first = new Subject<void>();
    const sessions = jasmine.createSpyObj('GuestSessionsService', ['addDish']);
    sessions.addDish.and.returnValues(first, of(undefined), of(undefined));
    TestBed.configureTestingModule({
      providers: [
        { provide: GuestSessionsService, useValue: sessions },
        { provide: GuestInviteService, useValue: {} },
      ],
    });
    const store = TestBed.inject(GuestPreorderStore);
    store.guestSessionId.set('guest');
    store.guestSessionToken.set('test-token');
    const salad = { dishId: 'salad', title: 'Salad', price: 14 };
    const bowl = { dishId: 'bowl', title: 'Bowl', price: 22 };
    const a = store.addDish(salad),
      b = store.addDish(bowl),
      c = store.addDish(salad);
    await Promise.resolve();
    expect(sessions.addDish.calls.count()).toBe(1);
    expect(store.cartBusy()).toBeTrue();
    first.next();
    first.complete();
    expect(await a).toBeTrue();
    expect(await b).toBeTrue();
    expect(await c).toBeTrue();
    expect(store.cartItems().map((item) => item.qty)).toEqual([2, 1]);
    expect(store.total()).toBe(50);
    expect(store.cartBusy()).toBeFalse();
  });
});
