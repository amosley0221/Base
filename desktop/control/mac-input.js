// Rojo Desktop - macOS input helper (JavaScript for Automation).
// Run as: osascript -l JavaScript mac-input.js '<json command>'
// Moves/clicks/scrolls with CoreGraphics events and types/presses keys with
// System Events. Coordinates are macOS points (top-left origin, main display).
// Needs: System Settings > Privacy & Security > Accessibility > Rojo.
ObjC.import('CoreGraphics');
ObjC.import('Foundation');

function run(argv) {
  var c = JSON.parse(argv[0] || '{}');
  try {
    return JSON.stringify(handle(c));
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e) });
  }
}

function pos() {
  var ev = $.CGEventCreate(null);
  var p = $.CGEventGetLocation(ev);
  return { x: Math.round(p.x), y: Math.round(p.y) };
}
function post(type, x, y, button, clickState, flags) {
  var ev = $.CGEventCreateMouseEvent(null, type, $.CGPointMake(x, y), button);
  if (clickState) $.CGEventSetIntegerValueField(ev, $.kCGMouseEventClickState, clickState);
  if (flags) $.CGEventSetFlags(ev, flags);
  $.CGEventPost($.kCGHIDEventTap, ev);
}
function modFlags(mods) {
  var f = 0;
  String(mods || '').toLowerCase().split('+').forEach(function (m) {
    m = m.trim();
    if (m === 'shift') f |= $.kCGEventFlagMaskShift;
    else if (m === 'ctrl' || m === 'control') f |= $.kCGEventFlagMaskControl;
    else if (m === 'alt' || m === 'option') f |= $.kCGEventFlagMaskAlternate;
    else if (m === 'super' || m === 'cmd' || m === 'command' || m === 'meta' || m === 'win') f |= $.kCGEventFlagMaskCommand;
  });
  return f;
}
function sleep(ms) { $.NSThread.sleepForTimeInterval(ms / 1000); }

var BUTTONS = {
  left: [$.kCGEventLeftMouseDown, $.kCGEventLeftMouseUp, $.kCGMouseButtonLeft],
  right: [$.kCGEventRightMouseDown, $.kCGEventRightMouseUp, $.kCGMouseButtonRight],
  middle: [$.kCGEventOtherMouseDown, $.kCGEventOtherMouseUp, $.kCGMouseButtonCenter],
};

// macOS virtual key codes
var KEYCODES = {
  return: 36, enter: 36, kp_enter: 76, tab: 48, space: 49, backspace: 51, back_space: 51, delete: 117, del: 117,
  escape: 53, esc: 53, left: 123, right: 124, down: 125, up: 126, home: 115, end: 119,
  page_up: 116, pageup: 116, prior: 116, page_down: 121, pagedown: 121, next: 121,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
  a: 0, b: 11, c: 8, d: 2, e: 14, f: 3, g: 5, h: 4, i: 34, j: 38, k: 40, l: 37, m: 46, n: 45, o: 31, p: 35, q: 12,
  r: 15, s: 1, t: 17, u: 32, v: 9, w: 13, x: 7, y: 16, z: 6,
  '0': 29, '1': 18, '2': 19, '3': 20, '4': 21, '5': 23, '6': 22, '7': 26, '8': 28, '9': 25,
  minus: 27, '-': 27, equal: 24, '=': 24, plus: 24, comma: 43, ',': 43, period: 47, '.': 47, slash: 44, '/': 44,
  semicolon: 41, ';': 41, apostrophe: 39, "'": 39, bracketleft: 33, '[': 33, bracketright: 30, ']': 30,
  backslash: 42, '\\': 42, grave: 50, '`': 50,
};
var MODS = { ctrl: 'control down', control: 'control down', shift: 'shift down', alt: 'option down', option: 'option down',
  super: 'command down', cmd: 'command down', command: 'command down', meta: 'command down', win: 'command down' };

function pressCombo(combo, holdMs) {
  var se = Application('System Events');
  var parts = String(combo).split('+').map(function (p) { return p.trim().toLowerCase(); });
  var using = [], key = null;
  parts.forEach(function (p) { if (MODS[p]) using.push(MODS[p]); else key = p; });
  if (key === null) throw new Error('No key in ' + combo);
  var code = KEYCODES[key];
  if (code === undefined) throw new Error('Unknown key: ' + key);
  if (holdMs) {
    var down = $.CGEventCreateKeyboardEvent(null, code, true), up = $.CGEventCreateKeyboardEvent(null, code, false);
    $.CGEventPost($.kCGHIDEventTap, down); sleep(holdMs); $.CGEventPost($.kCGHIDEventTap, up);
    return;
  }
  se.keyCode(code, { using: using });
}

function handle(c) {
  var b = BUTTONS[c.button || 'left'] || BUTTONS.left;
  switch (c.op) {
    case 'cursor': { var p = pos(); return { ok: true, x: p.x, y: p.y }; }
    case 'move': post($.kCGEventMouseMoved, c.x, c.y, $.kCGMouseButtonLeft); return { ok: true };
    case 'click': {
      var p0 = c.x !== undefined && c.x !== null ? { x: c.x, y: c.y } : pos();
      var flags = modFlags(c.mods);
      post($.kCGEventMouseMoved, p0.x, p0.y, b[2]);
      sleep(40);
      var n = Math.max(1, c.count || 1);
      for (var i = 1; i <= n; i++) {
        post(b[0], p0.x, p0.y, b[2], i, flags);
        post(b[1], p0.x, p0.y, b[2], i, flags);
        sleep(50);
      }
      return { ok: true };
    }
    case 'down': { var pd = pos(); post($.kCGEventLeftMouseDown, pd.x, pd.y, $.kCGMouseButtonLeft); return { ok: true }; }
    case 'up': { var pu = pos(); post($.kCGEventLeftMouseUp, pu.x, pu.y, $.kCGMouseButtonLeft); return { ok: true }; }
    case 'drag': {
      var fl = modFlags(c.mods);
      post($.kCGEventMouseMoved, c.x1, c.y1, $.kCGMouseButtonLeft); sleep(40);
      post($.kCGEventLeftMouseDown, c.x1, c.y1, $.kCGMouseButtonLeft, 1, fl);
      for (var s = 1; s <= 12; s++) {
        post($.kCGEventLeftMouseDragged, c.x1 + (c.x2 - c.x1) * s / 12, c.y1 + (c.y2 - c.y1) * s / 12, $.kCGMouseButtonLeft, 0, fl);
        sleep(15);
      }
      post($.kCGEventLeftMouseUp, c.x2, c.y2, $.kCGMouseButtonLeft, 1, fl);
      return { ok: true };
    }
    case 'scroll': {
      if (c.x !== undefined && c.x !== null) { post($.kCGEventMouseMoved, c.x, c.y, $.kCGMouseButtonLeft); sleep(30); }
      var amt = Math.max(1, c.amount || 3);
      var dy = c.dir === 'up' ? amt : c.dir === 'down' ? -amt : 0;
      var dx = c.dir === 'left' ? amt : c.dir === 'right' ? -amt : 0;
      var ev = $.CGEventCreateScrollWheelEvent(null, $.kCGScrollEventUnitLine, 2, dy, dx);
      var f2 = modFlags(c.mods);
      if (f2) $.CGEventSetFlags(ev, f2);
      $.CGEventPost($.kCGHIDEventTap, ev);
      return { ok: true };
    }
    case 'type': Application('System Events').keystroke(String(c.text || '')); return { ok: true };
    case 'key': {
      for (var r = 0; r < Math.max(1, c.repeat || 1); r++) { pressCombo(c.combo); sleep(30); }
      return { ok: true };
    }
    case 'hold': pressCombo(c.combo, c.ms || 500); return { ok: true };
  }
  return { ok: false, error: 'unknown op ' + c.op };
}
