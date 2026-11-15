using System.Drawing;
using System.Text.Json;

namespace JacksImageVault.Desktop;

// Local, bounded window dimensions only. No credentials, account or media data.
internal sealed class DesktopWindowLayout
{
    public int Width { get; set; } = 1390;
    public int Height { get; set; } = 900;
    public bool Maximized { get; set; }
    internal static bool Valid(int width, int height) =>
        width >= 900 && width <= 2560 && height >= 620 && height <= 1600;
}
internal static class WindowLayoutStorage
{
    private static string FilePath
    {
        get
        {
            var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (string.IsNullOrWhiteSpace(local) || !Path.IsPathRooted(local))
                throw new IOException("Windows user data directory unavailable");
            return Path.Combine(local, "JacksImageVault", "window-layout-v1.json");
        }
    }
    internal static DesktopWindowLayout Load()
    {
        try
        {
            var file = FilePath;
            if (!File.Exists(file) || new FileInfo(file).Length > 1024)
                return new DesktopWindowLayout();
            var data = JsonSerializer.Deserialize<DesktopWindowLayout>(File.ReadAllText(file));
            return data != null && DesktopWindowLayout.Valid(data.Width,data.Height)
                ? data : new DesktopWindowLayout();
        }
        catch { return new DesktopWindowLayout(); }
    }
    internal static void Save(Size bounds, bool maximized)
    {
        if (!DesktopWindowLayout.Valid(bounds.Width,bounds.Height)) return;
        string? temp = null;
        try
        {
            var file = FilePath;
            Directory.CreateDirectory(Path.GetDirectoryName(file)!);
            temp = Path.Combine(Path.GetDirectoryName(file)!,
                ".window-" + Guid.NewGuid().ToString("N") + ".tmp");
            File.WriteAllText(temp,JsonSerializer.Serialize(new DesktopWindowLayout {
                Width = bounds.Width,Height = bounds.Height,Maximized = maximized
            }));
            File.Move(temp,file,true);
        }
        catch { /* Layout must not prevent opening or closing the vault. */ }
        finally { if(temp != null) try { File.Delete(temp); } catch { } }
    }
}
