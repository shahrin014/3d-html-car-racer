import { describe, expect, it } from 'vitest';
import {
  CACHE_NAME_PREFIX,
  CACHE_VERSION_TOKEN,
  cacheVersionFor,
  stampCacheVersion,
  type BuildFile,
} from './sw-cache-version.ts';

const serviceWorkerSource = `const CACHE_VERSION = '${CACHE_VERSION_TOKEN}';\n`;

function file(path: string, contents = path): BuildFile {
  return { path, contents };
}

describe('service worker cache version', () => {
  it('is stable for the same build files', () => {
    const files = [file('index.html'), file('assets/index-abc.js'), file('sw.js')];
    expect(cacheVersionFor(files)).toBe(cacheVersionFor([...files]));
  });

  it('ignores file order so the version reflects content, not iteration', () => {
    expect(cacheVersionFor([file('a.js'), file('b.js')])).toBe(
      cacheVersionFor([file('b.js'), file('a.js')]),
    );
  });

  it('changes when a hashed asset changes', () => {
    expect(cacheVersionFor([file('assets/index-abc.js')])).not.toBe(
      cacheVersionFor([file('assets/index-def.js')]),
    );
  });

  it('changes when the core asset set changes', () => {
    expect(cacheVersionFor([file('index.html'), file('sw.js')])).not.toBe(
      cacheVersionFor([
        file('index.html'),
        file('sw.js'),
        file('icons/icon-192.png'),
      ]),
    );
  });

  it('changes when a file keeps its name but its content changes', () => {
    expect(cacheVersionFor([file('sw.js', 'one')])).not.toBe(
      cacheVersionFor([file('sw.js', 'two')]),
    );
  });

  it('distinguishes identical content at different paths', () => {
    expect(cacheVersionFor([file('a.js', 'same')])).not.toBe(
      cacheVersionFor([file('b.js', 'same')]),
    );
  });

  it('stamps the cache name with the prefix and version', () => {
    const stamped = stampCacheVersion(serviceWorkerSource, 'abc123');
    expect(stamped).toContain(`'${CACHE_NAME_PREFIX}-abc123'`);
    expect(stamped).not.toContain(CACHE_VERSION_TOKEN);
  });

  it('fails the build instead of shipping an unversioned cache', () => {
    expect(() =>
      stampCacheVersion("const CACHE_VERSION = 'neon-racer-v1';", 'x'),
    ).toThrow(CACHE_VERSION_TOKEN);
  });
});
