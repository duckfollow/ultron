export type SshAuthMethod = "auto" | "password" | "key";
export type SshProfile = {
  authMethod: SshAuthMethod;
  rememberPassword: boolean;
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  identityFile: string;
};
export type ConnectTarget = "tab" | "columns" | "rows";
export const newSshProfile = (): SshProfile => ({
  id: "",
  name: "",
  host: "",
  port: 22,
  username: "",
  identityFile: "",
  authMethod: "auto",
  rememberPassword: false,
});
export function profileAddress(profile: SshProfile) {
  return `${profile.username}@${profile.host.includes(":") ? `[${profile.host}]` : profile.host}:${profile.port}`;
}
