import type { OutFile } from './export';

// File access. Inside the desktop app (Tauri) this uses native save/open dialogs through
// small Rust commands; in a plain browser it falls back to downloads and a file picker.

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

function download(name: string, data: Uint8Array) {
  const url = URL.createObjectURL(new Blob([data as BlobPart]));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Saves one file. Returns where it went, or null if cancelled. */
export async function saveFile(name: string, data: Uint8Array): Promise<string | null> {
  if (isTauri()) return invoke<string | null>('save_file', { name, data: Array.from(data) });
  download(name, data);
  return name;
}

/** Saves several files into a folder the user picks (or as separate downloads in a browser). */
export async function saveFiles(folderName: string, files: OutFile[]): Promise<string | null> {
  if (isTauri()) return invoke<string | null>('save_files', { folderName, files: files.map((f) => ({ name: f.name, data: Array.from(f.data) })) });
  for (const f of files) download(f.name, f.data);
  return 'Downloads';
}

export async function openTextFile(): Promise<{ name: string; text: string } | null> {
  if (isTauri()) return invoke<{ name: string; text: string } | null>('open_project', {});
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.lpcar,.json';
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, text: await f.text() } : null);
    };
    input.click();
  });
}
