# Green & Tasty — AWS Deployment

Навчальний ресторанний застосунок: Angular frontend, .NET backend та інфраструктура AWS.

**[Відкрити сайт](https://d2e716owoxyulz.cloudfront.net)** · **Регіон AWS: `eu-north-1`**

## Можливості

- Реєстрація та вхід користувачів через Amazon Cognito.
- Каталог страв із фото, цінами та описами.
- Локації ресторану, пошук доступних столиків і бронювання.
- Попереднє замовлення страв, кошик та підтвердження pre-order.
- Owner Group Pre-Order: кошики гостей, підтверджені страви, консолідація за dishId, Grand Total, Submit та Remove Guest.
- Автоматичне оновлення Owner-екрана кожні 15 секунд; після Submit — режим перегляду.
- Перевірка авторизації приватних маршрутів та ролей для адміністративних дій.

Демо наповнено 4 стравами, 3 локаціями й 12 столиками. Це навчальний застосунок; замовлення демонстраційні, платіжна система не підключена. Для тестування створіть власний акаунт на сайті. Паролі та готові облікові дані в репозиторії не публікуються.

## Архітектура

```text
Browser → CloudFront → private S3 bucket (Angular)
       → API Gateway → .NET 10 Lambda → DynamoDB / Cognito / S3
                                      SQS / scheduled reports
```

Усі регіональні ресурси розгортаються в `eu-north-1`. CloudFront є глобальним сервісом. Terraform керує спільною інфраструктурою; AWS Syndicate збирає та розгортає backend.

## Структура

- `frontend/restaurant-frontend-app/` — Angular застосунок.
- `backend/restaurant-backend-app/` — .NET Lambda, API та тести.
- `infra/terraform/` — спільна інфраструктура AWS.
- `docs/deployment-guide.md` — послідовність розгортання та видалення ресурсів.
- `homework-backend.md` — контракт реалізованих Owner API; [звіт реалізації](docs/homework-owner-preorder.md) описує виконані рівні та перевірки.

## Локальний запуск frontend

Потрібні Node.js `24.15+` у гілці 24 (або сумісна версія з `package.json`) та npm.

```bash
cd frontend/restaurant-frontend-app
npm ci
npm start
```

Відкрийте `http://localhost:4200`. Development-конфігурація використовує розгорнутий демонстраційний API. Для власного backend змініть `src/environments/environment.development.ts`.

Production build:

```bash
BACKEND_URL=https://YOUR_API_ID.execute-api.eu-north-1.amazonaws.com/develop npm run build
```

## Backend та перевірки

Потрібен .NET 10 SDK.

```bash
cd backend/restaurant-backend-app
dotnet build restaurant-backend-app.sln --configuration Release
dotnet test Tests/APIHandler.Tests.csproj --filter FullyQualifiedName~RequestAuthorizationTests
```

Перевірка виправлення часового поясу frontend (потрібен Chrome):

```bash
cd frontend/restaurant-frontend-app
npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/services/pre-orders/pre-orders.service.spec.ts
```

Перевірено: production build Angular; 8 тестів авторизації backend; 3 тести часу frontend; робота сайту, реєстрації, бронювання та pre-order через браузер.

## Власне розгортання AWS

Дотримуйтеся [інструкції розгортання](docs/deployment-guide.md). Перед виконанням:

1. Увійдіть через `aws login --profile <profile> --region eu-north-1`.
2. Замініть `YOUR_AWS_ACCOUNT_ID` і `YOUR_USER_POOL_ID` у конфігурації на власні значення. Cognito user pool створюється Terraform перед backend.
3. У `syndicate.yml` вкажіть свій абсолютний `project_path`.
4. Передайте Terraform `account_id` через локальний `terraform.tfvars` або `TF_VAR_account_id`. Налаштуйте унікальне приватне сховище Terraform state.
5. Перевірте `terraform plan` перед `apply`, потім розгорніть backend і frontend у порядку README.

Локальні credentials, Terraform state, залежності, зібрані пакети й журнали виключено з Git. Шаблони конфігурації потрібно адаптувати до свого AWS project. AWS-ресурси можуть витрачати кредити: після завершення роботи видаліть їх за інструкцією cleanup.

## Зміни цього розгортання

- Адаптація конфігурації до `eu-north-1`.
- Централізована перевірка Cognito JWT і ролей; обмеження IAM дозволів ресурсами застосунку.
- Узгоджене відображення часу бронювання в кошику та картці бронювання за часовим поясом браузера.
- Регресійні тести авторизації й часу.

## Походження

Базовий код надано в матеріалах EPAM IT Marathon 6.0 / Green & Tasty, проєкт [IT-Marathon/marathon2026](https://github.com/IT-Marathon/marathon2026). Цей репозиторій містить навчальне AWS-розгортання та подальші зміни. Позначення авторів у вихідних файлах збережено.


## Owner Group Pre-Order (v1.2.0)

Відкрийте **Reservations → Group Pre-Order** у бронюванні на двох або більше гостей. Реалізовано всі три рівні backend, frontend з реальним API, синхронізацію та Remove Guest. [Деталі, тести та скріншоти](docs/homework-owner-preorder.md).
