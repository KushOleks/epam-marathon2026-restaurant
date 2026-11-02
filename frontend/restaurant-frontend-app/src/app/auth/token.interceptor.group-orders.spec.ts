import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthenticationService } from './services/authentication.service';
import { ToastService } from '@app/services/toast/toast.service';
import { SKIP_ERROR_TOAST } from './skip-error-toast.context';
import { tokenInterceptor } from './token.interceptor';

describe('Owner versus guest tokens', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let toast: jasmine.SpyObj<ToastService>;
  beforeEach(() => {
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['error']);
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([tokenInterceptor])), provideHttpClientTesting(),
      { provide: AuthenticationService, useValue: { getTokens: () => ({ idToken: 'owner-jwt' }) } },
      { provide: ToastService, useValue: toast },
    ] });
    client = TestBed.inject(HttpClient); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('adds the owner JWT to the group sessions endpoint', () => {
    client.get('/guest/groups/group/sessions').subscribe();
    const request = http.expectOne('/guest/groups/group/sessions');
    expect(request.request.headers.get('Authorization')).toBe('Bearer owner-jwt');
    request.flush({});
  });
  it('adds the owner JWT when removing a guest', () => {
    client.delete('/guest/groups/group/sessions/guest').subscribe();
    const request = http.expectOne('/guest/groups/group/sessions/guest');
    expect(request.request.headers.get('Authorization')).toBe('Bearer owner-jwt');
    request.flush({});
  });
  it('preserves the separate guest session token', () => {
    client.get('/guest/sessions/session', { headers: { Authorization: 'Bearer guest-token' } }).subscribe();
    const request = http.expectOne('/guest/sessions/session');
    expect(request.request.headers.get('Authorization')).toBe('Bearer guest-token');
    request.flush({});
  });
  it('does not show a toast for a silent status refresh', () => {
    client.get('/guest/groups/group/status', { context: new HttpContext().set(SKIP_ERROR_TOAST, true) }).subscribe({ error: () => undefined });
    http.expectOne('/guest/groups/group/status').flush({}, { status: 500, statusText: 'Server error' });
    expect(toast.error).not.toHaveBeenCalled();
  });
});
