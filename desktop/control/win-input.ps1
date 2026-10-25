# Rojo Desktop - Windows input helper.
# Reads one JSON command per line on stdin, drives the mouse/keyboard with
# SendInput, and answers one JSON line per command. Coordinates are physical
# screen pixels (the process is DPI aware).
$ErrorActionPreference = 'Stop'
$code = @"
using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Collections.Generic;

public static class RojoInput {
    [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] public struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public InputUnion u; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }

    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

    const uint INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
    const uint KEYUP = 0x2, UNICODE = 0x4, EXTENDED = 0x1;

    public static void Init() { try { SetProcessDPIAware(); } catch { } }

    static void Send(INPUT[] a) { SendInput((uint)a.Length, a, Marshal.SizeOf(typeof(INPUT))); }
    static INPUT Mouse(uint flags, uint data) {
        INPUT i = new INPUT(); i.type = INPUT_MOUSE; i.u.mi.dwFlags = flags; i.u.mi.mouseData = data; return i;
    }
    static INPUT Key(ushort vk, bool up) {
        INPUT i = new INPUT(); i.type = INPUT_KEYBOARD; i.u.ki.wVk = vk;
        uint f = up ? KEYUP : 0;
        if (IsExtended(vk)) f |= EXTENDED;
        i.u.ki.dwFlags = f; return i;
    }
    static INPUT Uni(char c, bool up) {
        INPUT i = new INPUT(); i.type = INPUT_KEYBOARD; i.u.ki.wScan = c; i.u.ki.dwFlags = UNICODE | (up ? KEYUP : 0); return i;
    }
    static bool IsExtended(ushort vk) {
        return vk == 0x21 || vk == 0x22 || vk == 0x23 || vk == 0x24 || vk == 0x25 || vk == 0x26 || vk == 0x27 || vk == 0x28 || vk == 0x2D || vk == 0x2E || vk == 0x5B;
    }

    public static string Move(int x, int y) { SetCursorPos(x, y); return Pos(); }
    public static string Pos() { POINT p; GetCursorPos(out p); return "{\"ok\":true,\"x\":" + p.X + ",\"y\":" + p.Y + "}"; }

    static uint DownFlag(string b) { return b == "right" ? 0x8u : b == "middle" ? 0x20u : 0x2u; }
    static uint UpFlag(string b) { return b == "right" ? 0x10u : b == "middle" ? 0x40u : 0x4u; }

    public static string Click(string button, int count, string mods) {
        List<ushort> m = Mods(mods);
        foreach (ushort k in m) Send(new INPUT[] { Key(k, false) });
        for (int n = 0; n < Math.Max(1, count); n++) {
            Send(new INPUT[] { Mouse(DownFlag(button), 0), Mouse(UpFlag(button), 0) });
            Thread.Sleep(60);
        }
        for (int i = m.Count - 1; i >= 0; i--) Send(new INPUT[] { Key(m[i], true) });
        return "{\"ok\":true}";
    }
    public static string Button(string button, bool down) {
        Send(new INPUT[] { Mouse(down ? DownFlag(button) : UpFlag(button), 0) });
        return "{\"ok\":true}";
    }
    public static string Drag(int x1, int y1, int x2, int y2, string mods) {
        List<ushort> m = Mods(mods);
        foreach (ushort k in m) Send(new INPUT[] { Key(k, false) });
        SetCursorPos(x1, y1); Thread.Sleep(40);
        Send(new INPUT[] { Mouse(0x2, 0) });
        for (int s = 1; s <= 12; s++) { SetCursorPos(x1 + (x2 - x1) * s / 12, y1 + (y2 - y1) * s / 12); Thread.Sleep(15); }
        Send(new INPUT[] { Mouse(0x4, 0) });
        for (int i = m.Count - 1; i >= 0; i--) Send(new INPUT[] { Key(m[i], true) });
        return "{\"ok\":true}";
    }
    public static string Scroll(string dir, int amount, string mods) {
        List<ushort> m = Mods(mods);
        foreach (ushort k in m) Send(new INPUT[] { Key(k, false) });
        bool horiz = dir == "left" || dir == "right";
        int sign = (dir == "up" || dir == "right") ? 1 : -1;
        for (int n = 0; n < Math.Max(1, amount); n++) {
            Send(new INPUT[] { Mouse(horiz ? 0x1000u : 0x800u, (uint)(sign * 120)) });
            Thread.Sleep(20);
        }
        for (int i = m.Count - 1; i >= 0; i--) Send(new INPUT[] { Key(m[i], true) });
        return "{\"ok\":true}";
    }
    public static string Type(string text) {
        foreach (char c in text) {
            if (c == '\n') { Send(new INPUT[] { Key(0x0D, false), Key(0x0D, true) }); }
            else if (c == '\r') { continue; }
            else if (c == '\t') { Send(new INPUT[] { Key(0x09, false), Key(0x09, true) }); }
            else Send(new INPUT[] { Uni(c, false), Uni(c, true) });
            Thread.Sleep(6);
        }
        return "{\"ok\":true}";
    }
    // "ctrl+shift+s", "Return", "alt+F4" ... (xdotool-style names)
    public static string Combo(string combo, int repeat, int holdMs) {
        string[] parts = combo.Split('+');
        List<ushort> keys = new List<ushort>();
        foreach (string p in parts) {
            ushort vk = Vk(p.Trim());
            if (vk == 0) return "{\"ok\":false,\"error\":\"Unknown key: " + p.Replace("\"", "") + "\"}";
            keys.Add(vk);
        }
        for (int r = 0; r < Math.Max(1, repeat); r++) {
            foreach (ushort k in keys) Send(new INPUT[] { Key(k, false) });
            Thread.Sleep(holdMs > 0 ? holdMs : 30);
            for (int i = keys.Count - 1; i >= 0; i--) Send(new INPUT[] { Key(keys[i], true) });
            Thread.Sleep(30);
        }
        return "{\"ok\":true}";
    }
    static List<ushort> Mods(string mods) {
        List<ushort> r = new List<ushort>();
        if (string.IsNullOrEmpty(mods)) return r;
        foreach (string p in mods.Split('+')) { ushort v = Vk(p.Trim()); if (v != 0) r.Add(v); }
        return r;
    }
    public static ushort Vk(string k) {
        string s = k.ToLowerInvariant();
        switch (s) {
            case "ctrl": case "control": case "control_l": case "control_r": return 0x11;
            case "shift": case "shift_l": case "shift_r": return 0x10;
            case "alt": case "alt_l": case "alt_r": case "option": return 0x12;
            case "super": case "win": case "windows": case "meta": case "cmd": case "command": case "super_l": return 0x5B;
            case "return": case "enter": case "kp_enter": return 0x0D;
            case "tab": return 0x09;
            case "escape": case "esc": return 0x1B;
            case "backspace": case "back_space": return 0x08;
            case "delete": case "del": return 0x2E;
            case "insert": return 0x2D;
            case "space": return 0x20;
            case "up": return 0x26; case "down": return 0x28; case "left": return 0x25; case "right": return 0x27;
            case "home": return 0x24; case "end": return 0x23;
            case "page_up": case "pageup": case "prior": return 0x21;
            case "page_down": case "pagedown": case "next": return 0x22;
            case "minus": case "-": return 0xBD;
            case "equal": case "plus": case "=": return 0xBB;
            case "comma": case ",": return 0xBC;
            case "period": case ".": return 0xBE;
            case "slash": case "/": return 0xBF;
            case "semicolon": case ";": return 0xBA;
            case "apostrophe": case "'": return 0xDE;
            case "bracketleft": case "[": return 0xDB;
            case "bracketright": case "]": return 0xDD;
            case "backslash": case "\\": return 0xDC;
            case "grave": case "`": return 0xC0;
            case "caps_lock": return 0x14;
            case "print": return 0x2C;
        }
        if (s.Length >= 2 && s[0] == 'f') { int n; if (int.TryParse(s.Substring(1), out n) && n >= 1 && n <= 24) return (ushort)(0x6F + n); }
        if (s.Length == 1) {
            char c = s[0];
            if (c >= 'a' && c <= 'z') return (ushort)(0x41 + (c - 'a'));
            if (c >= '0' && c <= '9') return (ushort)(0x30 + (c - '0'));
        }
        return 0;
    }
}
"@
Add-Type -TypeDefinition $code -Language CSharp
[RojoInput]::Init()
[Console]::Out.WriteLine('{"ok":true,"ready":true}')
[Console]::Out.Flush()
while ($true) {
    $line = [Console]::In.ReadLine()
    if ($line -eq $null) { break }
    if ($line.Trim() -eq '') { continue }
    $out = '{"ok":false,"error":"bad command"}'
    try {
        $c = $line | ConvertFrom-Json
        $mods = if ($c.mods) { [string]$c.mods } else { '' }
        switch ($c.op) {
            'move'   { $out = [RojoInput]::Move([int]$c.x, [int]$c.y) }
            'cursor' { $out = [RojoInput]::Pos() }
            'click'  {
                if ($c.x -ne $null) { [void][RojoInput]::Move([int]$c.x, [int]$c.y); Start-Sleep -Milliseconds 40 }
                $out = [RojoInput]::Click([string]$c.button, [int]$c.count, $mods)
            }
            'down'   { $out = [RojoInput]::Button('left', $true) }
            'up'     { $out = [RojoInput]::Button('left', $false) }
            'drag'   { $out = [RojoInput]::Drag([int]$c.x1, [int]$c.y1, [int]$c.x2, [int]$c.y2, $mods) }
            'scroll' {
                if ($c.x -ne $null) { [void][RojoInput]::Move([int]$c.x, [int]$c.y); Start-Sleep -Milliseconds 30 }
                $out = [RojoInput]::Scroll([string]$c.dir, [int]$c.amount, $mods)
            }
            'type'   { $out = [RojoInput]::Type([string]$c.text) }
            'key'    { $out = [RojoInput]::Combo([string]$c.combo, [int]$c.repeat, 0) }
            'hold'   { $out = [RojoInput]::Combo([string]$c.combo, 1, [int]$c.ms) }
            default  { $out = '{"ok":false,"error":"unknown op"}' }
        }
    } catch {
        $msg = $_.Exception.Message -replace '"', "'"
        $out = '{"ok":false,"error":"' + $msg + '"}'
    }
    [Console]::Out.WriteLine($out)
    [Console]::Out.Flush()
}
