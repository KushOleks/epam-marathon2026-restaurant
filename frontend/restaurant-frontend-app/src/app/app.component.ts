import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { GroupOrderDrawerService } from './services/group-orders/group-order-drawer.service';
import { GroupOrderDrawerComponent } from './components/group-orders/group-order-drawer/group-order-drawer.component';
import { RouterOutlet } from '@angular/router';
import {} from './auth/components/register/register.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, GroupOrderDrawerComponent],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly groupDrawer = inject(GroupOrderDrawerService);
  title = 'restaurant-frontend-app';

  // constructor(private reportService: ReportsService) {
  //   this.reportService.downloadReportPdf(0, '2025-07-04', '2025-07-07', '95e66d7f-b38a-423b-a052-ca0fb4092e45');
  //   this.reportService.downloadReportExcel(0, '2025-07-04', '2025-07-07', '95e66d7f-b38a-423b-a052-ca0fb4092e45');
  //   this.reportService.downloadReportCsv(0, '2025-07-04', '2025-07-07', '95e66d7f-b38a-423b-a052-ca0fb4092e45');
  // }
}
