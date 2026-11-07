import { create } from 'zustand';
import { devLog, IS_TAURI } from './platform';

export interface UpdateInfo {
  version: string;
  notes: string;
  date: string;
}

type Phase = 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'error';

interface UpdaterState {
  phase: Phase;
  current: string;
  info: UpdateInfo | null;
  /** 0..1, or -1 when the server did not report a total size */
  progress: number;
  error: string | null;

  boot: () => void;
  check: (silent?: boolean) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
}

/* The updater handle has to survive between the check and the install — asking
 * the server twice would be wasteful and could race a release being replaced. */
let handle: { downloadAndInstall: (cb: (e: unknown) => void) => Promise<void> } | null = null;

async function runningVersion(): Promise<string> {
  if (!IS_TAURI) return 'dev';
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    return await getVersion();
  } catch {
    return 'unknown';
  }
}

export const useUpdater = create<UpdaterState>((set, get) => ({
  phase: 'idle',
  current: '',
  info: null,
  progress: 0,
  error: null,

  /** Called once on mount: shows the version, then checks quietly after the
   *  studio has settled so a slow network never delays the first frame. */
  boot: () => {
    void runningVersion().then((v) => set({ current: v }));
    if (!IS_TAURI) return;
    window.setTimeout(() => void get().check(true), 4000);
  },

  check: async (silent) => {
    if (!IS_TAURI) {
      set({ phase: 'idle' });
      return;
    }
    set({ phase: 'checking', error: null });
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update) {
        handle = null;
        set({ phase: 'idle', info: null, progress: 0 });
        if (!silent) await devLog('update check: already up to date');
        return;
      }
      handle = update as unknown as typeof handle;
      const info: UpdateInfo = {
        version: update.version,
        notes: update.body ?? '',
        date: update.date ?? '',
      };
      set({ phase: 'available', info, progress: 0 });
      await devLog(`update available: ${info.version} (running ${get().current})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // a silent background check must never shout — no release published yet
      // is the normal state of a fresh repository
      set({
        phase: silent ? 'idle' : 'error',
        error: message,
      });
      if (!silent) await devLog(`update check failed: ${message}`);
    }
  },

  install: async () => {
    if (!handle) return;
    set({ phase: 'downloading', progress: 0, error: null });
    try {
      let total = 0;
      let received = 0;
      await handle.downloadAndInstall((event: unknown) => {
        const e = event as {
          event: string;
          data?: { contentLength?: number; chunkLength?: number };
        };
        if (e.event === 'Started') {
          total = e.data?.contentLength ?? 0;
          set({ phase: 'downloading', progress: 0 });
        } else if (e.event === 'Progress') {
          received += e.data?.chunkLength ?? 0;
          set({ progress: total > 0 ? received / total : -1 });
        } else if (e.event === 'Finished') {
          set({ phase: 'installing', progress: 1 });
        }
      });

      await devLog(`update installed: ${get().info?.version ?? '?'} — relaunching`);

      // the plugin swaps the bundle on disk; the process has to restart for the
      // new binary to be the one that is running
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) {
      set({
        phase: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  dismiss: () => set({ phase: 'idle', info: null, error: null, progress: 0 }),
}));
