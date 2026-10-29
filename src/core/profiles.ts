import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { assertCanonicalContainment, containedProfilePath, metadataPath, slugifyProfileId } from './paths';

export interface ProfileIdentity {
  loggedIn?: boolean;
  authMethod?: string;
  email?: string;
  orgName?: string;
  orgId?: string;
  subscriptionType?: string;
  configDirectory?: string;
}

export interface Profile {
  id: string;
  label: string;
  color?: string;
  dir: string;
  managed: true;
  identity?: ProfileIdentity;
}

interface ProfileFile { version: 1; profiles: Profile[] }

export class ProfileStore {
  readonly file: string;

  constructor(readonly root: string) {
    this.file = metadataPath(root);
  }

  list(): Profile[] {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as ProfileFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.profiles)) return [];
      return parsed.profiles.filter((profile) => {
        try {
          if (profile.managed !== true || typeof profile.id !== 'string' || typeof profile.dir !== 'string') return false;
          if (resolve(profile.dir) !== containedProfilePath(this.root, profile.id) || !existsSync(profile.dir)) return false;
          assertCanonicalContainment(this.root, profile.dir);
          return true;
        } catch { return false; }
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  create(label: string, color?: string): Profile {
    const idBase = slugifyProfileId(label);
    const profiles = this.list();
    let id = idBase;
    let suffix = 2;
    while (profiles.some((profile) => profile.id === id)) id = `${idBase}-${suffix++}`;
    const dir = containedProfilePath(this.root, id);
    mkdirSync(this.root, { recursive: true });
    mkdirSync(dir, { recursive: false });
    const profile: Profile = { id, label, color, dir, managed: true };
    this.save([...profiles, profile]);
    return profile;
  }

  updateIdentity(id: string, identity: ProfileIdentity): void {
    this.save(this.list().map((profile) => profile.id === id ? { ...profile, identity } : profile));
  }

  removeMetadata(id: string): void {
    this.save(this.list().filter((profile) => profile.id !== id));
  }

  deleteManagedDirectory(profile: Profile): void {
    if (resolve(profile.dir) !== containedProfilePath(this.root, profile.id)) throw new Error('Profile directory mismatch');
    rmSync(profile.dir, { recursive: true, force: false });
    this.removeMetadata(profile.id);
  }

  private save(profiles: Profile[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ version: 1, profiles } satisfies ProfileFile, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}
