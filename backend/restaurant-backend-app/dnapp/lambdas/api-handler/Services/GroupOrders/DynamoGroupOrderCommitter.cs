using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using APIHandler.Constants;
using APIHandler.Entities;
using APIHandler.Exceptions;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
namespace APIHandler.Services.GroupOrders;

public class DynamoGroupOrderCommitter(IAmazonDynamoDB database) : IGroupOrderCommitter
{
    private static AttributeValue Text(string value) => new() { S = value };
    private static AttributeValue Number(int value) => new() { N = value.ToString(CultureInfo.InvariantCulture) };
    private static AttributeValue Items(IEnumerable<OrderItem> items) => new() { L = items.Select(item => new AttributeValue { M = new() { ["dishId"] = Text(item.DishId), ["quantity"] = Number(item.Quantity), ["state"] = Number((int)item.State) } }).ToList() };
    public async Task SubmitAsync(GroupReservation group, Order order, GuestSession owner, List<OrderItem> items)
    {
        // Order contents, group status and the original owner basket commit together.
        // A second/concurrent submit fails the Open condition instead of duplicating dishes.
        var request = new TransactWriteItemsRequest { TransactItems = [
            new() { Update = new Update { TableName = ResourceNames.GroupReservationsTableName,
                Key = new() { ["groupReservationId"] = Text(group.GroupReservationId) },
                UpdateExpression = "SET #status = :submitted", ConditionExpression = "#status = :open",
                ExpressionAttributeNames = new() { ["#status"] = "status" }, ExpressionAttributeValues = new() { [":submitted"] = Number((int)GroupReservationStatus.Submitted), [":open"] = Number((int)GroupReservationStatus.Open) } } },
            new() { Update = new Update { TableName = ResourceNames.OrdersTableName,
                Key = new() { ["orderId"] = Text(order.OrderId), ["customerId"] = Text(order.CustomerId) },
                UpdateExpression = "SET dishes = :dishes, #status = :submitted", ConditionExpression = "attribute_exists(orderId) AND #status <> :cancelled",
                ExpressionAttributeNames = new() { ["#status"] = "status" }, ExpressionAttributeValues = new() { [":dishes"] = Items(items), [":submitted"] = Number((int)OrderStatus.SubmittedByCustomer), [":cancelled"] = Number((int)OrderStatus.Cancelled) } } },
            new() { Put = new Put { TableName = ResourceNames.GuestSessionTableName, Item = new() {
                ["guestSessionId"] = Text(owner.Id), ["groupReservationId"] = Text(owner.GroupReservationId),
                ["guestName"] = Text(owner.GuestName), ["isOwnerSession"] = new() { BOOL = true },
                ["ownerUserId"] = Text(owner.OwnerUserId!), ["isSubmitted"] = new() { BOOL = owner.IsSubmitted }, ["dishes"] = Items(owner.Dishes)
            } } }
        ] };
        try { await database.TransactWriteItemsAsync(request); }
        catch (TransactionCanceledException) { throw new ValidationException("The group changed while submitting. Refresh before trying again."); }
    }
    public async Task RemoveAsync(GroupReservation group, GuestSession session)
    {
        try {
            await database.TransactWriteItemsAsync(new TransactWriteItemsRequest { TransactItems = [
                new() { ConditionCheck = new ConditionCheck { TableName = ResourceNames.GroupReservationsTableName,
                    Key = new() { ["groupReservationId"] = Text(group.GroupReservationId) }, ConditionExpression = "#status = :open",
                    ExpressionAttributeNames = new() { ["#status"] = "status" }, ExpressionAttributeValues = new() { [":open"] = Number((int)GroupReservationStatus.Open) } } },
                new() { Delete = new Delete { TableName = ResourceNames.GuestSessionTableName,
                    Key = new() { ["guestSessionId"] = Text(session.Id) },
                    ConditionExpression = "groupReservationId = :groupId",
                    ExpressionAttributeValues = new() { [":groupId"] = Text(group.GroupReservationId) } } }
            ] });
        }
        catch (TransactionCanceledException) { throw new ValidationException("The group changed while removing this guest. Refresh before trying again."); }
    }

}
