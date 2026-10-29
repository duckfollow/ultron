export type SshAuthMethod = "auto" | "password" | "key";
export type SshProfile = {
  authMethod: SshAuthMethod;
  rememberPassword: boolean;
  id: string;
  name: string;
  group?: string;
  host: string;
  port: number;
  username: string;
  identityFile: string;
};
export type ConnectTarget = "tab" | "columns" | "rows";
export const newSshProfile = (): SshProfile => ({
  id: "",
  name: "",
  group: "",
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

export function groupSshProfiles(profiles: SshProfile[], order: string[] = []) {
  const groups = new Map<string, SshProfile[]>();
  for (const profile of profiles) {
    const group = profile.group?.trim() ?? "";
    groups.set(group, [...(groups.get(group) ?? []), profile]);
  }
  return [...groups]
    .sort(([a], [b]) => {
      const ai = order.indexOf(a),
        bi = order.indexOf(b);
      if (ai >= 0 || bi >= 0)
        return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
      return !a ? 1 : !b ? -1 : a.localeCompare(b);
    })
    .map(([name, profiles]) => ({ name, profiles }));
}
