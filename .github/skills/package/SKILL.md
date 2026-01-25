---
name: package
description: Guide for increasing the version and packaging a VSIX extension, used when creating a new package release
---
# Plus One Publish

Increment the extension version and create a VSIX package.

## Steps

1. Read the current version from `package.json`
2. Increment the patch version by 0.0.1 (e.g., 0.1.4 → 0.1.5)
3. Update `package.json` with the new version
4. Create the `.vsix` folder if it doesn't exist
5. Generate release notes from commits since the last version tag
6. Run `vsce package` to create the VSIX file in the `.vsix` folder
7. Commit the version bump and create a version tag

## Commands

```powershell
# Ensure .vsix folder exists
New-Item -ItemType Directory -Force -Path ".vsix"

# Get the previous version tag (format: v0.1.4)
$previousTag = git describe --tags --abbrev=0 2>$null

# Generate release notes from commits since last tag
if ($previousTag) {
    $commits = git log "$previousTag..HEAD" --pretty=format:"- %s" --no-merges
} else {
    $commits = git log --pretty=format:"- %s" --no-merges
}

# Save release notes to .vsix folder
$version = (Get-Content package.json | ConvertFrom-Json).version
$releaseNotesPath = ".vsix/RELEASE_NOTES_$version.md"
@"
# Release Notes - v$version

## Changes

$commits
"@ | Out-File -FilePath $releaseNotesPath -Encoding utf8

Write-Host "Release notes saved to $releaseNotesPath"

# Package the extension into .vsix folder
vsce package -o .vsix/

# Commit version bump and tag the release
git add package.json
git commit -m "Bump version to $version"
git tag -a "v$version" -m "Release v$version"

Write-Host "Created tag v$version - push with: git push origin main --tags"
```

## Notes

- Requires `@vscode/vsce` to be installed (`npm install -g @vscode/vsce`)
- The VSIX file will be named `markco-<version>.vsix`
- Commit the version bump before publishing
