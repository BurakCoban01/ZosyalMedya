using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Profiles.Domain.Profiles;

namespace ZosyalMedya.Modules.Profiles.Application.Ports;

public interface IProfileRepository : IRepository<Profile, ProfileId>;
