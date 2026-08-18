using Microsoft.Extensions.Options;
using ZosyalMedya.Modules.Media.Application.Ports;

namespace ZosyalMedya.Modules.Media.Infrastructure.Storage;

public sealed class FileSystemObjectStorage : IObjectStorage
{
    private readonly string root;

    public FileSystemObjectStorage(IOptions<MediaOptions> options)
    {
        root = Path.GetFullPath(options.Value.FileSystemRoot);
        Directory.CreateDirectory(root);
    }

    public async Task PutAsync(string key, Stream content, CancellationToken cancellationToken = default)
    {
        var path = Resolve(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temporary = path + ".upload-" + Guid.NewGuid().ToString("N");
        try
        {
            await using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                             81920, FileOptions.Asynchronous | FileOptions.WriteThrough))
                await content.CopyToAsync(output, cancellationToken);
            File.Move(temporary, path, true);
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    public Task<Stream> OpenReadAsync(string key, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        Stream stream = new FileStream(Resolve(key), FileMode.Open, FileAccess.Read, FileShare.Read, 81920,
            FileOptions.Asynchronous | FileOptions.SequentialScan);
        return Task.FromResult(stream);
    }

    public Task DeleteAsync(string key, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var path = Resolve(key);
        if (File.Exists(path)) File.Delete(path);
        return Task.CompletedTask;
    }

    public Task<string> CreateReadUrlAsync(string key, TimeSpan lifetime, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _ = Resolve(key);
        return Task.FromResult(string.Empty);
    }

    private string Resolve(string key)
    {
        if (string.IsNullOrWhiteSpace(key)) throw new ArgumentException("Depolama anahtarı boş olamaz.", nameof(key));
        var relative = key.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar);
        var path = Path.GetFullPath(Path.Combine(root, relative));
        var prefix = root.EndsWith(Path.DirectorySeparatorChar) ? root : root + Path.DirectorySeparatorChar;
        if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            throw new UnauthorizedAccessException("Depolama anahtarı izin verilen kökün dışına çıkıyor.");
        return path;
    }
}
