using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;

namespace APIHandler.Helpers;

public static class RequestAuthorization
{
    // Exact templates: new routes require authentication unless explicitly reviewed.
    private static readonly HashSet<string> PublicRoutes = [
        "POST /register", "POST /signin",
        "GET /locations", "GET /locations/{id}", "GET /locations/{id}/dishes",
        "GET /dishes", "GET /dishes/popular", "GET /dishes/{id}",
        "GET /available-tables", "GET /tables/{id}/available-time-slots", "GET /feedback",
        "POST /guest/sessions", "GET /guest/invites/{token}",
        "GET /guest/groups/{groupReservationId}/status"
    ];

    // These handlers validate the separate, unguessable guest session token.
    private static readonly HashSet<string> GuestRoutes = [
        "GET /guest/sessions/{guestSessionId}",
        "GET /guest/sessions/{guestSessionId}/menu",
        "POST /guest/sessions/{guestSessionId}/dishes",
        "DELETE /guest/sessions/{guestSessionId}/dishes",
        "POST /guest/sessions/{guestSessionId}/submit"
    ];

    public static async Task<APIGatewayProxyResponse?> AuthorizeAsync(
        APIGatewayProxyRequest request, string template, ILambdaLogger logger,
        Func<string, Task<ClaimsIdentity?>>? validateToken = null)
    {
        string route = request.HttpMethod.ToUpperInvariant() + " " + template;
        if (PublicRoutes.Contains(route) || GuestRoutes.Contains(route)) return null;

        string? header = request.Headers?.FirstOrDefault(
            h => string.Equals(h.Key, "Authorization", StringComparison.OrdinalIgnoreCase)).Value;
        if (header is null || !header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return ResponseBuilder.CreateErrorResponse(401, "Authentication required", logger);

        ClaimsIdentity? identity;
        try
        {
            identity = await (validateToken ?? CognitoIdTokenValidator.ValidateAsync)(header[7..]);
        }
        catch
        {
            return ResponseBuilder.CreateErrorResponse(401, "Invalid or expired token", logger);
        }
        if (identity?.FindFirst("sub") is null)
            return ResponseBuilder.CreateErrorResponse(401, "Invalid or expired token", logger);

        var claims = identity.Claims.GroupBy(c => c.Type).ToDictionary(
            g => g.Key, g => string.Join(",", g.Select(c => c.Value)));
        request.RequestContext ??= new APIGatewayProxyRequest.ProxyRequestContext();
        request.RequestContext.Authorizer = new APIGatewayCustomAuthorizerContext { Claims = claims };

        bool managesCatalog = request.HttpMethod != "GET" &&
            (template == "/locations" || template.StartsWith("/locations/") ||
             template == "/dishes" || template.StartsWith("/dishes/") ||
             template == "/tables" || template.StartsWith("/tables/"));
        if ((managesCatalog || template == "/waiters" || template == "/users" ||
             template.StartsWith("/reports") || template.StartsWith("/notifications")) &&
            !RoleHelper.IsWaiter(request))
            return ResponseBuilder.CreateErrorResponse(403, "Staff access required", logger);

        return null;
    }
}
