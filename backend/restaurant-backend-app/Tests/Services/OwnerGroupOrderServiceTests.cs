using APIHandler.Constants;
using APIHandler.Constants.Dishes;
using APIHandler.Entities;
using APIHandler.Exceptions;
using APIHandler.Repositories.Dishes;
using APIHandler.Repositories.GroupReservations;
using APIHandler.Repositories.GuestSessions;
using APIHandler.Repositories.Orders;
using APIHandler.Repositories.Reservations;
using APIHandler.Repositories.Tables;
using APIHandler.Services.Auth;
using APIHandler.Services.GroupOrders;
using APIHandler.Services.Locations;
using Moq;

namespace APIHandler.Tests.Services;

public class OwnerGroupOrderServiceTests
{
    private readonly Mock<IGroupReservationRepository> groups = new();
    private readonly Mock<IReservationRepository> reservations = new();
    private readonly Mock<IGuestSessionRepository> sessions = new();
    private readonly Mock<IOrderRepository> orders = new();
    private readonly Mock<IDishRepository> dishes = new();
    private readonly Mock<IUserService> users = new();
    private readonly Mock<ITableRepository> tables = new();
    private readonly Mock<ILocationService> locations = new();
    private readonly Mock<IGroupOrderCommitter> committer = new();
    private readonly OwnerGroupOrderService service;
    private readonly GroupReservation group = new() { GroupReservationId = "group", ReservationId = "reservation", ReservationToken = "invite", Status = GroupReservationStatus.Open };
    private readonly Reservation reservation = new() { Id = "reservation", CustomerId = "owner", TableId = "table", WaiterId = "waiter", StartTime = DateTime.UtcNow.AddDays(2), GuestCount = 4, Status = ReservationStatus.Reserved };
    private readonly Order order = new() { OrderId = "order", CustomerId = "owner", ReservationId = "reservation", ReservationAddress = "Address", ReservationTime = "time", Status = OrderStatus.SubmittedByCustomer, Dishes = [new() { DishId = "dish", Quantity = 1 }] };
    private readonly List<GuestSession> guests = [
        new() { Id = "submitted", GroupReservationId = "group", GuestName = "Alex", IsSubmitted = true, Dishes = [new() { DishId = "dish", Quantity = 2 }] },
        new() { Id = "draft", GroupReservationId = "group", GuestName = "Maria", IsSubmitted = false, Dishes = [new() { DishId = "other", Quantity = 1 }] },
    ];

    public OwnerGroupOrderServiceTests()
    {
        service = new(groups.Object, reservations.Object, sessions.Object, orders.Object, dishes.Object, users.Object, tables.Object, locations.Object, committer.Object);
        groups.Setup(repository => repository.GetGroupReservationByIdAsync("group")).ReturnsAsync(group);
        groups.Setup(repository => repository.GetByReservationIdAsync("reservation")).ReturnsAsync(group);
        reservations.Setup(repository => repository.GetReservationByIdAsync("reservation")).ReturnsAsync(reservation);
        orders.Setup(repository => repository.GetOrderByReservationIdAsync("reservation")).ReturnsAsync(order);
        sessions.Setup(repository => repository.GetAllByGroupReservationIdAsync("group")).ReturnsAsync(() => guests.ToList());
        sessions.Setup(repository => repository.GetByGuestSessionId(It.IsAny<string>())).ReturnsAsync((string id) => guests.FirstOrDefault(session => session.Id == id));
        users.Setup(repository => repository.GetUserName("owner")).ReturnsAsync("Owner Name");
        dishes.Setup(repository => repository.GetDishesByIdsAsync(It.IsAny<IEnumerable<string>>())).ReturnsAsync(new[] {
            new Dish { Id = "dish", Name = "Salad", Price = 10, State = DishState.Available },
            new Dish { Id = "other", Name = "Bowl", Price = 20, State = DishState.Available },
        });
    }

    [Fact]
    public async Task SnapshotIncludesOwnerDraftsAndPerParticipantTotals()
    {
        var snapshot = await service.GetSessionsAsync("owner", "group");
        Assert.Equal(50, snapshot.Total);
        Assert.Equal(new decimal[] { 10, 20, 20 }, snapshot.Participants.Select(person => person.Total));
        Assert.Equal("Owner", snapshot.Participants.First().Type.ToString());
        Assert.Equal("Owner Name", snapshot.Participants.First().Name);
        Assert.Equal("owner-group", snapshot.Participants.First().Id);
        Assert.False(snapshot.Participants.Last().IsSubmitted);
    }

    [Fact]
    public async Task SubmitCombinesIdenticalDishesAndExcludesDraftGuests()
    {
        var result = await service.SubmitAsync("owner", "group", "reservation");
        Assert.Single(result);
        Assert.Equal("dish", result[0].DishId);
        Assert.Equal(3, result[0].Quantity);
        committer.Verify(repository => repository.SubmitAsync(group, order, It.Is<GuestSession>(owner => owner.IsOwnerSession && owner.Dishes.Single().Quantity == 1), It.Is<List<OrderItem>>(items => items.Single().Quantity == 3)), Times.Once);
        Assert.Equal(1, order.Dishes.Single().Quantity); // input snapshot is not mutated
    }

    [Fact]
    public async Task OwnerSessionIdIsStableAndOwnerOnly()
    {
        Assert.Equal("owner-group", await service.GetOwnerSessionIdAsync("owner", "reservation"));
        await Assert.ThrowsAsync<ActionForbiddenException>(() => service.GetOwnerSessionIdAsync("stranger", "reservation"));
    }

    [Theory]
    [InlineData("snapshot")]
    [InlineData("submit")]
    [InlineData("remove")]
    public async Task ForeignOwnerCannotReadOrMutateGroup(string operation)
    {
        await Assert.ThrowsAsync<ActionForbiddenException>(async () => {
            if (operation == "snapshot") await service.GetSessionsAsync("stranger", "group");
            else if (operation == "submit") await service.SubmitAsync("stranger", "group", "reservation");
            else await service.RemoveAsync("stranger", "group", "draft");
        });
        committer.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task MissingGroupReturnsNotFound() => await Assert.ThrowsAsync<GroupReservationNotFoundException>(() => service.GetSessionsAsync("owner", "missing"));

    [Fact]
    public async Task MissingReservationReturnsNotFound()
    {
        reservations.Setup(repository => repository.GetReservationByIdAsync("reservation")).ReturnsAsync((Reservation?)null);
        await Assert.ThrowsAsync<ReservationNotFoundException>(() => service.GetSessionsAsync("owner", "group"));
    }

    [Fact]
    public async Task MissingOrderIsRejected()
    {
        orders.Setup(repository => repository.GetOrderByReservationIdAsync("reservation")).ReturnsAsync((Order?)null);
        await Assert.ThrowsAsync<ValidationException>(() => service.SubmitAsync("owner", "group", "reservation"));
    }

    [Fact]
    public async Task NoSubmittedSessionsIsRejected()
    {
        order.Status = OrderStatus.Created;
        guests.ForEach(session => session.IsSubmitted = false);
        await Assert.ThrowsAsync<ValidationException>(() => service.SubmitAsync("owner", "group", "reservation"));
        committer.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task SubmittedSessionsWithoutDishesAreRejected()
    {
        order.Dishes.Clear();
        guests.ForEach(session => session.Dishes.Clear());
        await Assert.ThrowsAsync<ValidationException>(() => service.SubmitAsync("owner", "group", "reservation"));
    }

    [Fact]
    public async Task DifferentReservationIsRejected() => await Assert.ThrowsAsync<ValidationException>(() => service.SubmitAsync("owner", "group", "other"));

    [Fact]
    public async Task AlreadySubmittedGroupCannotBeSubmittedAgain()
    {
        group.Status = GroupReservationStatus.Submitted;
        await Assert.ThrowsAsync<ValidationException>(() => service.SubmitAsync("owner", "group", "reservation"));
        committer.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task RemovedDishCannotBeSubmitted()
    {
        dishes.Setup(repository => repository.GetDishesByIdsAsync(It.IsAny<IEnumerable<string>>())).ReturnsAsync(Array.Empty<Dish>());
        await Assert.ThrowsAsync<ValidationException>(() => service.SubmitAsync("owner", "group", "reservation"));
    }

    [Fact]
    public async Task RemoveReturnsUpdatedSnapshotEvenIfIndexStillReturnsDeletedGuest()
    {
        var snapshot = await service.RemoveAsync("owner", "group", "draft");
        Assert.Equal(2, snapshot.Participants.Count());
        Assert.Equal(30, snapshot.Total);
        committer.Verify(repository => repository.RemoveAsync(group, guests[1]), Times.Once);
    }

    [Fact]
    public async Task OwnerCannotBeRemoved() => await Assert.ThrowsAsync<ValidationException>(() => service.RemoveAsync("owner", "group", "owner-group"));

    [Fact]
    public async Task MissingSessionReturnsNotFound() => await Assert.ThrowsAsync<GuestSessionNotFoundException>(() => service.RemoveAsync("owner", "group", "missing"));

    [Fact]
    public async Task ForeignGroupGuestCannotBeRemoved()
    {
        guests[1].GroupReservationId = "other";
        await Assert.ThrowsAsync<ValidationException>(() => service.RemoveAsync("owner", "group", "draft"));
    }

    [Fact]
    public async Task SubmittedGroupCannotLoseGuests()
    {
        group.Status = GroupReservationStatus.Submitted;
        await Assert.ThrowsAsync<ValidationException>(() => service.RemoveAsync("owner", "group", "draft"));
    }

    [Fact]
    public async Task SubmittedSnapshotKeepsOriginalOwnerCartRatherThanConsolidatedOrder()
    {
        group.Status = GroupReservationStatus.Submitted;
        order.Dishes[0].Quantity = 3;
        sessions.Setup(repository => repository.GetByGuestSessionId("owner-group")).ReturnsAsync(new GuestSession { Id = "owner-group", GroupReservationId = "group", GuestName = "Owner", IsOwnerSession = true, IsSubmitted = true, Dishes = [new() { DishId = "dish", Quantity = 1 }] });
        var snapshot = await service.GetSessionsAsync("owner", "group");
        Assert.Equal(10, snapshot.Participants.First().Total);
    }
}
