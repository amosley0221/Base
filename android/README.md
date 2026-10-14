# BASE — Android APK

This folder wraps the BASE PWA (`https://base-homebase.onrender.com`) as a
native Android app using a **Trusted Web Activity (TWA)**. The app is just a
thin shell — it always loads the live site, so pushing to the website updates
the app's content instantly, no new APK needed. You only build a new APK when
you want to change the icon, name, splash, or Android-level behaviour.

GitHub Actions builds and **signs** the APK and publishes it to the
[Releases page](../../releases) whenever you push a version tag.

## One-time setup: add the signing secrets

Updates can only install **over the top of** an existing install (no uninstall)
when every APK is signed with the **same key**. That key lives in GitHub
Secrets so CI can sign with it. I generated the key for you; add these four
secrets at **GitHub → repo → Settings → Secrets and variables → Actions →
New repository secret**:

| Secret name                 | Value                                              |
|-----------------------------|----------------------------------------------------|
| `ANDROID_KEYSTORE_BASE64`   | contents of `keystore.base64.txt` (one long line)  |
| `ANDROID_KEYSTORE_PASSWORD` | the password I sent you                            |
| `ANDROID_KEY_ALIAS`         | `base`                                             |
| `ANDROID_KEY_PASSWORD`      | the same password                                  |

> ⚠️ **Keep the keystore file and password forever.** If you lose them you can
> never ship an update again without users uninstalling first. The keystore is
> **not** stored in git (the `keys/` folder is git-ignored).

## Cutting a release

```bash
# 1. make sure the website changes are already deployed
# 2. tag a version and push the tag
git tag -a v1.0.0 -m "First release"
git push origin v1.0.0
```

That triggers the **Android APK Release** workflow, which:
1. builds a signed APK,
2. names it `BASE-v1.0.0.apk`,
3. creates a GitHub Release `BASE v1.0.0` with the APK attached and release notes.

Install on the phone by opening the Release on the phone's browser and tapping
the `.apk` (allow "install from this source" the first time). Future releases
install straight over the top.

### Release notes for each update

The release body is filled, in order of preference:
1. `release-notes/v1.0.0.md` if that file exists (write it before tagging), else
2. the annotated tag message (`-m "..."`), plus
3. GitHub's auto-generated "What's Changed" list is always appended.

### Version numbers

- **versionName** = the tag (e.g. `v1.0.0` → `1.0.0`), shown to users.
- **versionCode** = the commit count (`git rev-list --count HEAD`), which always
  increases — Android requires this to go up for an in-place update.

## Full-screen (no address bar)

`/.well-known/assetlinks.json` on the website links the site to this app's
signing key, so the TWA runs full-screen. It already contains this key's
SHA-256 fingerprint. If you ever change the signing key, regenerate that file
with the new fingerprint.

## Testing without a release

Run the workflow manually from the **Actions** tab (**Run workflow**). It builds
and uploads the APK as a build artifact without publishing a Release.
