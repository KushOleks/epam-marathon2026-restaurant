using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using APIHandler.Exceptions;
using APIHandler.Helpers;
using APIHandler.Services.GroupOrders;
using System;
using System.Text.Json;
using System.Threading.Tasks;
namespace APIHandler.Handlers.GroupReservations;

public class OwnerGroupOrderHandler(OwnerGroupOrderService service) : IApiRequestHandler
{
    public async Task<APIGatewayProxyResponse> HandleRequest(APIGatewayProxyRequest request, ILambdaContext context)
    {
        var userId = UserContextHelper.GetAuthenticatedUserId(request);
        if (string.IsNullOrEmpty(userId)) return ResponseBuilder.CreateJsonResponse(401, new { error = "Authentication required." });
        try {
            request.PathParameters.TryGetValue("reservationId", out var reservationId);
            request.PathParameters.TryGetValue("groupReservationId", out var groupId);
            if (request.HttpMethod == "GET" && request.Path.EndsWith("/guest-session-id")) return ResponseBuilder.CreateJsonResponse(200, new { guestSessionId = await service.GetOwnerSessionIdAsync(userId, reservationId!) });
            if (request.HttpMethod == "GET" && request.Path.EndsWith("/group-order")) return ResponseBuilder.CreateSuccessResponse(await service.GetDetailsAsync(userId, reservationId!));
            if (request.HttpMethod == "DELETE") return ResponseBuilder.CreateJsonResponse(200, await service.RemoveAsync(userId, groupId!, request.PathParameters["guestSessionId"]));
            if (request.HttpMethod == "GET") return ResponseBuilder.CreateJsonResponse(200, await service.GetSessionsAsync(userId, groupId!));
            using var body = JsonDocument.Parse(request.Body ?? "{}");
            if (!body.RootElement.TryGetProperty("reservationId", out var value) || value.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(value.GetString())) return ResponseBuilder.CreateJsonResponse(400, new { error = "reservationId is required." });
            return ResponseBuilder.CreateJsonResponse(200, await service.SubmitAsync(userId, groupId!, value.GetString()!));
        }
        catch (JsonException) { return ResponseBuilder.CreateJsonResponse(400, new { error = "Invalid JSON body." }); }
        catch (ActionForbiddenException error) { return ResponseBuilder.CreateJsonResponse(403, new { error = error.Message }); }
        catch (Exception error) when (error is GroupReservationNotFoundException or ReservationNotFoundException or GuestSessionNotFoundException) { return ResponseBuilder.CreateJsonResponse(404, new { error = error.Message }); }
        catch (ValidationException error) { return ResponseBuilder.CreateJsonResponse(400, new { error = error.Message }); }
    }
}
