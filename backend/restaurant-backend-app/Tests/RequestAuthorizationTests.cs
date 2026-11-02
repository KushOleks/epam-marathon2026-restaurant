using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using APIHandler.Helpers;
using Moq;
using System.Security.Claims;

public class RequestAuthorizationTests
{
    [Theory]
    [InlineData("POST", "/waiters")]
    [InlineData("POST", "/locations")]
    [InlineData("DELETE", "/dishes/{id}")]
    [InlineData("GET", "/reservations")]
    [InlineData("GET", "/new-private-route")]
    public async Task MissingTokenDeniesPrivateAndUnknownRoutes(string method, string route)
    {
        var result = await RequestAuthorization.AuthorizeAsync(
            new() { HttpMethod = method }, route, Mock.Of<ILambdaLogger>());
        Assert.Equal(401, result?.StatusCode);
    }

    [Fact]
    public async Task ForgedTokenCannotAccessPrivateData()
    {
        var result = await RequestAuthorization.AuthorizeAsync(
            new() { HttpMethod = "GET", Headers = new Dictionary<string, string> { ["Authorization"] = "Bearer forged" } },
            "/reservations", Mock.Of<ILambdaLogger>(), _ => Task.FromResult<ClaimsIdentity?>(null));
        Assert.Equal(401, result?.StatusCode);
    }

    [Fact]
    public async Task CustomerCannotPromoteWaiters()
    {
        var result = await RequestAuthorization.AuthorizeAsync(
            new() { HttpMethod = "POST", Headers = new Dictionary<string, string> { ["authorization"] = "Bearer valid" } },
            "/waiters", Mock.Of<ILambdaLogger>(), _ => Task.FromResult<ClaimsIdentity?>(
                new ClaimsIdentity([new Claim("sub", "customer"), new Claim("cognito:groups", "Customer")])));
        Assert.Equal(403, result?.StatusCode);
    }

    [Fact]
    public async Task PublicMenuDoesNotRequireLogin()
    {
        var result = await RequestAuthorization.AuthorizeAsync(
            new() { HttpMethod = "GET" }, "/dishes", Mock.Of<ILambdaLogger>());
        Assert.Null(result);
    }
}
