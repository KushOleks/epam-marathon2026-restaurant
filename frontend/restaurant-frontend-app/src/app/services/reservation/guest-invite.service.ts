import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { SKIP_ERROR_TOAST } from '@app/auth/skip-error-toast.context';
import { Observable } from 'rxjs';
import { GroupInviteToken, GuestInvite } from '@app/models/reservations/guest-invite.model';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';

@Injectable({
  providedIn: 'root',
})
export class GuestInviteService {
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);

  getInviteToken$(reservationId: string, silent = false): Observable<GroupInviteToken> {
    return this.http.get<GroupInviteToken>(
      `${this.baseUrl}/reservations/${encodeURIComponent(reservationId)}/invite-token`,
      { context: new HttpContext().set(SKIP_ERROR_TOAST, silent) },
    );
  }

  getInvite$(token: string): Observable<GuestInvite> {
    return this.http.get<GuestInvite>(`${this.baseUrl}/guest/invites/${encodeURIComponent(token)}`);
  }
}
