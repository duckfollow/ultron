import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import ssh2 from "ssh2";
const directory = await mkdtemp(join(tmpdir(), "ultron-ssh-test-"));
const connections = new Set();
let server;
try {
  for (const name of ["host", "client", "wrong"])
    execFileSync("/usr/bin/ssh-keygen", [
      "-q",
      "-t",
      "ed25519",
      "-N",
      "",
      "-f",
      join(directory, name),
    ]);
  const publicKey = ssh2.utils.parseKey(
    await readFile(join(directory, "client.pub")),
  );
  server = new ssh2.Server(
    { hostKeys: [await readFile(join(directory, "host"))] },
    (client) => {
      connections.add(client);
      client.on("close", () => connections.delete(client));
      client.on("error", () => {});
      let authenticatedWith = "";
      client.on("authentication", (context) => {
        const methods =
          context.username === "ultron-interactive"
            ? ["keyboard-interactive"]
            : context.username === "ultron-password"
              ? ["password"]
              : ["publickey", "password"];
        if (
          !["ultron-test", "ultron-password", "ultron-interactive"].includes(
            context.username,
          ) ||
          !methods.includes(context.method)
        ) {
          context.reject(methods);
          return;
        }
        if (context.method === "password") {
          if (context.password === "ultron-fixture-password") {
            authenticatedWith = "password";
            context.accept();
          } else context.reject(methods);
        } else if (context.method === "keyboard-interactive") {
          context.prompt([{ prompt: "Password: ", echo: false }], (answers) => {
            if (answers[0] === "ultron-fixture-password") {
              authenticatedWith = "keyboard-interactive";
              context.accept();
            } else context.reject(methods);
          });
        } else if (
          context.key.data.equals(publicKey.getPublicSSH()) &&
          (!context.signature ||
            publicKey.verify(
              context.blob,
              context.signature,
              context.hashAlgo,
            ) === true)
        ) {
          authenticatedWith = "publickey";
          context.accept();
        } else context.reject(methods);
      });
      client.on("ready", () =>
        client.on("session", (accept) => {
          const session = accept();
          session.on("pty", (accept) => accept());
          session.on("env", (accept) => accept?.());
          session.on("window-change", (accept) => accept?.());
          session.on("shell", (accept) => {
            const stream = accept();
            stream.write(`ULTRON_SSH_READY\r\nAUTH=${authenticatedWith}\r\n`);
            let input = "";
            stream.on("data", (data) => {
              input += data.toString();
              if (input.includes("ultron-ping")) {
                stream.write("ULTRON_SSH_PONG\r\n");
                input = input.replace("ultron-ping", "");
              }
              if (input.includes("exit")) {
                stream.exit(0);
                stream.end();
              }
            });
          });
        }),
      );
    },
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const host = (await readFile(join(directory, "host.pub"), "utf8"))
    .trim()
    .split(" ")
    .slice(0, 2)
    .join(" ");
  const wrong = (await readFile(join(directory, "wrong.pub"), "utf8"))
    .trim()
    .split(" ")
    .slice(0, 2)
    .join(" ");
  await writeFile(
    join(directory, "known_hosts"),
    `[127.0.0.1]:${port} ${host}\n`,
  );
  await writeFile(
    join(directory, "wrong_hosts"),
    `[127.0.0.1]:${port} ${wrong}\n`,
  );
  const child = spawn(
    "cargo",
    [
      "test",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--lib",
      "ssh_real_local_fixture",
      "--",
      "--ignored",
      "--nocapture",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        ULTRON_TEST_SSH_PORT: String(port),
        ULTRON_TEST_SSH_DIR: directory,
      },
    },
  );
  const timeout = setTimeout(() => child.kill("SIGKILL"), 120000);
  const [code] = await once(child, "exit");
  clearTimeout(timeout);
  if (code !== 0) process.exitCode = 1;
} finally {
  for (const client of connections) client.end();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
