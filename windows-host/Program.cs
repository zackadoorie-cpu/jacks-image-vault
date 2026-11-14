using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace JacksImageVault.Desktop;

// Runs as a normal per-user Windows application. Its Go server is shipped
// beside the desktop host in the same verified portable ZIP.
internal static class Program
{
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SetCurrentProcessExplicitAppUserModelID(string appID);

    [STAThread]
    private static int Main(string[] args)
    {
        bool smoke = args.Length == 1 && args[0] == "--self-test";
        try
        {
            using var backend = BackendConnection.StartAsync().GetAwaiter().GetResult();
            if (smoke)
            {
                backend.KillOwnedServerForSmokeTest();
                return 0;
            }

            // Different AppUserModelID from Edge and Chrome; the icon and
            // the window now belong to this Windows executable.
            _ = SetCurrentProcessExplicitAppUserModelID("JackVolerich.JacksImageVault.Desktop");
            ApplicationConfiguration.Initialize();
            using var window = new VaultWindow();
            Application.Run(window);
            // The browser document sends a nonce-guarded 'leave' heartbeat.
            // Go shuts down after its 15-second grace; no browser PID is killed.
            return 0;
        }
        catch (Exception ex)
        {
            if (!smoke)
            {
                MessageBox.Show(
                    ex.Message + "\n\nThe original Jacks_Image_Vault_VERSION.exe is still available as the Edge/Chrome fallback.",
                    "Image Vault Desktop could not start",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            else
            {
                Console.Error.WriteLine(ex.Message);
            }
            return 1;
        }
    }
}

internal sealed class BackendConnection : IDisposable
{
    private const string Marker = "JACKS_IMAGE_VAULT_EXE_V2";
    private const string Health = "http://127.0.0.1:8765/__vault_health";
    private static readonly Regex BackendName = new(
        @"^Jacks_Image_Vault_(\d+\.\d+\.\d+)\.exe$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private readonly Process? _owned;

    private BackendConnection(Process? owned) { _owned = owned; }

    internal static async Task<BackendConnection> StartAsync()
    {
        string folder = AppContext.BaseDirectory;
        var matches = Directory.EnumerateFiles(folder, "Jacks_Image_Vault_*.exe", SearchOption.TopDirectoryOnly)
            .Select(path => (Path: path, Match: BackendName.Match(Path.GetFileName(path))))
            .Where(x => x.Match.Success)
            .ToArray();

        if (matches.Length != 1)
            throw new InvalidOperationException(
                "Extract the complete Desktop Bundle ZIP into one folder. It must contain exactly one versioned Jacks_Image_Vault_*.exe beside Jacks_Image_Vault_Desktop.exe.");

        string backendPath = matches[0].Path;
        string expectedVersion = matches[0].Match.Groups[1].Value;

        string? current = await ProbeAsync();
        if (current != null)
        {
            if (current != expectedVersion)
                throw new InvalidOperationException(
                    $"The local Image Vault server is version {current}, but this Desktop bundle is {expectedVersion}. Close the earlier Image Vault launcher before starting the Desktop preview.");
            return new BackendConnection(null);
        }

        var start = new ProcessStartInfo(backendPath)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = folder,
            WindowStyle = ProcessWindowStyle.Hidden
        };
        start.ArgumentList.Add("--serve-only");
        var owned = Process.Start(start) ??
            throw new InvalidOperationException("Unable to start the packaged Image Vault server.");

        for (int i = 0; i < 65; i++)
        {
            if (owned.HasExited)
            {
                owned.Dispose();
                throw new InvalidOperationException("Image Vault server exited during startup. Check port 8765 and the bundled EXE.");
            }
            var version = await ProbeAsync();
            if (version != null)
            {
                if (version != expectedVersion)
                {
                    owned.Dispose();
                    throw new InvalidOperationException($"Port 8765 belongs to Image Vault {version}, not {expectedVersion}.");
                }
                return new BackendConnection(owned);
            }
            await Task.Delay(180);
        }

        try { owned.Kill(entireProcessTree: true); } catch { }
        owned.Dispose();
        throw new InvalidOperationException("The local Vault server did not become ready. Please try the standard EXE launcher.");
    }

    private static async Task<string?> ProbeAsync()
    {
        try
        {
            using var client = new HttpClient(new HttpClientHandler
            {
                AllowAutoRedirect = false,
                UseProxy = false
            }) { Timeout = TimeSpan.FromMilliseconds(800) };
            using var response = await client.GetAsync(Health, HttpCompletionOption.ResponseHeadersRead);
            if (response.StatusCode != HttpStatusCode.OK)
                throw new InvalidOperationException("A non-Vault server is using port 8765.");
            if (!response.Headers.TryGetValues("X-Vault-App", out var headers) ||
                headers.SingleOrDefault() != Marker)
                throw new InvalidOperationException("Port 8765 is being used by an unrelated server.");
            if (!response.Headers.TryGetValues("X-Vault-Native-Version", out var version) ||
                string.IsNullOrWhiteSpace(version.SingleOrDefault()))
                throw new InvalidOperationException("An old, unsupported Vault server is already active on port 8765.");
            return version.Single();
        }
        catch (HttpRequestException) { return null; }
        catch (TaskCanceledException) { return null; }
    }

    internal void KillOwnedServerForSmokeTest()
    {
        // CI only. Never force-stop a user browser or a reused server.
        if (_owned == null) return;
        try { if (!_owned.HasExited) _owned.Kill(entireProcessTree: true); } catch { }
    }

    public void Dispose() => _owned?.Dispose();
}

// A strict top-level navigation boundary: no Google login, Drive page, or
// user-controlled external site ever renders inside the embedded user-agent.
internal static class DesktopNavigation
{
    internal const string Home = "http://127.0.0.1:8765/";
    internal static bool IsLocalDocument(string address)
    {
        if (!Uri.TryCreate(address, UriKind.Absolute, out var uri)) return false;
        return uri.Scheme == Uri.UriSchemeHttp
            && uri.Host == "127.0.0.1"
            && uri.Port == 8765
            && uri.UserInfo.Length == 0
            && (uri.AbsolutePath == "/" || uri.AbsolutePath == "/index.html")
            && uri.Query.Length == 0 && uri.Fragment.Length == 0;
    }
    internal static bool CanOpenExternally(string address)
    {
        if (!Uri.TryCreate(address, UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme != Uri.UriSchemeHttps || uri.Port != 443 || uri.UserInfo.Length != 0) return false;
        return uri.Host.Equals("drive.google.com", StringComparison.OrdinalIgnoreCase)
            || uri.Host.Equals("docs.google.com", StringComparison.OrdinalIgnoreCase)
            || uri.Host.Equals("sheets.google.com", StringComparison.OrdinalIgnoreCase)
            || (uri.Host.Equals("github.com", StringComparison.OrdinalIgnoreCase)
                && uri.AbsolutePath.StartsWith("/zackadoorie-cpu/jacks-image-vault/", StringComparison.OrdinalIgnoreCase));
    }
}

internal sealed class VaultWindow : Form
{
    private readonly WebView2 _web = new() { Dock = DockStyle.Fill, Visible = false };
    private readonly Label _status = new()
    {
        Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter,
        ForeColor = Color.FromArgb(208, 212, 239), Font = new Font("Segoe UI", 13),
        Text = "Opening Jack's Image Vault…"
    };

    internal VaultWindow()
    {
        Text = "Jack's Image Vault";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        MinimumSize = new Size(900, 620);
        Size = new Size(1390, 900);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(17, 22, 39);
        Controls.Add(_web);
        Controls.Add(_status);
        Shown += (_, _) => _ = InitializeWebViewAsync();
    }

    private async Task InitializeWebViewAsync()
    {
        try
        {
            string profile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "JacksImageVault", "WebView2Profile");
            Directory.CreateDirectory(profile);

            // A dedicated app profile is NOT the Edge profile. Google OAuth
            // is always started in the system browser by the Go PKCE broker.
            var environment = await CoreWebView2Environment.CreateAsync(null, profile);
            await _web.EnsureCoreWebView2Async(environment);
            var core = _web.CoreWebView2;
            core.Settings.AreHostObjectsAllowed = false;
            core.Settings.IsWebMessageEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = true;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.NavigationStarting += (_, e) =>
            {
                // Requests for JS/CSS/assets and direct Google APIs continue
                // normally. Only top-level navigation is restricted here.
                if (!DesktopNavigation.IsLocalDocument(e.Uri)) e.Cancel = true;
            };
            core.NewWindowRequested += (_, e) =>
            {
                e.Handled = true;
                if (DesktopNavigation.CanOpenExternally(e.Uri))
                    OpenSystemBrowser(e.Uri);
            };
            core.ProcessFailed += (_, _) =>
            {
                _status.Text = "The WebView2 renderer stopped. Restart this window or launch the regular Image Vault EXE.";
                _status.Visible = true;
            };
            // No native JS host objects, cookies or OAuth secrets are injected.
            // This boolean only selects the existing external-browser PKCE UI.
            await core.AddScriptToExecuteOnDocumentCreatedAsync(
                "Object.defineProperty(window,'__JACKS_VAULT_DESKTOP_HOST',{value:true,configurable:false,writable:false});");
            _web.Visible = true;
            _status.Visible = false;
            core.Navigate(DesktopNavigation.Home);
        }
        catch (Exception ex)
        {
            _status.Text =
                "Unable to initialize the WebView2 window.\n\n" +
                ex.Message + "\n\nOpen the regular Image Vault EXE to use Edge or Chrome.";
            _status.Visible = true;
        }
    }

    private static void OpenSystemBrowser(string url)
    {
        if (!DesktopNavigation.CanOpenExternally(url)) return;
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch (Exception) { /* External link launch failure cannot grant permissions. */ }
    }
}
