import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { catchError, map, switchMap } from 'rxjs';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { SKIP_ERROR_TOAST } from '@app/auth/skip-error-toast.context';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { GroupStatusResponse } from '@app/models/group-orders/group-status.model';
import { OwnerSessionResponse } from '@app/models/group-orders/owner-session.model';
import { SubmittedDish } from '@app/models/group-orders/submit-group-pre-order.model';
import { GroupRequestOptions } from './request-options.model';

@Injectable({ providedIn: 'root' })
export class GroupOrdersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  getGroupInvite$(reservationId: string) {
    const context = new HttpContext().set(SKIP_ERROR_TOAST, true);
    return this.http.get<{ token: string }>(`${this.baseUrl}/reservations/${reservationId}/invite-token`, { context }).pipe(
      switchMap(({ token }) => this.http.get<GuestInvite>(`${this.baseUrl}/guest/invites/${token}`, { context })),
      // A full/submitted group no longer accepts invitations. Owners still need
      // their private review screen after a reload or once all guests have joined.
      catchError(() => this.http.get<GuestInvite>(`${this.baseUrl}/reservations/${reservationId}/group-order`))
    );
  }
  getSessions$(groupId: string, options: GroupRequestOptions = {}) {
    return this.http.get<GroupSessionsResponse>(`${this.baseUrl}/guest/groups/${groupId}/sessions`, this.options(options));
  }
  getOwnerSessionId$(reservationId: string) {
    return this.http.get<OwnerSessionResponse>(`${this.baseUrl}/reservations/${reservationId}/guest-session-id`).pipe(map((response) => response.guestSessionId));
  }
  getStatus$(groupId: string, options: GroupRequestOptions = {}) {
    return this.http.get<GroupStatusResponse>(`${this.baseUrl}/guest/groups/${groupId}/status`, this.options(options));
  }
  submit$(groupId: string, reservationId: string) {
    return this.http.post<SubmittedDish[]>(`${this.baseUrl}/group-reservations/${groupId}/submit`, { reservationId });
  }
  removeSession$(groupId: string, sessionId: string) {
    return this.http.delete<GroupSessionsResponse>(`${this.baseUrl}/guest/groups/${groupId}/sessions/${sessionId}`);
  }
  private options(options: GroupRequestOptions) {
    return { context: new HttpContext().set(SKIP_ERROR_TOAST, options.silent === true) };
  }
}
