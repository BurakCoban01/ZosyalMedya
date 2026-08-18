param(
    [string]$ApiBaseUrl = 'http://localhost:58080',
    [string]$Password = $env:ESCP_DEMO_PASSWORD,
    [string]$AssetRoot = (Join-Path $PSScriptRoot 'fixtures/media'),
    [string]$PostgresContainer = 'zosyalmedya-postgres-1',
    [string]$PostgresUser = 'zosyalmedya',
    [string]$PostgresDatabase = 'zosyalmedya'
)

$ErrorActionPreference = 'Stop'
$ApiBaseUrl = $ApiBaseUrl.TrimEnd('/')
$AssetRoot = (Resolve-Path $AssetRoot).Path
$script:HeaderCache = @{}

if ([string]::IsNullOrWhiteSpace($Password)) {
    throw 'ESCP_DEMO_PASSWORD ortam değişkenini ayarla veya -Password parametresi ver.'
}

function Invoke-DemoApi {
    param(
        [Parameter(Mandatory)][string]$Method,
        [Parameter(Mandatory)][string]$Path,
        [hashtable]$Headers = @{},
        [object]$Body
    )
    $parameters = @{
        Method = $Method
        Uri = "$ApiBaseUrl$Path"
        Headers = $Headers
        UseBasicParsing = $true
    }
    if ($PSBoundParameters.ContainsKey('Body')) {
        $parameters.ContentType = 'application/json'
        $json = $Body | ConvertTo-Json -Depth 12 -Compress
        $parameters.Body = [System.Text.Encoding]::UTF8.GetBytes($json)
    }
    for ($attempt = 1; $attempt -le 2; $attempt++) {
        try {
            $response = Invoke-WebRequest @parameters
            if ([string]::IsNullOrWhiteSpace($response.Content)) { return $null }
            return $response.Content | ConvertFrom-Json
        }
        catch {
            $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
            if ($status -eq 429 -and $attempt -eq 1) {
                $retryAfter = 2
                $header = $_.Exception.Response.Headers['Retry-After']
                if ($header -and [int]::TryParse($header, [ref]$retryAfter)) {
                    $retryAfter = [Math]::Min(30, [Math]::Max(1, $retryAfter))
                }
                Start-Sleep -Seconds $retryAfter
                continue
            }
            throw "Demo API isteği başarısız: $Method $Path (HTTP $status)."
        }
    }
}

function Get-DemoHeaders {
    param([Parameter(Mandatory)][string]$Username)
    if ($script:HeaderCache.ContainsKey($Username)) { return $script:HeaderCache[$Username] }
    $login = Invoke-DemoApi -Method Post -Path '/api/v1/identity/login' -Body @{
        login = $Username
        password = $Password
        deviceId = "fixture-$Username"
        deviceName = 'Yerel fixture loader'
        mfaCode = $null
    }
    if (-not $login.tokens.accessToken) { throw "$Username için access token alınamadı." }
    $headers = @{ Authorization = "Bearer $($login.tokens.accessToken)" }
    $script:HeaderCache[$Username] = $headers
    return $headers
}

function Get-DemoPagedItems {
    param(
        [Parameter(Mandatory)][hashtable]$Headers,
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Label
    )
    $items = [System.Collections.Generic.List[object]]::new()
    $cursor = $null
    for ($pageNumber = 1; $pageNumber -le 200; $pageNumber++) {
        $pagePath = $Path
        if ($cursor) {
            $separator = if ($Path.Contains('?')) { '&' } else { '?' }
            $pagePath = "$Path${separator}cursor=$([Uri]::EscapeDataString([string]$cursor))"
        }
        $page = Invoke-DemoApi -Method Get -Path $pagePath -Headers $Headers
        foreach ($item in @($page.items)) { $items.Add($item) }
        if (-not $page.nextCursor) { return $items.ToArray() }
        $cursor = $page.nextCursor
    }
    throw "$Label için 10.000 kayıtlık güvenli tarama sınırı aşıldı; kopya fixture oluşturulmadı."
}

function Remove-DemoMedia {
    param([hashtable]$Headers, [Guid]$MediaId)
    try { Invoke-DemoApi -Method Delete -Path "/api/v1/media/$MediaId" -Headers $Headers | Out-Null }
    catch { Write-Warning "Başarısız fixture geri alma: $MediaId" }
}

function Add-DemoMedia {
    param(
        [Parameter(Mandatory)][hashtable]$Headers,
        [Parameter(Mandatory)][string]$FileName,
        [Parameter(Mandatory)][ValidateSet('Public','Followers','Private')][string]$Visibility
    )
    $file = Get-Item -LiteralPath (Join-Path $AssetRoot $FileName)
    $contentType = switch ($file.Extension.ToLowerInvariant()) {
        '.jpg' { 'image/jpeg' }
        '.jpeg' { 'image/jpeg' }
        '.png' { 'image/png' }
        '.webp' { 'image/webp' }
        '.mp4' { 'video/mp4' }
        default { throw "Desteklenmeyen fixture türü: $($file.Extension)" }
    }
    $initiated = Invoke-DemoApi -Method Post -Path '/api/v1/media/' -Headers $Headers -Body @{
        fileName = $file.Name
        contentType = $contentType
        size = $file.Length
        visibility = $Visibility
    }
    $mediaId = [Guid]$initiated.media.id
    try {
        $upload = Invoke-WebRequest -UseBasicParsing -Method Put -Uri "$ApiBaseUrl$($initiated.uploadUrl)" `
            -Headers $Headers -ContentType 'application/octet-stream' -InFile $file.FullName
        if ($upload.StatusCode -ne 200) { throw "Medya yükleme HTTP $($upload.StatusCode) döndürdü." }
        return $mediaId
    }
    catch {
        Remove-DemoMedia -Headers $Headers -MediaId $mediaId
        throw
    }
}

function Set-DemoProfileMedia {
    param([string]$Username, [string]$AvatarFile, [string]$CoverFile)
    $headers = Get-DemoHeaders -Username $Username
    $profile = Invoke-DemoApi -Method Get -Path '/api/v1/profiles/me' -Headers $headers
    if ($profile.profileMediaId -and $profile.coverMediaId) {
        Write-Host "$Username profil medyası zaten hazır."
        return
    }
    $created = [System.Collections.Generic.List[Guid]]::new()
    try {
        $visibility = if ($profile.isPrivate) { 'Followers' } else { 'Public' }
        $avatarId = if ($profile.profileMediaId) { [Guid]$profile.profileMediaId } else {
            $id = Add-DemoMedia -Headers $headers -FileName $AvatarFile -Visibility $visibility
            $created.Add($id); $id
        }
        $coverId = if ($profile.coverMediaId) { [Guid]$profile.coverMediaId } else {
            $id = Add-DemoMedia -Headers $headers -FileName $CoverFile -Visibility $visibility
            $created.Add($id); $id
        }
        Invoke-DemoApi -Method Put -Path '/api/v1/profiles/me' -Headers $headers -Body @{
            handle = $profile.handle
            displayName = $profile.displayName
            biography = $profile.biography
            location = $profile.location
            organization = $profile.organization
            websiteUrl = $profile.websiteUrl
            profileMediaId = $avatarId
            coverMediaId = $coverId
            isPrivate = $profile.isPrivate
            theme = $profile.theme
            language = $profile.language
            reduceMotion = $profile.reduceMotion
        } | Out-Null
        Write-Host "$Username avatar ve kapak medyası hazır."
    }
    catch {
        $failure = $_
        try {
            $current = Invoke-DemoApi -Method Get -Path '/api/v1/profiles/me' -Headers $headers
            $attached = @($current.profileMediaId, $current.coverMediaId) | Where-Object { $_ }
            foreach ($id in $created) {
                if ($attached -contains [string]$id) {
                    Write-Warning "$id profil tarafından kullanılıyor; belirsiz yanıt sonrası silinmedi."
                }
                else { Remove-DemoMedia -Headers $headers -MediaId $id }
            }
        }
        catch { Write-Warning 'Profil durumu doğrulanamadı; olası bağlı medya korundu.' }
        throw $failure
    }
}

function Set-DemoPostMedia {
    param([string]$Username, [Guid]$PostId, [string]$FileName)
    $headers = Get-DemoHeaders -Username $Username
    $post = Invoke-DemoApi -Method Get -Path "/api/v1/content/$PostId" -Headers $headers
    if (@($post.mediaIds).Count -gt 0) {
        Write-Host "$Username gönderi medyası zaten hazır: $PostId"
        return
    }
    $mediaId = Add-DemoMedia -Headers $headers -FileName $FileName -Visibility $post.visibility
    try {
        Invoke-DemoApi -Method Put -Path "/api/v1/content/$PostId" -Headers $headers -Body @{
            text = $post.text
            mediaIds = @($mediaId)
            visibility = $post.visibility
            linkUrl = $post.linkUrl
            contentWarning = $post.contentWarning
            isSensitive = $post.isSensitive
            expectedVersion = $post.version
        } | Out-Null
        Write-Host "$Username gönderisine gerçek medya eklendi: $PostId"
    }
    catch {
        $failure = $_
        try {
            $current = Invoke-DemoApi -Method Get -Path "/api/v1/content/$PostId" -Headers $headers
            if (@($current.mediaIds) -contains [string]$mediaId) {
                Write-Warning "$mediaId gönderiye bağlı; belirsiz yanıt sonrası silinmedi."
            }
            else { Remove-DemoMedia -Headers $headers -MediaId $mediaId }
        }
        catch { Write-Warning 'Gönderi durumu doğrulanamadı; olası bağlı medya korundu.' }
        throw $failure
    }
}

function New-DemoPostWithMedia {
    param(
        [hashtable]$Headers,
        [string]$Text,
        [string]$FileName,
        [ValidateSet('Original','Quote')][string]$ShareKind,
        [Guid]$OriginalPostId = [Guid]::Empty
    )
    $mediaId = Add-DemoMedia -Headers $Headers -FileName $FileName -Visibility Public
    try {
        Invoke-DemoApi -Method Post -Path '/api/v1/content/' -Headers $Headers -Body @{
            text = $Text
            mediaIds = @($mediaId)
            visibility = 'Public'
            shareKind = $ShareKind
            originalPostId = if ($OriginalPostId -eq [Guid]::Empty) { $null } else { $OriginalPostId }
            linkUrl = $null
            contentWarning = $null
            isSensitive = $false
            isDraft = $false
            publishAtUtc = $null
        } | Out-Null
    }
    catch {
        $failure = $_
        try {
            $profile = Invoke-DemoApi -Method Get -Path '/api/v1/profiles/me' -Headers $Headers
            $posts = @(Get-DemoPagedItems -Headers $Headers -Path "/api/v1/feed/Profile?profileId=$($profile.ownerId)&limit=50" -Label 'profil gönderileri')
            $committed = $posts | Where-Object {
                $_.content.text -eq $Text -and (@($_.content.mediaIds) -contains [string]$mediaId)
            }
            if ($committed) {
                Write-Warning "$mediaId oluşturulan gönderiye bağlı; belirsiz yanıt sonrası silinmedi."
            }
            else { Remove-DemoMedia -Headers $Headers -MediaId $mediaId }
        }
        catch { Write-Warning 'Yeni gönderi durumu doğrulanamadı; olası bağlı medya korundu.' }
        throw $failure
    }
}

function Set-DemoFixturePostText {
    param(
        [Parameter(Mandatory)][hashtable]$Headers,
        [object]$Item,
        [Parameter(Mandatory)][string]$Text
    )
    if (-not $Item -or $Item.content.text -eq $Text) { return }
    $content = $Item.content
    Invoke-DemoApi -Method Put -Path "/api/v1/content/$($content.id)" -Headers $Headers -Body @{
        text = $Text
        mediaIds = @($content.mediaIds)
        visibility = $content.visibility
        linkUrl = $content.linkUrl
        contentWarning = $content.contentWarning
        isSensitive = $content.isSensitive
        expectedVersion = $content.version
    } | Out-Null
    Write-Host "Fixture gönderi metni UTF-8 olarak yenilendi: $($content.id)"
}

function Set-DemoOwnedPosts {
    $headers = Get-DemoHeaders -Username 'emrekaraca'
    $profile = Invoke-DemoApi -Method Get -Path '/api/v1/profiles/me' -Headers $headers
    $items = @(Get-DemoPagedItems -Headers $headers -Path "/api/v1/feed/Profile?profileId=$($profile.ownerId)&limit=50" -Label 'Emre Karaca gönderileri')
    $sourceId = [Guid]'13000000-0000-4000-8000-00000000000b'
    $imageText = "İstanbul’da güne erken başlamanın en sevdiğim yanı: sessizlikte mimari notları toparlamak, sonra ekiple ilk kahveyi içmek. #yazılım #mimari"
    $videoText = 'Haftalık ürün toplantısından kısa bir kesit. Bu hafta sayılardan çok, sayıların arkasındaki kullanıcı davranışını konuştuk. #ürüngeliştirme #veri'
    $quoteText = "Burak’ın elde tutma notuna katılıyorum. Bizim panoda da en belirgin fark, ilk haftada doğru geri bildirim alan ekiplerde ortaya çıkıyor."
    $imagePost = $items | Where-Object { $_.content.text -eq $imageText -or ($_.content.text -and $_.content.text.Contains('[V5-DEMO-MEDYA]')) } | Select-Object -First 1
    $videoPost = $items | Where-Object { $_.content.text -eq $videoText -or ($_.content.text -and $_.content.text.Contains('[V5-DEMO-VIDEO]')) } | Select-Object -First 1
    $quotePost = $items | Where-Object { $_.content.text -eq $quoteText -or ($_.content.text -and $_.content.text.Contains('[V5-DEMO-ALINTI]')) } | Select-Object -First 1

    Set-DemoFixturePostText -Headers $headers -Item $imagePost -Text $imageText
    Set-DemoFixturePostText -Headers $headers -Item $videoPost -Text $videoText
    Set-DemoFixturePostText -Headers $headers -Item $quotePost -Text $quoteText

    if (-not $imagePost) {
        New-DemoPostWithMedia -Headers $headers -Text $imageText -FileName 'istanbul-workspace.jpg' -ShareKind Original
        Write-Host 'Emre Karaca görsel gönderisi oluşturuldu.'
    }
    if (-not $videoPost) {
        New-DemoPostWithMedia -Headers $headers -Text $videoText -FileName 'data-studio-motion.mp4' -ShareKind Original
        Write-Host 'Emre Karaca video gönderisi oluşturuldu.'
    }
    if (-not $quotePost) {
        New-DemoPostWithMedia -Headers $headers -Text $quoteText -FileName 'data-studio.jpg' -ShareKind Quote -OriginalPostId $sourceId
        Write-Host 'Emre Karaca medyalı alıntı gönderisi oluşturuldu.'
    }
    if (-not ($items | Where-Object { $_.content.shareKind -eq 'Repost' -and $_.content.originalPostId -eq $sourceId })) {
        Invoke-DemoApi -Method Post -Path '/api/v1/content/' -Headers $headers -Body @{
            text = $null
            mediaIds = @()
            visibility = 'Public'
            shareKind = 'Repost'
            originalPostId = $sourceId
            linkUrl = $null
            contentWarning = $null
            isSensitive = $false
            isDraft = $false
            publishAtUtc = $null
        } | Out-Null
        Write-Host 'Emre Karaca yeniden paylaşımı oluşturuldu.'
    }
}

function Set-DemoMessageAttachment {
    $headers = Get-DemoHeaders -Username 'emrekaraca'
    $conversationId = [Guid]'18000000-0000-4000-8000-000000000001'
    $replyToId = [Guid]'19000000-0000-4000-8000-000000000005'
    $marker = 'Hafta sonu notları için kullandığım masa fotoğrafını da ekledim. Renkler konusunda fikrini merak ediyorum.'
    $items = @(Get-DemoPagedItems -Headers $headers -Path "/api/v1/messaging/conversations/$conversationId/messages?limit=50" -Label 'Emre Karaca mesajları')
    if ($items | Where-Object { $_.text -eq $marker -or ($_.text -and $_.text.StartsWith('[V5-DEMO-DM]')) }) {
        Write-Host 'Emre Karaca medyalı yanıt mesajı zaten hazır.'
        return
    }
    $mediaId = Add-DemoMedia -Headers $headers -FileName 'istanbul-workspace.jpg' -Visibility Private
    try {
        Invoke-DemoApi -Method Post -Path "/api/v1/messaging/conversations/$conversationId/messages" -Headers $headers -Body @{
            text = $marker
            mediaIds = @($mediaId)
            replyToId = $replyToId
        } | Out-Null
        Write-Host 'Emre Karaca medyalı yanıt mesajı oluşturuldu.'
    }
    catch {
        $failure = $_
        try {
            $current = @(Get-DemoPagedItems -Headers $headers -Path "/api/v1/messaging/conversations/$conversationId/messages?limit=50" -Label 'Emre Karaca mesajları') |
                Where-Object { $_.text -eq $marker -and (@($_.mediaIds) -contains [string]$mediaId) }
            if ($current) {
                Write-Warning "$mediaId mesaja bağlı; belirsiz yanıt sonrası silinmedi."
            }
            else { Remove-DemoMedia -Headers $headers -MediaId $mediaId }
        }
        catch { Write-Warning 'Mesaj durumu doğrulanamadı; olası bağlı medya korundu.' }
        throw $failure
    }
}

function Invoke-DemoSql {
    param([Parameter(Mandatory)][string]$Sql)
    $output = $Sql | & docker exec -i $PostgresContainer psql -U $PostgresUser -d $PostgresDatabase -At `
        --set ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw 'Story fixture SQL işlemi başarısız.' }
    return @($output)
}

function New-DemoStory {
    param(
        [Parameter(Mandatory)][hashtable]$Headers,
        [Parameter(Mandatory)][Guid]$OwnerId,
        [Parameter(Mandatory)][string]$Caption,
        [Parameter(Mandatory)][string]$FileName,
        [Parameter(Mandatory)][ValidateSet('Public','Followers','CloseFriends')][string]$Audience
    )
    $mediaId = Add-DemoMedia -Headers $Headers -FileName $FileName -Visibility Private
    try {
        return Invoke-DemoApi -Method Post -Path '/api/v1/stories/' -Headers $Headers -Body @{
            mediaId = $mediaId
            caption = $Caption
            audience = $Audience
        }
    }
    catch {
        $failure = $_
        try {
            $stories = @(Get-DemoPagedItems -Headers $Headers -Path "/api/v1/stories/profile/$OwnerId`?limit=30" -Label 'profil hikâyeleri')
            $committed = $stories | Where-Object { $_.caption -eq $Caption -and $_.mediaId -eq [string]$mediaId } | Select-Object -First 1
            if ($committed) {
                Write-Warning "$mediaId hikâyeye bağlı; belirsiz yanıt sonrası silinmedi."
                return $committed
            }
            Remove-DemoMedia -Headers $Headers -MediaId $mediaId
        }
        catch { Write-Warning 'Hikâye durumu doğrulanamadı; olası bağlı medya korundu.' }
        throw $failure
    }
}

function Set-DemoStories {
    param(
        [Parameter(Mandatory)][string]$Username,
        [Parameter(Mandatory)][array]$Fixtures,
        [switch]$IncludeExpired
    )
    $headers = Get-DemoHeaders -Username $Username
    $profile = Invoke-DemoApi -Method Get -Path '/api/v1/profiles/me' -Headers $headers
    $stories = @(Get-DemoPagedItems -Headers $headers -Path "/api/v1/stories/profile/$($profile.ownerId)?limit=30" -Label "$Username hikâyeleri")
    foreach ($fixture in $fixtures) {
        if ($stories | Where-Object { $_.caption -eq $fixture.Caption }) {
            Write-Host "$Username hikâyesi zaten hazır: $($fixture.Audience)"
            continue
        }
        New-DemoStory -Headers $headers -OwnerId $profile.ownerId -Caption $fixture.Caption `
            -FileName $fixture.File -Audience $fixture.Audience | Out-Null
        Write-Host "$Username hikâyesi oluşturuldu: $($fixture.Audience)"
    }

    if (-not $IncludeExpired) { return }

    $expiredCaption = 'Dün akşamdan: günün son notları ve sakin bir İstanbul manzarası.'
    $lookupSql = @"
SELECT "Id" || '|' || "MediaId" || '|' || ("ExpiresAtUtc" <= now())
FROM stories.stories
WHERE ("Caption"='$expiredCaption' OR "Caption" LIKE '[V5-DEMO-STORY-EXPIRED]%')
  AND "OwnerId"='$($profile.ownerId)'
ORDER BY "CreatedAtUtc" DESC
LIMIT 1;
"@
    $row = @(Invoke-DemoSql -Sql $lookupSql) | Select-Object -First 1
    if (-not $row) {
        $created = New-DemoStory -Headers $headers -OwnerId $profile.ownerId -Caption $expiredCaption `
            -FileName 'emre-avatar.jpg' -Audience Public
        $storyId = [Guid]$created.id
        $mediaId = [Guid]$created.mediaId
    }
    else {
        $parts = ([string]$row).Split('|')
        $storyId = [Guid]$parts[0]
        $mediaId = [Guid]$parts[1]
        if ($parts[2] -in @('t', 'true', 'True')) {
            $captionSql = @"
UPDATE stories.stories SET "Caption"='$expiredCaption', "UpdatedAtUtc"=now(), "Version"="Version"+1
WHERE "Id"='$storyId' AND "OwnerId"='$($profile.ownerId)' AND "Caption"<>'$expiredCaption';
"@
            Invoke-DemoSql -Sql $captionSql | Out-Null
            Write-Host 'Süresi dolmuş hikâye zaten hazır.'
            return
        }
    }
    $expiredAt = [DateTimeOffset]::UtcNow.AddHours(-1).ToString('o')
    $expireSql = @"
BEGIN;
UPDATE stories.stories SET "Caption"='$expiredCaption', "ExpiresAtUtc"='$expiredAt', "UpdatedAtUtc"=now(), "Version"="Version"+1 WHERE "Id"='$storyId' AND "OwnerId"='$($profile.ownerId)';
UPDATE media.assets SET "StoryClaimExpiresAtUtc"='$expiredAt', "UpdatedAtUtc"=now(), "Version"="Version"+1 WHERE "Id"='$mediaId' AND "OwnerId"='$($profile.ownerId)' AND "StoryClaimId"='$storyId';
COMMIT;
"@
    Invoke-DemoSql -Sql $expireSql | Out-Null
    Write-Host 'Süresi dolmuş hikâye hazır.'
}

Set-DemoProfileMedia -Username 'emrekaraca' -AvatarFile 'emre-avatar.jpg' -CoverFile 'istanbul-workspace.jpg'
Set-DemoProfileMedia -Username 'ayseyilmaz' -AvatarFile 'ayse-avatar.jpg' -CoverFile 'istanbul-workspace.jpg'
Set-DemoProfileMedia -Username 'mehmetdemir' -AvatarFile 'mehmet-avatar.jpg' -CoverFile 'data-studio.jpg'
Set-DemoProfileMedia -Username 'zeynepkaya' -AvatarFile 'zeynep-avatar.jpg' -CoverFile 'data-studio.jpg'
Set-DemoProfileMedia -Username 'canozturk' -AvatarFile 'can-avatar.jpg' -CoverFile 'izmir-workspace.jpg'
Set-DemoProfileMedia -Username 'elifsahin' -AvatarFile 'elif-avatar.jpg' -CoverFile 'writer-cafe.jpg'
Set-DemoProfileMedia -Username 'burakaydin' -AvatarFile 'burak-avatar.jpg' -CoverFile 'istanbul-workspace.jpg'
Set-DemoProfileMedia -Username 'denizcelik' -AvatarFile 'deniz-avatar.jpg' -CoverFile 'data-studio.jpg'
Set-DemoProfileMedia -Username 'mervearslan' -AvatarFile 'merve-avatar.jpg' -CoverFile 'research-library.jpg'

Set-DemoPostMedia -Username 'ayseyilmaz' -PostId '13000000-0000-4000-8000-000000000001' -FileName 'istanbul-workspace.jpg'
Set-DemoPostMedia -Username 'mehmetdemir' -PostId '13000000-0000-4000-8000-000000000003' -FileName 'data-studio.jpg'
Set-DemoPostMedia -Username 'zeynepkaya' -PostId '13000000-0000-4000-8000-000000000005' -FileName 'data-studio.jpg'
Set-DemoPostMedia -Username 'canozturk' -PostId '13000000-0000-4000-8000-000000000007' -FileName 'izmir-workspace.jpg'
Set-DemoPostMedia -Username 'elifsahin' -PostId '13000000-0000-4000-8000-000000000009' -FileName 'writer-cafe.jpg'
Set-DemoPostMedia -Username 'burakaydin' -PostId '13000000-0000-4000-8000-00000000000b' -FileName 'istanbul-workspace.jpg'
Set-DemoPostMedia -Username 'denizcelik' -PostId '13000000-0000-4000-8000-00000000000d' -FileName 'data-studio.jpg'
Set-DemoPostMedia -Username 'mervearslan' -PostId '13000000-0000-4000-8000-00000000000f' -FileName 'research-library.jpg'
Set-DemoOwnedPosts
Set-DemoMessageAttachment
Set-DemoStories -Username 'emrekaraca' -IncludeExpired -Fixtures @(
    @{ Caption = "İstanbul’dan günaydın. Bugün ilk iş, haftanın mimari kararlarını sadeleştirmek."; File = 'istanbul-workspace.jpg'; Audience = 'Public' },
    @{ Caption = 'Toplantı öncesi veri panosuna son bir bakış.'; File = 'data-studio-motion.mp4'; Audience = 'Followers' },
    @{ Caption = 'Akşam için küçük bir ürün fikri; yarın ekibe açacağım.'; File = 'data-studio.jpg'; Audience = 'CloseFriends' }
)
Set-DemoStories -Username 'ayseyilmaz' -Fixtures @(
    @{ Caption = 'Yeni yazı için notlar dağınık ama fikir nihayet yerine oturdu.'; File = 'writer-cafe.jpg'; Audience = 'Public' }
)
Set-DemoStories -Username 'zeynepkaya' -Fixtures @(
    @{ Caption = 'Bugünün sorusu: iyi bir pano hangi kararı kolaylaştırmalı?'; File = 'data-studio.jpg'; Audience = 'Public' }
)

Write-Host 'Gerçek medya fixture akışı tamamlandı.'
