import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { SshProfile } from "./ssh-model";
export type PortableConnection = Omit<SshProfile, "id" | "rememberPassword">;
export type ConnectionFile = {
  format: "ultron-connections";
  version: 1;
  connections: PortableConnection[];
};
export type ImportPreview = {
  transfer: ConnectionFile;
  revision: string;
  existingCount: number;
  conflicts: (string | null)[];
  encrypted: boolean;
  passwordCount: number;
  fileDigest: string | null;
};
export type ImportResult = {
  profiles: SshProfile[];
  added: number;
  replaced: number;
  skipped: number;
  passwordsImported: number;
};
export type ImportInspection = {
  locked: boolean;
  preview: ImportPreview | null;
};
export type EncryptedImportSource = {
  filePath: string;
  fileDigest: string;
  backupPassword: string;
};
export const connectionTransferServices = {
  chooseFile: () =>
    open({
      title: "Import Ultron connections",
      multiple: false,
      directory: false,
      filters: [{ name: "Ultron connections", extensions: ["json"] }],
    }),
  chooseDestination: (defaultPath: string) =>
    save({
      title: "Export Ultron connections",
      defaultPath,
      filters: [{ name: "Ultron connections", extensions: ["json"] }],
    }),
  preview: (filePath: string, backupPassword: string | null = null) =>
    invoke<ImportInspection>("preview_ssh_import", {
      filePath,
      backupPassword,
    }),
  import: (
    preview: ImportPreview,
    policy: "skip" | "replace",
    source: EncryptedImportSource | null = null,
  ) =>
    invoke<ImportResult>("import_ssh_connections", {
      transfer: preview.transfer,
      revision: preview.revision,
      policy,
      source,
    }),
  export: (
    filePath: string,
    group: string | null,
    backupPassword: string | null = null,
  ) =>
    invoke<number>("export_ssh_connections", {
      filePath,
      group,
      backupPassword,
    }),
};
export type ConnectionTransferServices = typeof connectionTransferServices;
