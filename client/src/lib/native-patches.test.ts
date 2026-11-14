import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { createAutolinkingOptionsLoader } from 'expo-modules-autolinking/build/commands/autolinkingOptions';
import { ExpoModuleConfig } from 'expo-modules-autolinking/build/ExpoModuleConfig';
import { convertPackageToProjectName } from 'expo-modules-autolinking/build/platforms/android/android';
import type { RawExpoModuleConfig } from 'expo-modules-autolinking/build/types';
import { describe, expect, it } from 'vitest';

// A patch to a package's Android code reaches a phone only if Gradle compiles that package's source. Since SDK 56,
// expo-modules-autolinking links many Expo modules PREBUILT instead: a library the package ships ready-made (named by
// `android.publication` in its expo-module.config.json, served from its own local-maven-repo), so Gradle never compiles
// the package's Kotlin, patched or not. That is how patches/expo-notifications+56.0.18.patch (the nudges' shelf life
// and the whole glance block) reached no build at all until 2026-11-12: the library inside 1.10.7 holds none of it,
// and nothing failed. The way out is client/package.json's `expo.autolinking.android.buildFromSource`, a list of
// patterns the Gradle settings plugin matches against each module's project name as a whole (SettingsManager.kt,
// Kotlin's Regex.matches). These checks fail the moment a patched package would be linked prebuilt again: a new patch,
// an upgrade that starts shipping a prebuilt library, or the key edited away. The options are read with autolinking's
// own loader, and each project's name and publication with its own ExpoModuleConfig (`android.name` over the package's
// name, and every `android.projects[]` with a publication of its own), so the key checked is the key Gradle's resolver
// reads and the name matched is the name Gradle matches, not a guess at either. If an Expo upgrade moves the imports
// above, find them again in expo-modules-autolinking/build rather than dropping this file.

const CLIENT = join(__dirname, '..', '..');
const PATCHES = join(CLIENT, '..', 'patches');

/** A package's folder as Node and autolinking find it from client/: the nearest node_modules up the tree. */
function packageDir(name: string): string {
  for (let dir = CLIENT; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    if (dirname(dir) === dir) throw new Error(`${name} is not installed`);
  }
}

/** The package's expo-module.config.json, or null when it has none (it is not an Expo module). */
function moduleConfig(name: string): RawExpoModuleConfig | null {
  const path = join(packageDir(name), 'expo-module.config.json');
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as RawExpoModuleConfig) : null;
}

type AndroidProject = { name: string; path: string; prebuilt: boolean };

/** Every Android project autolinking links for package `pkg` with config `raw`, named and published exactly as its
 *  resolver does it (ExpoModuleConfig.androidProjects), with the folder it builds from. */
function projectsOf(pkg: string, raw: RawExpoModuleConfig): AndroidProject[] {
  return new ExpoModuleConfig(raw)
    .androidProjects(convertPackageToProjectName(pkg))
    .map((p) => ({ name: p.name, path: p.path.replace(/\\/g, '/').replace(/\/+$/, ''), prebuilt: p.publication != null }));
}

/** The installed package's Android projects, or none when it is not an Expo module. */
function androidProjects(pkg: string): AndroidProject[] {
  const raw = moduleConfig(pkg);
  return raw === null ? [] : projectsOf(pkg, raw);
}

type PatchedFile = { patch: string; pkg: string; file: string; added: string[] };

/** Every file each patch in patches/ changes, by package, with the lines it adds. */
function patchedFiles(): PatchedFile[] {
  const out: PatchedFile[] = [];
  for (const patch of readdirSync(PATCHES).filter((f) => f.endsWith('.patch'))) {
    const text = readFileSync(join(PATCHES, patch), 'utf8').replace(/\r\n/g, '\n');
    for (const section of text.split(/^(?=diff --git )/m)) {
      const m = /^diff --git a\/node_modules\/((?:@[^/\s]+\/)?[^/\s]+)\/(\S+) /.exec(section);
      if (!m) continue;
      const added = section
        .split('\n')
        .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
        .map((l) => l.slice(1));
      out.push({ patch, pkg: m[1], file: m[2], added });
    }
  }
  return out;
}

/** The projects whose files `file` belongs to: the ones whose folder holds it. */
const projectsHolding = (projects: AndroidProject[], file: string) => projects.filter((p) => file.startsWith(`${p.path}/`));

/** The Android projects a patch changes, by the name Gradle gives them. */
function patchedProjects(): { patch: string; pkg: string; project: AndroidProject }[] {
  const seen = new Map<string, { patch: string; pkg: string; project: AndroidProject }>();
  for (const { patch, pkg, file } of patchedFiles()) {
    for (const project of projectsHolding(androidProjects(pkg), file)) seen.set(`${patch} ${pkg} ${project.name}`, { patch, pkg, project });
  }
  return [...seen.values()];
}

/** client/package.json's buildFromSource for Android, as autolinking's resolver reads it for Gradle. */
async function buildFromSource(): Promise<string[]> {
  const options = await createAutolinkingOptionsLoader({ projectRoot: CLIENT }).getPlatformOptions('android');
  return options.buildFromSource ?? [];
}

/** Gradle's rule: a pattern counts only when it matches the project name as a whole. */
const matchesWhole = (pattern: string, name: string) => new RegExp(`^(?:${pattern})$`).test(name);

describe('a patched native package is compiled from its patched source', () => {
  it('finds the Android patch it guards', () => {
    expect(patchedProjects().map((p) => p.project.name)).toContain('expo-notifications');
  });

  it('reads the key the way Gradle does: a whole-name match, never part of a name', () => {
    expect(convertPackageToProjectName('expo-notifications')).toBe('expo-notifications');
    expect(convertPackageToProjectName('@scope/some-module')).toBe('scope-some-module');
    expect(matchesWhole('expo-notifications', 'expo-notifications')).toBe(true);
    expect(matchesWhole('expo-notifications', 'expo-notifications-extra')).toBe(false);
    expect(matchesWhole('expo-.*', 'expo-notifications')).toBe(true);
  });

  // A module can rename its Android project (`android.name`) or add more (`android.projects[]`, each with its own
  // publication). Gradle matches buildFromSource against those names, so a check by the package's own name alone would
  // pass while the renamed project stays prebuilt.
  it('names each project as autolinking does: android.name over the package name, and every android.projects[]', () => {
    const publication = { id: 'some-module', group: 'some.group', version: '1.0.0', repository: 'local-maven-repo' };
    const raw: RawExpoModuleConfig = {
      platforms: ['android'],
      android: { name: 'renamed-project', publication, projects: [{ name: 'side-project', path: 'side', publication }] },
    };
    const projects = projectsOf('@scope/some-module', raw);
    expect(projects.map((p) => [p.name, p.path, p.prebuilt])).toEqual([
      ['renamed-project', 'android', true],
      ['side-project', 'side', true],
    ]);
    expect(projectsHolding(projects, 'android/src/main/java/A.kt').map((p) => p.name)).toEqual(['renamed-project']);
    expect(projectsHolding(projects, 'side/src/main/java/B.kt').map((p) => p.name)).toEqual(['side-project']);
    expect(projectsOf('expo-plain', { platforms: ['android'] }).map((p) => [p.name, p.prebuilt])).toEqual([['expo-plain', false]]);
  });

  // An Android file a patch changes that no linked project holds would be checked by nothing, and compiled by nothing.
  it("every patched file under an Expo module's android folder belongs to a project autolinking links", () => {
    for (const { patch, pkg, file } of patchedFiles()) {
      if (!file.startsWith('android/') || moduleConfig(pkg) === null) continue;
      expect(projectsHolding(androidProjects(pkg), file).length, `${patch}: ${pkg}/${file} is in no Android project autolinking knows`).toBeGreaterThan(0);
    }
  });

  it('builds every patched project that ships a prebuilt Android library from source', async () => {
    const patterns = await buildFromSource();
    for (const { patch, pkg, project } of patchedProjects()) {
      if (!project.prebuilt) continue;
      expect(
        patterns.some((p) => matchesWhole(p, project.name)),
        `${patch}: ${pkg} ships its Android project "${project.name}" prebuilt, so the patch is never compiled. Add "${project.name}" to expo.autolinking.android.buildFromSource in client/package.json.`,
      ).toBe(true);
    }
  });

  it('expo-notifications, whose Android builder is patched, is built from source whenever it ships prebuilt', async () => {
    const patterns = await buildFromSource();
    const projects = androidProjects('expo-notifications');
    expect(projects.length).toBeGreaterThan(0);
    for (const project of projects) {
      const fromSource = patterns.some((p) => matchesWhole(p, project.name));
      expect(!project.prebuilt || fromSource, `expo-notifications ships "${project.name}" prebuilt and client/package.json does not build it from source`).toBe(true);
    }
  });

  // Built from source is half of it: the source must be the patched one, which patch-package writes on every install
  // (the root postinstall). An install that skipped scripts compiles upstream's code just as silently.
  it('the installed source holds every line each patch adds', () => {
    for (const { patch, pkg, file, added } of patchedFiles()) {
      const installed = readFileSync(join(packageDir(pkg), file), 'utf8').replace(/\r\n/g, '\n');
      for (const line of added) expect(installed.includes(line), `${patch}: ${pkg}/${file} lacks "${line.trim()}"`).toBe(true);
    }
  });
});
