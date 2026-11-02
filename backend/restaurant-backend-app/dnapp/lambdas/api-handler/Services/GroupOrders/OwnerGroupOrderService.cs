using APIHandler.Constants;
using APIHandler.Constants.Dishes;
using APIHandler.Entities;
using APIHandler.Exceptions;
using APIHandler.Mappers;
using APIHandler.Models.GuestSessions;
using APIHandler.Models.GuestReservation;
using APIHandler.Models.Orders;
using APIHandler.Repositories.Dishes;
using APIHandler.Repositories.GroupReservations;
using APIHandler.Repositories.GuestSessions;
using APIHandler.Repositories.Orders;
using APIHandler.Repositories.Reservations;
using APIHandler.Repositories.Tables;
using APIHandler.Services.Auth;
using APIHandler.Services.Locations;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace APIHandler.Services.GroupOrders;

public class OwnerGroupOrderService(
    IGroupReservationRepository groups, IReservationRepository reservations,
    IGuestSessionRepository sessions, IOrderRepository orders, IDishRepository dishes,
    IUserService users, ITableRepository tables, ILocationService locations,
    IGroupOrderCommitter committer)
{
    public static string OwnerSessionId(string groupId) => "owner-" + groupId;

    private async Task<(GroupReservation Group, Reservation Reservation)> RequireOwner(string userId, string groupId)
    {
        var group = await groups.GetGroupReservationByIdAsync(groupId) ?? throw new GroupReservationNotFoundException();
        var reservation = await reservations.GetReservationByIdAsync(group.ReservationId) ?? throw new ReservationNotFoundException("Reservation not found.");
        if (reservation.CustomerId != userId) throw new ActionForbiddenException("Only the reservation owner can manage this group.");
        return (group, reservation);
    }

    private async Task<GuestSession> OwnerSession(GroupReservation group, Reservation reservation, Order? order)
    {
        // Before submission the owner's existing individual order is the source of truth.
        // At submission its original snapshot is saved atomically, so the consolidated
        // order cannot later be counted a second time as the owner's own basket.
        var saved = await sessions.GetByGuestSessionId(OwnerSessionId(group.GroupReservationId));
        if (group.Status != GroupReservationStatus.Open && saved is not null) return saved;
        return new GuestSession {
            Id = OwnerSessionId(group.GroupReservationId), GroupReservationId = group.GroupReservationId,
            GuestName = await users.GetUserName(reservation.CustomerId!) ?? "Owner",
            IsOwnerSession = true, OwnerUserId = reservation.CustomerId,
            Dishes = order?.Dishes.Select(item => new OrderItem { DishId = item.DishId, Quantity = item.Quantity, State = item.State }).ToList() ?? [],
            IsSubmitted = order?.Status is OrderStatus.SubmittedByCustomer or OrderStatus.Submitted
        };
    }

    public async Task<string> GetOwnerSessionIdAsync(string userId, string reservationId)
    {
        var reservation = await reservations.GetReservationByIdAsync(reservationId) ?? throw new ReservationNotFoundException("Reservation not found.");
        if (reservation.CustomerId != userId) throw new ActionForbiddenException("Only the reservation owner can access this session.");
        var group = await groups.GetByReservationIdAsync(reservationId) ?? throw new GroupReservationNotFoundException();
        return OwnerSessionId(group.GroupReservationId);
    }

    public async Task<GetGroupReservationResponse> GetDetailsAsync(string userId, string reservationId)
    {
        var group = await groups.GetByReservationIdAsync(reservationId) ?? throw new GroupReservationNotFoundException();
        var (_, reservation) = await RequireOwner(userId, group.GroupReservationId);
        var table = await tables.GetTableAsync(reservation.TableId) ?? throw new ValidationException("Table not found.");
        var location = await locations.GetLocationByIdAsync(table.LocationId);
        return new GetGroupReservationResponse(group.GroupReservationId, table.LocationId, "Green & Tasty", location?.Address ?? "", reservation.StartTime, reservation.EndTime, reservation.GuestCount, table.TableNumber, await users.GetUserName(userId) ?? "Owner");
    }

    public async Task<GetAllSessionsResponse> GetSessionsAsync(string userId, string groupId)
    {
        var (group, reservation) = await RequireOwner(userId, groupId);
        var order = await orders.GetOrderByReservationIdAsync(reservation.Id);
        var owner = await OwnerSession(group, reservation, order);
        var guests = await sessions.GetAllByGroupReservationIdAsync(groupId);
        var all = new[] { owner }.Concat(guests.Where(session => !session.IsOwnerSession)).ToArray();
        var ids = all.SelectMany(session => session.Dishes).Select(item => item.DishId).Distinct().ToArray();
        var catalog = (ids.Length == 0 ? Array.Empty<Dish>() : await dishes.GetDishesByIdsAsync(ids)).ToDictionary(dish => dish.Id);
        var participants = all.Select(session => {
            var items = session.Dishes.Where(item => catalog.ContainsKey(item.DishId)).Select(item => new OrderItemResponse { Dish = DishMapper.ToDishResponse(catalog[item.DishId]), Quantity = item.Quantity }).ToArray();
            return new Participant(session.Id, session.IsOwnerSession ? ParticipantType.Owner : ParticipantType.Guest, session.GuestName, items, items.Sum(item => item.Dish.Price * item.Quantity), session.IsSubmitted);
        }).ToArray();
        return new GetAllSessionsResponse(participants, participants.Sum(person => person.Total));
    }

    public async Task<GetAllSessionsResponse> RemoveAsync(string userId, string groupId, string sessionId)
    {
        var (group, _) = await RequireOwner(userId, groupId);
        if (group.Status != GroupReservationStatus.Open) throw new ValidationException("This group is read-only.");
        if (sessionId == OwnerSessionId(groupId)) throw new ValidationException("The owner cannot be removed.");
        var session = await sessions.GetByGuestSessionId(sessionId) ?? throw new GuestSessionNotFoundException("Guest session not found.");
        if (session.GroupReservationId != groupId || session.IsOwnerSession) throw new ValidationException("Guest session does not belong to this group or is the owner.");
        await committer.RemoveAsync(group, session);
        // Build from the returned list, excluding a deleted item even during GSI propagation.
        var snapshot = await GetSessionsAsync(userId, groupId);
        var participants = snapshot.Participants.Where(person => person.Id != sessionId).ToArray();
        return new GetAllSessionsResponse(participants, participants.Sum(person => person.Total));
    }

    public async Task<List<OrderItem>> SubmitAsync(string userId, string groupId, string reservationId)
    {
        var (group, reservation) = await RequireOwner(userId, groupId);
        if (group.ReservationId != reservationId) throw new ValidationException("Reservation does not belong to this group.");
        if (group.Status != GroupReservationStatus.Open) throw new ValidationException("This group has already been submitted or closed.");
        if (reservation.Status != ReservationStatus.Reserved || reservation.StartTime <= DateTime.UtcNow) throw new ValidationException("Reservation is no longer open for pre-orders.");
        var order = await orders.GetOrderByReservationIdAsync(reservationId) ?? throw new ValidationException("No order found for this reservation. Create your own pre-order first.");
        var owner = await OwnerSession(group, reservation, order);
        var all = await sessions.GetAllByGroupReservationIdAsync(groupId);
        var submitted = all.Where(session => !session.IsOwnerSession && session.IsSubmitted).Append(owner).Where(session => session.IsSubmitted).ToArray();
        if (submitted.Length == 0) throw new ValidationException("No submitted sessions.");
        var consolidated = submitted.SelectMany(session => session.Dishes).GroupBy(item => item.DishId).Select(items => new OrderItem { DishId = items.Key, Quantity = checked(items.Sum(item => item.Quantity)) }).ToList();
        if (consolidated.Count == 0) throw new ValidationException("Submitted sessions contain no dishes.");
        if (consolidated.Any(item => item.Quantity <= 0)) throw new ValidationException("Invalid dish quantity.");
        var catalog = (await dishes.GetDishesByIdsAsync(consolidated.Select(item => item.DishId))).ToDictionary(dish => dish.Id);
        if (consolidated.Any(item => !catalog.TryGetValue(item.DishId, out var dish) || dish.State != DishState.Available)) throw new ValidationException("A submitted dish is no longer available.");
        await committer.SubmitAsync(group, order, owner, consolidated);
        return consolidated;
    }
}
