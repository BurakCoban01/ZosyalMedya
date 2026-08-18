using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Administration.Domain.Configuration;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Administration;
public sealed class AdministrationDomainTests
{
    [Fact] public void FlagsAreDeterministicAndSecretSettingsAreRejected()
    { var now=DateTimeOffset.UtcNow;var flag=FeatureFlag.Create(FeatureFlagId.New(),"feed.experimental","Deney",true,50,now);var user=Guid.NewGuid();Assert.Equal(flag.IsEnabled(user),flag.IsEnabled(user));Assert.Throws<DomainRuleException>(()=>SystemSetting.Create("jwt.secret","\"x\"","yasak",now)); }
}
