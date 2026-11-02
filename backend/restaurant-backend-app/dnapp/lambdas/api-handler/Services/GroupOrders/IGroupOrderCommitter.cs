using APIHandler.Entities;
using System.Collections.Generic;
using System.Threading.Tasks;
namespace APIHandler.Services.GroupOrders;
public interface IGroupOrderCommitter
{
    Task RemoveAsync(GroupReservation group, GuestSession session);
    Task SubmitAsync(GroupReservation group, Order order, GuestSession owner, List<OrderItem> items);
}
