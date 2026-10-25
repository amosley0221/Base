## Rojo Desktop 1.2: Rojo's own pointer

Your normal mouse pointer stays as it is. When you give Rojo a task, **his own pointer appears**: a little glowing Rojo with a red arrow on the top-left of his head.

- **It shows you every step.** It glides to each spot before he acts, and a label next to him says what he's doing: *"Clicking Post"*, *"Typing your reply to Sam"*, *"Scrolling down"*, *"Pressing Ctrl+S"*.
- **You can see what he clicked.** A red ring pops where the arrow tip lands, and his eyes look the way he's heading.
- It starts where your mouse is and goes away when he's done (or when you tap **Stop**).

Installs over 1.1.0; your settings stay.

---

## Rojo Desktop 1.1: your phone is Rojo, your computer is his hands

When BASE on your phone is linked (same sync token and passphrase), **Rojo lives on your phone** and this computer does the work:

- **Rojo hides here.** With a phone linked, the little Rojo in the corner goes away. Want him back on the computer too? Right-click the tray icon → **Show Rojo on this computer** (or **Talk to Rojo here** for a one-off chat).
- **His eyes follow your mouse — on the phone.** Open Rojo in the BASE Android app while this computer is on the same Wi-Fi, and he watches your cursor move across the screen.
- **Talk on the phone, work on the computer.** Hold Rojo on your phone and say *"open Gmail and draft a reply to Sam"*. He clicks and types on this computer while the edges glow red and the Stop pill shows at the top.
- **Allow from either one.** When he's about to post, send, buy or delete something, the Allow / Don't buttons show on your phone **and** on the computer. Whichever you tap first counts.
- **Private.** The phone talks straight to this computer over your Wi-Fi, and every message is encrypted with a key that only travels inside BASE's encrypted sync.
- No phone linked? Rojo works on this computer exactly like before.

**The first time**, Windows may ask whether to allow Rojo on networks: allow it on **Private networks**, or the phone can't reach it. Away from home, or on iPhone, *"on my PC, …"* tasks still queue and run when this computer is on.

Installs over 1.0.0; your settings stay.

---

## Rojo Desktop: Rojo on your Windows PC or Mac

Rojo sits in the corner of your screen and **his eyes follow your mouse**. Click him to chat. Ask him anything, or tell him what to do on the computer, like *"open Gmail and draft a reply to Sam"*.

- **He uses the computer for you.** He takes screenshots, moves the mouse, clicks and types, step by step. While he works the screen edges **glow red**, his pointer shows where he's about to click, and a pill at the top has a **Stop** button.
- **You approve anything final.** Before he posts, sends, buys, pays or deletes anything, the pill asks you to **Allow** it. He won't type passwords or card numbers.
- **Linked with your phone.** With the same sync token and passphrase as BASE, he shares your bills, memory and focus sessions. You can tell Rojo on your phone *"on my PC, …"* and it runs here, then he reports back on your phone.

### Install
**Windows:** download **Rojo-Setup-….exe** and run it. Windows SmartScreen may say "Windows protected your PC" because the app isn't from the Microsoft Store. Click **More info → Run anyway**.

**Mac:** download the **.dmg** for your Mac (**arm64** = Apple silicon M1/M2/M3/M4, **x64** = Intel), open it, and drag **Rojo** into Applications. The first time, **right-click Rojo → Open → Open**.
- If macOS says the app is damaged, open Terminal and run `xattr -cr /Applications/Rojo.app`, then open it again.
- Then turn on Rojo in **System Settings → Privacy & Security** under **Screen Recording** and **Accessibility**, and restart Rojo.

### Set up (Rojo's Settings window opens the first time)
1. Paste your **Claude API key** (the same one as in BASE).
2. **Link with your phone:** enter the same GitHub token and passphrase as BASE → Settings → Sync between devices.
3. Use **Test screen access** and **Test mouse control** to check everything works.
4. Tick **Open Rojo when I sign in** if you want him there every day.

On your phone, set which computer "my computer" means in **BASE → Settings → Rojo on your computer** (Windows PC or Mac).

**Note:** hold-to-talk isn't available on the computer yet; type to Rojo there.
